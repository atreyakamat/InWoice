import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { optDate, optStr } from '../lib/util';
import { buildInvoiceLines, createInvoice, invoiceItemInput } from './invoice.service';
import { unitOf } from '../lib/units';
import { emailInvoice } from './documents.service';
import { isEmailConfigured } from './email.service';
import { getSettings } from './settings.service';

/**
 * Recurring invoices: a schedule (weekly, monthly, quarterly, yearly, every N periods)
 * that creates the same invoice each period, issues it and optionally emails it.
 *
 * Run dates are always computed from the start date (occurrence N), so a schedule that
 * starts on the 31st runs on the last day of shorter months and goes back to the 31st
 * afterwards. Each run claims its occurrence with a conditional update first, so two
 * scheduler ticks (or a restart) can never create the same invoice twice.
 */

export const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

const MONTHS: Record<Exclude<Frequency, 'WEEKLY'>, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };
const MAX_CATCH_UP = 12;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Date of occurrence `n` (0 = the start date). Month ends are clamped, never drifted. */
export function occurrence(start: Date, frequency: Frequency, interval: number, n: number): Date {
  const s = startOfDay(start);
  if (frequency === 'WEEKLY') return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7 * interval * n);
  const months = s.getMonth() + MONTHS[frequency] * interval * n;
  const lastDay = new Date(s.getFullYear(), months + 1, 0).getDate();
  return new Date(s.getFullYear(), months, Math.min(s.getDate(), lastDay));
}

/** First occurrence on or after `day`. */
export function firstIndexOnOrAfter(start: Date, frequency: Frequency, interval: number, day: Date) {
  const target = startOfDay(day);
  let n = 0;
  while (occurrence(start, frequency, interval, n) < target && n < 10_000) n++;
  return n;
}

export const recurringInput = z.object({
  name: z.string().trim().min(1, 'Give the schedule a name, e.g. "Monthly retainer"').max(80),
  customerId: z.string().uuid(),
  frequency: z.enum(FREQUENCIES),
  interval: z.coerce.number().int().min(1).max(12).default(1),
  startDate: z.coerce.date(),
  endDate: optDate,
  paymentTermsDays: z.union([z.literal(''), z.coerce.number().int().min(0).max(365)]).optional().nullable().transform((v) => (v === '' || v === undefined ? null : v)),
  autoIssue: z.boolean().default(true),
  autoEmail: z.boolean().default(false),
  placeOfSupply: optStr,
  discount: z.coerce.number().min(0).default(0),
  shippingCost: z.coerce.number().min(0).default(0),
  notes: optStr,
  items: z.array(invoiceItemInput).min(1, 'Add at least one line item'),
});

export type RecurringInput = z.infer<typeof recurringInput>;

export const recurringInclude = {
  customer: { select: { id: true, name: true, email: true, state: true } },
  items: { orderBy: { sortOrder: 'asc' } },
  invoices: { orderBy: { date: 'desc' }, take: 12, select: { id: true, invoiceNumber: true, date: true, dueDate: true, grandTotal: true, status: true, amountPaid: true, amountCredited: true } },
} satisfies Prisma.RecurringInvoiceInclude;

type Schedule = Prisma.RecurringInvoiceGetPayload<{ include: { items: true } }>;

function itemRows(input: RecurringInput) {
  return input.items.map((i, idx) => ({
    type: i.type,
    itemId: i.type === 'CUSTOM' ? null : i.itemId ?? null,
    name: i.name ?? null,
    hsnCode: i.hsnCode ?? null,
    quantity: i.quantity,
    unit: i.unit ?? null, // null = the product's own unit at each run
    details: i.details ?? null,
    unitPrice: i.unitPrice ?? null,
    taxRate: i.taxRate ?? null,
    sortOrder: idx,
  }));
}

/** Check the lines resolve now (missing products, prices) so problems show up when saving, not at 2 a.m. */
async function validateLines(input: RecurringInput) {
  if (input.endDate && startOfDay(input.endDate) < startOfDay(input.startDate)) throw badRequest('The end date must be on or after the start date');
  await buildInvoiceLines(prisma, { ...input, date: null, dueDate: null, issue: false }, await getSettings());
}

