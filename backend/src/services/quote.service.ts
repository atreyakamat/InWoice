import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { optDate, optStr } from '../lib/util';
import { buildInvoiceLines, createInvoice, invoiceItemInput } from './invoice.service';
import { getSettings } from './settings.service';

type Tx = Prisma.TransactionClient;

/**
 * Quotations (estimates). A quote has the same lines and GST maths as an invoice but no
 * stock or accounting effect. Accepting it and converting creates a normal invoice.
 */

export const quoteInput = z.object({
  customerId: z.string().uuid(),
  date: optDate,
  validUntil: optDate,
  placeOfSupply: optStr,
  discount: z.coerce.number().min(0).default(0),
  shippingCost: z.coerce.number().min(0).default(0),
  notes: optStr,
  items: z.array(invoiceItemInput).min(1, 'Add at least one line item'),
});

export type QuoteInput = z.infer<typeof quoteInput>;

export const quoteInclude = {
  customer: true,
  items: { orderBy: { id: 'asc' } },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
} satisfies Prisma.QuoteInclude;

const DAY = 86_400_000;
const today0 = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** EXPIRED is derived for open quotes past their validity date, so it never goes stale. */
export function quoteDisplayStatus(q: { status: string; validUntil: Date | null }, now = today0()) {
  if ((q.status === 'DRAFT' || q.status === 'SENT') && q.validUntil && q.validUntil < now) return 'EXPIRED';
  return q.status;
}

export const withQuoteDerived = <T extends { status: string; validUntil: Date | null }>(q: T) => ({ ...q, displayStatus: quoteDisplayStatus(q) });

async function nextQuoteNumber(tx: Tx): Promise<string> {
  const settings = await getSettings();
  for (let guard = 0; guard < 10_000; guard++) {
    const updated = await tx.businessSettings.update({ where: { id: settings.id }, data: { nextQuoteNumber: { increment: 1 } } });
    const number = `${updated.quotePrefix}${String(updated.nextQuoteNumber - 1).padStart(4, '0')}`;
    if (!(await tx.quote.count({ where: { quoteNumber: number } }))) return number;
  }
  throw badRequest('Could not find a free quote number. Check the quote prefix and counter in Settings.');
}

async function linesFor(tx: Tx, input: QuoteInput) {
  const settings = await getSettings();
  const { lines, totals } = await buildInvoiceLines(tx, { ...input, dueDate: null, issue: false }, settings);
  return { lines, totals, settings };
}

export async function createQuote(input: QuoteInput) {
  return prisma.$transaction(async (tx) => {
    const { lines, totals, settings } = await linesFor(tx, input);
    const date = input.date ?? new Date();
    const quote = await tx.quote.create({
      data: {
        quoteNumber: await nextQuoteNumber(tx),
        customerId: input.customerId,
        date,
        validUntil: input.validUntil !== undefined ? input.validUntil : new Date(date.getTime() + settings.quoteValidityDays * DAY),
        notes: input.notes ?? null,
        ...totals,
        items: { create: lines },
      },
    });
    await tx.activity.create({
      data: { customerId: quote.customerId, eventType: 'QUOTE_CREATED', title: `Quote ${quote.quoteNumber} created`, referenceType: 'QUOTE', referenceId: quote.id },
    });
    return tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude });
  });
}

const EDITABLE = ['DRAFT', 'SENT'];

export async function updateQuote(id: string, input: QuoteInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findUnique({ where: { id } });
    if (!existing) throw notFound('Quote');
    if (!EDITABLE.includes(existing.status)) throw badRequest(`A ${existing.status.toLowerCase()} quote can't be edited. Duplicate it instead.`);
    const { lines, totals } = await linesFor(tx, input);
    await tx.quoteItem.deleteMany({ where: { quoteId: id } });
    await tx.quote.update({
      where: { id },
      data: {
        customerId: input.customerId,
        date: input.date ?? existing.date,
        validUntil: input.validUntil !== undefined ? input.validUntil : existing.validUntil,
        notes: input.notes ?? null,
        ...totals,
        items: { create: lines },
      },
    });
    return tx.quote.findUniqueOrThrow({ where: { id }, include: quoteInclude });
  });
}

