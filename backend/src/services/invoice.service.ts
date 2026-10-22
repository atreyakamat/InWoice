import type { BusinessSettings, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { optDate, optStr, round2 } from '../lib/util';
import { businessStateCode, placeOfSupplyCode, stateLabel } from '../lib/gst';
import { assertOpenPeriod, getSettings } from './settings.service';
import { assertWithinPlan } from './platform.service';
import { commitStockForInvoice, releaseStockForInvoice } from './stock.service';

type Tx = Prisma.TransactionClient;

export const invoiceItemInput = z.object({
  type: z.enum(['PRODUCT', 'PACK', 'CUSTOM']).default('CUSTOM'),
  itemId: optStr,
  name: optStr,
  hsnCode: optStr,
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional().nullable(),
});

export const invoiceInput = z.object({
  customerId: z.string().uuid(),
  date: optDate,
  dueDate: optDate,
  placeOfSupply: optStr,
  discount: z.coerce.number().min(0).default(0),
  shippingCost: z.coerce.number().min(0).default(0),
  notes: optStr,
  items: z.array(invoiceItemInput).min(1, 'Add at least one line item'),
  issue: z.boolean().optional(), // true => issue immediately instead of saving a draft
});

export type InvoiceInput = z.infer<typeof invoiceInput>;

export const paymentInput = z
  .object({
    amount: z.coerce.number().positive(),
    // TDS the customer deducted: settles the invoice but isn't received in cash (claim it via Form 26AS).
    tdsAmount: z.coerce.number().min(0).default(0),
    paymentMethod: z.enum(['UPI', 'BANK_TRANSFER', 'CASH', 'CARD', 'CHEQUE', 'OTHER']).default('UPI'),
    paymentDate: optDate,
    referenceId: optStr,
    notes: optStr,
  })
  .refine((p) => p.tdsAmount <= p.amount, { message: 'TDS cannot be more than the amount settled', path: ['tdsAmount'] });

/** Resolve catalog lines and compute GST-aware totals. Pure apart from catalog lookups. */
export async function buildInvoiceLines(db: Tx | typeof prisma, input: InvoiceInput, settings: BusinessSettings) {
  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw notFound('Customer');

  const lines = [];
  for (const item of input.items) {
    let name = item.name ?? '';
    let unitPrice = item.unitPrice;
    let hsnCode = item.hsnCode ?? null;
    let taxRate = item.taxRate ?? null;

    if (item.type === 'PRODUCT' || item.type === 'PACK') {
      if (!item.itemId) throw badRequest(`${item.type.toLowerCase()} line is missing itemId`);
      const ref =
        item.type === 'PRODUCT'
          ? await db.product.findUnique({ where: { id: item.itemId } })
          : await db.pack.findUnique({ where: { id: item.itemId } });
      if (!ref) throw notFound(item.type === 'PRODUCT' ? 'Product' : 'Pack');
      name = name || ref.name;
      unitPrice = unitPrice ?? ref.price;
      hsnCode = hsnCode ?? ref.hsnCode;
      taxRate = taxRate ?? ref.taxRate;
    }
    if (!name) throw badRequest('Each custom line needs a name');
    if (unitPrice === undefined) throw badRequest(`Line "${name}" needs a unit price`);

    lines.push({
      type: item.type,
      itemId: item.type === 'CUSTOM' ? null : item.itemId ?? null,
      name,
      hsnCode,
      quantity: item.quantity,
      unitPrice: round2(unitPrice),
      taxRate: taxRate ?? settings.defaultTaxRate,
      total: round2(item.quantity * unitPrice),
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const discount = Math.min(round2(input.discount), subtotal);
  const discountRatio = subtotal > 0 ? (subtotal - discount) / subtotal : 0;

  // Tax is charged on the discounted value, apportioned per line.
  const withTax = lines.map((l) => ({ ...l, taxAmount: round2(l.total * discountRatio * (l.taxRate / 100)) }));
  const taxAmount = round2(withTax.reduce((s, l) => s + l.taxAmount, 0));

  // GST split: same state (or unknown) => CGST + SGST, different state => IGST.
  // States are compared by GST state code so "Tamil Nadu", "TN" and a 33... GSTIN all match;
  // free-text names that aren't recognised fall back to a plain comparison.
  const posCode = placeOfSupplyCode(input.placeOfSupply, customer.state, customer.gstin);
  const placeOfSupply = input.placeOfSupply ?? customer.state ?? (posCode ? stateLabel(posCode) : null);
  const homeCode = businessStateCode(settings.state, settings.gstNumber);
  const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
  const interState =
    homeCode && posCode
      ? homeCode !== posCode
      : Boolean(settings.state && placeOfSupply && norm(settings.state) !== norm(placeOfSupply));
  const igst = interState ? taxAmount : 0;
  const cgst = interState ? 0 : round2(taxAmount / 2);
  const sgst = interState ? 0 : round2(taxAmount - cgst);

  const shippingCost = round2(input.shippingCost);
  const grandTotal = round2(subtotal - discount + taxAmount + shippingCost);

  return {
    lines: withTax,
    totals: { subtotal, discount, taxAmount, cgst, sgst, igst, shippingCost, grandTotal, placeOfSupply },
  };
}

async function nextInvoiceNumber(tx: Tx): Promise<string> {
  const settings = await getSettings();
  // Atomic increment so concurrent requests never get the same number. If the counter
  // was set back (e.g. in Settings) onto numbers already used, skip past them.
  for (let guard = 0; guard < 10_000; guard++) {
    const updated = await tx.businessSettings.update({
      where: { id: settings.id },
      data: { nextInvoiceNumber: { increment: 1 } },
    });
    const number = `${updated.invoicePrefix}${String(updated.nextInvoiceNumber - 1).padStart(4, '0')}`;
    if (!(await tx.invoice.count({ where: { invoiceNumber: number } }))) return number;
  }
  throw badRequest('Could not find a free invoice number. Check the invoice prefix and counter in Settings.');
}

export const invoiceInclude = {
  customer: true,
  items: true,
  payments: { orderBy: { paymentDate: 'asc' } },
  fulfillment: true,
  creditNotes: { orderBy: { createdAt: 'asc' }, include: { items: true } },
} satisfies Prisma.InvoiceInclude;

/**
 * OVERDUE is derived rather than stored so it never goes stale. CREDITED marks an invoice
 * settled entirely by credit notes (stored as PAID, since nothing more is due).
 */
export function displayStatus(inv: { status: string; dueDate: Date | null; amountPaid?: number; amountCredited?: number }): string {
  if ((inv.status === 'PENDING' || inv.status === 'PARTIAL') && inv.dueDate && inv.dueDate < startOfToday()) {
    return 'OVERDUE';
  }
  if (inv.status === 'PAID' && (inv.amountPaid ?? 0) < 0.005 && (inv.amountCredited ?? 0) > 0) return 'CREDITED';
  return inv.status;
}

/** What the customer still owes: total less payments and credit notes (never negative). */
export function balanceOf(inv: { grandTotal: number; amountPaid: number; amountCredited?: number }) {
  return Math.max(0, round2(inv.grandTotal - inv.amountPaid - (inv.amountCredited ?? 0)));
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function withDerived<T extends { status: string; dueDate: Date | null; grandTotal: number; amountPaid: number; amountCredited?: number }>(inv: T) {
  return { ...inv, displayStatus: displayStatus(inv), balanceDue: balanceOf(inv) };
}

async function logActivity(tx: Tx, customerId: string, eventType: string, title: string, invoiceId: string) {
  await tx.activity.create({
    data: { customerId, eventType, title, referenceType: 'INVOICE', referenceId: invoiceId },
  });
}

async function issueInTx(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw notFound('Invoice');
  if (inv.status !== 'DRAFT') return inv;
  await assertOpenPeriod([inv.date], `Invoice ${inv.invoiceNumber}`);
  await commitStockForInvoice(tx, invoiceId);
  await tx.fulfillment.upsert({
    where: { invoiceId },
    update: {},
    create: { invoiceId, shippingCost: inv.shippingCost, shipmentRecords: { create: { status: 'PENDING', notes: 'Order created' } } },
  });
  await logActivity(tx, inv.customerId, 'INVOICE_ISSUED', `Invoice ${inv.invoiceNumber} issued`, inv.id);
  return tx.invoice.update({ where: { id: invoiceId }, data: { status: 'PENDING', issuedAt: new Date() } });
}

export async function createInvoice(input: InvoiceInput, opts: { recurringId?: string } = {}) {
  await assertWithinPlan('invoices');
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const { lines, totals } = await buildInvoiceLines(tx, input, settings);
    const date = input.date ?? new Date();
    await assertOpenPeriod([date], 'This invoice');
    const dueDate = input.dueDate ?? new Date(date.getTime() + settings.paymentTermsDays * 86_400_000);
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: await nextInvoiceNumber(tx),
        customerId: input.customerId,
        date,
        dueDate,
        notes: input.notes ?? null,
        recurringId: opts.recurringId ?? null,
        ...totals,
        items: { create: lines },
      },
    });
    await logActivity(tx, invoice.customerId, 'INVOICE_CREATED', `Invoice ${invoice.invoiceNumber} created`, invoice.id);
    if (input.issue) await issueInTx(tx, invoice.id);
    return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: invoiceInclude });
  });
}