export async function createRecurring(input: RecurringInput) {
  await validateLines(input);
  const start = startOfDay(input.startDate);
  const r = await prisma.recurringInvoice.create({
    data: {
      name: input.name,
      customerId: input.customerId,
      frequency: input.frequency,
      interval: input.interval,
      startDate: start,
      endDate: input.endDate ? startOfDay(input.endDate) : null,
      nextIndex: 0,
      nextRunDate: start,
      paymentTermsDays: input.paymentTermsDays,
      autoIssue: input.autoIssue,
      autoEmail: input.autoIssue && input.autoEmail,
      placeOfSupply: input.placeOfSupply ?? null,
      discount: input.discount,
      shippingCost: input.shippingCost,
      notes: input.notes ?? null,
      items: { create: itemRows(input) },
    },
  });
  return prisma.recurringInvoice.findUniqueOrThrow({ where: { id: r.id }, include: recurringInclude });
}

export async function updateRecurring(id: string, input: RecurringInput) {
  const existing = await prisma.recurringInvoice.findUnique({ where: { id } });
  if (!existing) throw notFound('Recurring invoice');
  await validateLines(input);
  const start = startOfDay(input.startDate);
  const scheduleChanged =
    start.getTime() !== existing.startDate.getTime() || input.frequency !== existing.frequency || input.interval !== existing.interval;
  // A changed schedule restarts from the next occurrence that hasn't happened yet.
  const nextIndex = scheduleChanged
    ? firstIndexOnOrAfter(start, input.frequency, input.interval, existing.runCount ? new Date() : start)
    : existing.nextIndex;
  const nextRunDate = occurrence(start, input.frequency, input.interval, nextIndex);
  const endDate = input.endDate ? startOfDay(input.endDate) : null;
  const ended = endDate !== null && nextRunDate > endDate;
  await prisma.$transaction([
    prisma.recurringInvoiceItem.deleteMany({ where: { recurringId: id } }),
    prisma.recurringInvoice.update({
      where: { id },
      data: {
        name: input.name,
        customerId: input.customerId,
        frequency: input.frequency,
        interval: input.interval,
        startDate: start,
        endDate,
        nextIndex,
        nextRunDate,
        status: ended ? 'ENDED' : existing.status === 'ENDED' ? 'ACTIVE' : existing.status,
        paymentTermsDays: input.paymentTermsDays,
        autoIssue: input.autoIssue,
        autoEmail: input.autoIssue && input.autoEmail,
        placeOfSupply: input.placeOfSupply ?? null,
        discount: input.discount,
        shippingCost: input.shippingCost,
        notes: input.notes ?? null,
        items: { create: itemRows(input) },
      },
    }),
  ]);
  return prisma.recurringInvoice.findUniqueOrThrow({ where: { id }, include: recurringInclude });
}

export async function pauseRecurring(id: string) {
  const r = await prisma.recurringInvoice.findUnique({ where: { id } });
  if (!r) throw notFound('Recurring invoice');
  if (r.status === 'ENDED') throw badRequest('This schedule has ended');
  await prisma.recurringInvoice.update({ where: { id }, data: { status: 'PAUSED' } });
  return prisma.recurringInvoice.findUniqueOrThrow({ where: { id }, include: recurringInclude });
}

/** Resume from the next date that hasn't passed: periods missed while paused are skipped, not billed in a burst. */
export async function resumeRecurring(id: string, now = new Date()) {
  const r = await prisma.recurringInvoice.findUnique({ where: { id } });
  if (!r) throw notFound('Recurring invoice');
  if (r.status === 'ACTIVE') return prisma.recurringInvoice.findUniqueOrThrow({ where: { id }, include: recurringInclude });
  const f = r.frequency as Frequency;
  const nextIndex = Math.max(r.nextIndex, firstIndexOnOrAfter(r.startDate, f, r.interval, now));
  const nextRunDate = occurrence(r.startDate, f, r.interval, nextIndex);
  if (r.endDate && nextRunDate > r.endDate) throw badRequest('The schedule has passed its end date. Change the end date to resume it.');
  await prisma.recurringInvoice.update({ where: { id }, data: { status: 'ACTIVE', nextIndex, nextRunDate, lastError: null } });
  return prisma.recurringInvoice.findUniqueOrThrow({ where: { id }, include: recurringInclude });
}