/** Move a quote along: SENT, ACCEPTED or DECLINED (by you, or by the customer in the portal). */
export async function setQuoteStatus(id: string, status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED', by: 'USER' | 'CUSTOMER' = 'USER') {
  return prisma.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({ where: { id } });
    if (!q) throw notFound('Quote');
    if (q.status === 'CONVERTED') throw badRequest('This quote has already been converted to an invoice');
    if (by === 'CUSTOMER') {
      if (q.status !== 'SENT') throw badRequest('This quote is not open for a response');
      if (quoteDisplayStatus(q) === 'EXPIRED') throw badRequest('This quote has expired. Please ask for a new one.');
    }
    const now = new Date();
    await tx.quote.update({
      where: { id },
      data: {
        status,
        sentAt: status === 'SENT' ? q.sentAt ?? now : q.sentAt,
        respondedAt: status === 'ACCEPTED' || status === 'DECLINED' ? now : null,
      },
    });
    if (q.status !== status) {
      const who = by === 'CUSTOMER' ? ' by the customer' : '';
      await tx.activity.create({
        data: { customerId: q.customerId, eventType: `QUOTE_${status}`, title: `Quote ${q.quoteNumber} ${status.toLowerCase()}${who}`, referenceType: 'QUOTE', referenceId: q.id },
      });
    }
    return tx.quote.findUniqueOrThrow({ where: { id }, include: quoteInclude });
  });
}

/** Turn a quote into an invoice (a draft, or issued straight away). */
export async function convertQuote(id: string, { issue = false } = {}) {
  const q = await prisma.quote.findUnique({ where: { id }, include: { items: { orderBy: { id: 'asc' } } } });
  if (!q) throw notFound('Quote');
  if (q.status === 'CONVERTED' || q.invoiceId) throw badRequest('This quote has already been converted to an invoice');
  if (q.status === 'DECLINED') throw badRequest('This quote was declined. Mark it accepted first if the customer changed their mind.');
  const invoice = await createInvoice({
    customerId: q.customerId,
    date: null,
    dueDate: null,
    placeOfSupply: q.placeOfSupply,
    discount: q.discount,
    shippingCost: q.shippingCost,
    notes: q.notes ? `${q.notes}\n(From quote ${q.quoteNumber})` : `From quote ${q.quoteNumber}`,
    issue,
    items: q.items.map((i) => ({
      type: i.type as 'PRODUCT' | 'PACK' | 'CUSTOM',
      itemId: i.itemId,
      name: i.name,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate,
    })),
  });
  // Claim the quote only if nobody converted it in the meantime.
  const claimed = await prisma.quote.updateMany({ where: { id, invoiceId: null }, data: { invoiceId: invoice.id, status: 'CONVERTED', respondedAt: q.respondedAt ?? new Date() } });
  if (!claimed.count) {
    if (invoice.status === 'DRAFT') await prisma.invoice.delete({ where: { id: invoice.id } });
    throw badRequest('This quote has already been converted to an invoice');
  }
  await prisma.activity.create({
    data: { customerId: q.customerId, eventType: 'QUOTE_CONVERTED', title: `Quote ${q.quoteNumber} converted to invoice ${invoice.invoiceNumber}`, referenceType: 'QUOTE', referenceId: q.id },
  });
  return invoice;
}

export async function duplicateQuote(id: string) {
  const q = await prisma.quote.findUnique({ where: { id }, include: { items: { orderBy: { id: 'asc' } } } });
  if (!q) throw notFound('Quote');
  return createQuote({
    customerId: q.customerId,
    date: null,
    validUntil: undefined,
    placeOfSupply: q.placeOfSupply,
    discount: q.discount,
    shippingCost: q.shippingCost,
    notes: q.notes,
    items: q.items.map((i) => ({
      type: i.type as 'PRODUCT' | 'PACK' | 'CUSTOM',
      itemId: i.itemId,
      name: i.name,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate,
    })),
  });
}

export async function deleteQuote(id: string) {
  const q = await prisma.quote.findUnique({ where: { id } });
  if (!q) throw notFound('Quote');
  if (q.status === 'CONVERTED') throw badRequest('A converted quote is kept with its invoice and cannot be deleted');
  await prisma.quote.delete({ where: { id } });
}