/** Only drafts are editable; issued invoices are immutable (cancel + duplicate instead). */
export async function updateInvoice(id: string, input: InvoiceInput) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUnique({ where: { id } });
    if (!existing) throw notFound('Invoice');
    if (existing.status !== 'DRAFT') {
      throw badRequest('Only draft invoices can be edited. Cancel and duplicate an issued invoice instead.');
    }
    await assertOpenPeriod([existing.date, input.date], `Invoice ${existing.invoiceNumber}`);
    const { lines, totals } = await buildInvoiceLines(tx, input, settings);
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        customerId: input.customerId,
        date: input.date ?? existing.date,
        dueDate: input.dueDate ?? existing.dueDate,
        notes: input.notes ?? null,
        ...totals,
        items: { create: lines },
      },
    });
    if (input.issue) await issueInTx(tx, id);
    return tx.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
  });
}

export async function issueInvoice(id: string) {
  return prisma.$transaction(async (tx) => {
    await issueInTx(tx, id);
    return tx.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
  });
}

export async function cancelInvoice(id: string) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'CANCELLED') return tx.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
    await assertOpenPeriod([inv.date], `Invoice ${inv.invoiceNumber}`);
    if (inv.amountPaid > 0) throw badRequest('This invoice has payments recorded. Delete the payments before cancelling.');
    if (await tx.creditNote.count({ where: { invoiceId: id, status: 'ISSUED' } })) {
      throw badRequest('This invoice has credit notes. Cancel them before cancelling the invoice.');
    }
    await releaseStockForInvoice(tx, id);
    await tx.fulfillment.updateMany({ where: { invoiceId: id }, data: { status: 'CANCELLED' } });
    await logActivity(tx, inv.customerId, 'INVOICE_CANCELLED', `Invoice ${inv.invoiceNumber} cancelled`, inv.id);
    await tx.invoice.update({ where: { id }, data: { status: 'CANCELLED' } });
    return tx.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
  });
}