/**
 * Create the invoice for the schedule's next occurrence, dated `invoiceDate`.
 * Returns null when another run already claimed this occurrence.
 */
async function runOccurrence(r: Schedule, invoiceDate: Date) {
  const f = r.frequency as Frequency;
  const nextIndex = r.nextIndex + 1;
  const nextRunDate = occurrence(r.startDate, f, r.interval, nextIndex);
  const ended = r.endDate !== null && nextRunDate > r.endDate;

  const claim = await prisma.recurringInvoice.updateMany({
    where: { id: r.id, nextIndex: r.nextIndex, status: { not: 'ENDED' } },
    data: { nextIndex, nextRunDate, ...(ended ? { status: 'ENDED' } : {}) },
  });
  if (!claim.count) return null;

  const settings = await getSettings();
  const terms = r.paymentTermsDays ?? settings.paymentTermsDays;
  let invoice;
  try {
    invoice = await createInvoice(
      {
        customerId: r.customerId,
        date: invoiceDate,
        dueDate: new Date(startOfDay(invoiceDate).getTime() + terms * 86_400_000),
        placeOfSupply: r.placeOfSupply,
        discount: r.discount,
        shippingCost: r.shippingCost,
        notes: r.notes,
        issue: r.autoIssue,
        items: r.items.map((i) => ({
          type: i.type as 'PRODUCT' | 'PACK' | 'CUSTOM',
          itemId: i.itemId,
          name: i.name,
          hsnCode: i.hsnCode,
          quantity: i.quantity,
          unit: i.unit ? unitOf(i.unit) : undefined,
          details: i.details,
          unitPrice: i.unitPrice ?? undefined,
          taxRate: i.taxRate,
        })),
      },
      { recurringId: r.id },
    );
  } catch (err) {
    // Give the occurrence back so the next tick retries it, and show why it failed.
    await prisma.recurringInvoice.updateMany({
      where: { id: r.id, nextIndex },
      data: { nextIndex: r.nextIndex, nextRunDate: r.nextRunDate, status: r.status, lastError: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  let lastError: string | null = null;
  if (r.autoEmail && r.autoIssue) {
    try {
      if (!(await isEmailConfigured())) throw new Error('email is not configured');
      await emailInvoice(invoice.id);
    } catch (err) {
      lastError = `Invoice ${invoice.invoiceNumber} was created but not emailed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  await prisma.recurringInvoice.update({ where: { id: r.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date(), lastError } });
  return invoice;
}

/** Create the next invoice now (dated today) and move the schedule on by one period. */
export async function runRecurringNow(id: string) {
  const r = await prisma.recurringInvoice.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
  if (!r) throw notFound('Recurring invoice');
  if (r.status === 'ENDED') throw badRequest('This schedule has ended');
  const invoice = await runOccurrence(r, new Date());
  if (!invoice) throw badRequest('This occurrence was just created by another run. Refresh and try again.');
  return invoice;
}

/**
 * Scheduler job: create every invoice that is due. If the server was off, missed periods
 * are created (dated on their own period dates) up to MAX_CATCH_UP per schedule.
 */
export async function runRecurringInvoices(now = new Date()) {
  const due = await prisma.recurringInvoice.findMany({
    where: { status: 'ACTIVE', nextRunDate: { lte: now } },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { nextRunDate: 'asc' },
  });
  const created: string[] = [];
  const failed: { schedule: string; error: string }[] = [];
  for (const first of due) {
    let r: Schedule | null = first;
    for (let i = 0; r && i < MAX_CATCH_UP && r.status === 'ACTIVE' && r.nextRunDate <= now; i++) {
      if (r.endDate && r.nextRunDate > r.endDate) {
        await prisma.recurringInvoice.update({ where: { id: r.id }, data: { status: 'ENDED' } });
        break;
      }
      try {
        const inv = await runOccurrence(r, r.nextRunDate);
        if (!inv) break;
        created.push(inv.invoiceNumber);
      } catch (err) {
        failed.push({ schedule: r.name, error: err instanceof Error ? err.message : String(err) });
        break;
      }
      r = await prisma.recurringInvoice.findUnique({ where: { id: r.id }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    }
  }
  return { created, failed };
}