export async function deleteInvoice(id: string) {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) throw notFound('Invoice');
  if (inv.status !== 'DRAFT') throw badRequest('Only drafts can be deleted. Cancel issued invoices instead.');
  await prisma.invoice.delete({ where: { id } });
}

/** Stored status from what has been settled. Credits count towards settlement. */
export function statusFromPayments(grandTotal: number, paid: number, credited = 0): string {
  if (paid + credited + 0.005 >= grandTotal && paid + credited > 0) return 'PAID';
  return paid > 0 || credited > 0 ? 'PARTIAL' : 'PENDING';
}

export async function addPayment(id: string, input: z.infer<typeof paymentInput>) {
  return prisma.$transaction(async (tx) => {
    let inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'CANCELLED') throw badRequest('Cannot record a payment on a cancelled invoice');
    await assertOpenPeriod([input.paymentDate ?? new Date()], 'This payment');
    if (inv.status === 'DRAFT') inv = await issueInTx(tx, id); // paying a draft issues it
    const balance = balanceOf(inv);
    if (input.amount > balance + 0.005) {
      throw badRequest(`Payment exceeds the balance due (${balance.toFixed(2)})`);
    }
    await tx.payment.create({
      data: {
        invoiceId: id,
        amount: round2(input.amount),
        tdsAmount: round2(input.tdsAmount ?? 0),
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate ?? new Date(),
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
      },
    });
    const amountPaid = round2(inv.amountPaid + input.amount);
    const status = statusFromPayments(inv.grandTotal, amountPaid, inv.amountCredited);
    await tx.invoice.update({ where: { id }, data: { amountPaid, status } });
    await logActivity(tx, inv.customerId, 'PAYMENT_RECEIVED', `Payment of ${input.amount.toFixed(2)} for ${inv.invoiceNumber}`, inv.id);
    return tx.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
  });
}

export async function deletePayment(invoiceId: string, paymentId: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, invoiceId } });
    if (!payment) throw notFound('Payment');
    await assertOpenPeriod([payment.paymentDate], 'This payment');
    if (await tx.creditNote.count({ where: { invoiceId, status: 'ISSUED', refundAmount: { gt: 0 } } })) {
      throw badRequest('A credit note on this invoice refunds part of the payments. Cancel the credit note first.');
    }
    await tx.payment.delete({ where: { id: paymentId } });
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const agg = await tx.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
    const amountPaid = round2(agg._sum.amount ?? 0);
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid, status: inv.status === 'CANCELLED' ? 'CANCELLED' : statusFromPayments(inv.grandTotal, amountPaid, inv.amountCredited) },
    });
    return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
  });
}

export async function duplicateInvoice(id: string) {
  const src = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
  if (!src) throw notFound('Invoice');
  return createInvoice({
    customerId: src.customerId,
    date: null,
    dueDate: null,
    placeOfSupply: src.placeOfSupply,
    discount: src.discount,
    shippingCost: src.shippingCost,
    notes: src.notes,
    items: src.items.map((i) => ({
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
