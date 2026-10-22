import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import { optDate, optStr, round2 } from '../lib/util';
import { businessStateCode, placeOfSupplyCode } from '../lib/gst';
import { computeDocument, daysOverdue, paidStatus } from '../lib/accounting';
import { assertOpenPeriod, getSettings } from './settings.service';
import { recordMovement } from './stock.service';

type Tx = Prisma.TransactionClient;

/**
 * Supplier bills (purchase invoices) and the payments made against them. A bill records
 * what you owe a supplier and the GST you can claim back. Bills linked to a purchase
 * order never touch stock (receiving the order already did); standalone bills can add
 * their material lines to stock, and cancelling reverses exactly that.
 */

export const PAYMENT_METHODS = ['UPI', 'BANK_TRANSFER', 'CASH', 'CARD', 'CHEQUE', 'OTHER'] as const;

export const billItemInput = z.object({
  inventoryItemId: optStr,
  description: optStr,
  category: optStr,
  hsnCode: optStr,
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

export const billInput = z.object({
  supplierId: z.string().uuid(),
  billNumber: z.string().trim().min(1, 'Enter the bill number printed on the supplier invoice').max(40),
  purchaseOrderId: optStr,
  date: optDate,
  dueDate: optDate,
  discount: z.coerce.number().min(0).default(0),
  shippingCost: z.coerce.number().min(0).default(0),
  // Leave out to work it out from the supplier's state/GSTIN vs your business state.
  interState: z.boolean().optional().nullable(),
  itcEligible: z.boolean().optional(),
  addToStock: z.boolean().optional(),
  notes: optStr,
  items: z.array(billItemInput).min(1, 'Add at least one line'),
});

export type BillInput = z.infer<typeof billInput>;

export const billPaymentInput = z
  .object({
    amount: z.coerce.number().positive(),
    // TDS you deducted from this payment: settles the bill, but you owe it to the government.
    tdsAmount: z.coerce.number().min(0).default(0),
    tdsSection: optStr,
    paymentMethod: z.enum(PAYMENT_METHODS).default('BANK_TRANSFER'),
    paymentDate: optDate,
    referenceId: optStr,
    notes: optStr,
  })
  .refine((p) => p.tdsAmount <= p.amount, { message: 'TDS cannot be more than the amount settled', path: ['tdsAmount'] });

export const billInclude = {
  supplier: { select: { id: true, name: true, gst: true, state: true, email: true, phone: true } },
  purchaseOrder: { select: { id: true, poNumber: true } },
  items: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } } },
  payments: { orderBy: { paymentDate: 'asc' } },
  debitNotes: { orderBy: { createdAt: 'asc' }, include: { items: true } },
} satisfies Prisma.BillInclude;

/** What you still owe: total less payments and debit notes (never negative). */
export const billBalance = (b: { grandTotal: number; amountPaid: number; amountDebited?: number }) => Math.max(0, round2(b.grandTotal - b.amountPaid - (b.amountDebited ?? 0)));

export function billDisplayStatus(b: { status: string; dueDate: Date | null }, now = new Date()) {
  if ((b.status === 'PENDING' || b.status === 'PARTIAL') && daysOverdue(b.dueDate, now) > 0) return 'OVERDUE';
  return b.status;
}

export function withBillDerived<T extends { status: string; dueDate: Date | null; grandTotal: number; amountPaid: number; amountDebited?: number }>(b: T) {
  return { ...b, displayStatus: billDisplayStatus(b), balanceDue: billBalance(b) };
}

/** Net terms like "Net 30" or "30 days" on the supplier become the default due date. */
export function termsDays(paymentTerms: string | null | undefined): number | null {
  const m = paymentTerms?.match(/(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

async function buildBill(tx: Tx, input: BillInput) {
  const [settings, supplier] = await Promise.all([getSettings(), tx.supplier.findUnique({ where: { id: input.supplierId } })]);
  if (!supplier) throw notFound('Supplier');

  if (input.purchaseOrderId) {
    const po = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
    if (!po) throw notFound('Purchase order');
    if (po.supplierId !== supplier.id) throw badRequest('That purchase order belongs to a different supplier');
    if (po.status === 'CANCELLED') throw badRequest('That purchase order is cancelled');
  }

  const lines = [];
  for (const item of input.items) {
    let description = item.description ?? '';
    if (item.inventoryItemId) {
      const mat = await tx.inventoryItem.findUnique({ where: { id: item.inventoryItemId } });
      if (!mat) throw notFound('Inventory item');
      description = description || mat.name;
    }
    if (!description) throw badRequest('Each line needs a description or a material');
    lines.push({
      inventoryItemId: item.inventoryItemId ?? null,
      description,
      category: item.category?.trim() || 'Purchases',
      hsnCode: item.hsnCode ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
    });
  }

  const home = businessStateCode(settings.state, settings.gstNumber);
  const theirs = placeOfSupplyCode(null, supplier.state, supplier.gst);
  const interState = input.interState ?? Boolean(home && theirs && home !== theirs);
  const doc = computeDocument(lines, { discount: input.discount, shippingCost: input.shippingCost, interState });

  // GST from an unregistered supplier can't be claimed.
  const itcEligible = doc.taxAmount > 0 && Boolean(supplier.gst) && (input.itcEligible ?? true);
  const addToStock = !input.purchaseOrderId && (input.addToStock ?? false) && lines.some((l) => l.inventoryItemId);
  const date = input.date ?? new Date();
  const terms = termsDays(supplier.paymentTerms);
  const dueDate = input.dueDate !== undefined ? input.dueDate : terms !== null ? new Date(date.getTime() + terms * 86_400_000) : null;

  await assertOpenPeriod([date], 'This bill');
  const { lines: items, ...totals } = doc;
  return { supplier, items, totals, itcEligible, addToStock, date, dueDate };
}

async function applyStock(tx: Tx, bill: { id: string; billNumber: string; items: { inventoryItemId: string | null; quantity: number; unitPrice: number }[] }) {
  for (const l of bill.items) {
    if (!l.inventoryItemId) continue;
    await recordMovement(tx, {
      inventoryItemId: l.inventoryItemId,
      type: 'PURCHASE',
      quantity: l.quantity,
      referenceType: 'BILL',
      referenceId: bill.id,
      notes: `Bill ${bill.billNumber}`,
    });
    if (l.unitPrice > 0) await tx.inventoryItem.update({ where: { id: l.inventoryItemId }, data: { costPerUnit: l.unitPrice } });
  }
}

/** Reverse every stock movement a bill made (net, so repeated edits stay exact). */
async function reverseStock(tx: Tx, billId: string, billNumber: string, why: string) {
  const moves = await tx.stockMovement.groupBy({
    by: ['inventoryItemId'],
    where: { referenceType: 'BILL', referenceId: billId },
    _sum: { quantity: true },
  });
  for (const m of moves) {
    const qty = round2(m._sum.quantity ?? 0);
    if (Math.abs(qty) < 1e-9) continue;
    if (!(await tx.inventoryItem.count({ where: { id: m.inventoryItemId } }))) continue;
    await recordMovement(tx, {
      inventoryItemId: m.inventoryItemId,
      type: 'ADJUSTMENT',
      quantity: -qty,
      referenceType: 'BILL',
      referenceId: billId,
      notes: `Bill ${billNumber} ${why}`,
    });
  }
}

async function assertUniqueNumber(tx: Tx, supplierId: string, billNumber: string, exceptId?: string) {
  const dup = await tx.bill.findFirst({ where: { supplierId, billNumber, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (dup) throw conflict(`Bill ${billNumber} from this supplier is already recorded`);
}

export async function createBill(input: BillInput) {
  return prisma.$transaction(async (tx) => {
    await assertUniqueNumber(tx, input.supplierId, input.billNumber);
    const b = await buildBill(tx, input);
    const bill = await tx.bill.create({
      data: {
        billNumber: input.billNumber,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        date: b.date,
        dueDate: b.dueDate,
        notes: input.notes ?? null,
        itcEligible: b.itcEligible,
        addToStock: b.addToStock,
        ...b.totals,
        items: { create: b.items },
      },
      include: { items: true },
    });
    if (bill.addToStock) await applyStock(tx, bill);
    return tx.bill.findUniqueOrThrow({ where: { id: bill.id }, include: billInclude });
  });
}

/** Bills can be corrected until a payment is recorded against them. */
export async function updateBill(id: string, input: BillInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.bill.findUnique({ where: { id } });
    if (!existing) throw notFound('Bill');
    if (existing.status === 'CANCELLED') throw badRequest('This bill is cancelled');
    if (existing.amountPaid > 0) throw badRequest('This bill has payments recorded. Delete the payments before editing it.');
    if (existing.amountDebited > 0) throw badRequest('This bill has debit notes. Cancel them before editing it.');
    await assertOpenPeriod([existing.date], `Bill ${existing.billNumber}`);
    await assertUniqueNumber(tx, input.supplierId, input.billNumber, id);
    if (existing.addToStock) await reverseStock(tx, id, existing.billNumber, 'edited');
    const b = await buildBill(tx, input);
    await tx.billItem.deleteMany({ where: { billId: id } });
    const bill = await tx.bill.update({
      where: { id },
      data: {
        billNumber: input.billNumber,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        date: b.date,
        dueDate: b.dueDate,
        notes: input.notes ?? null,
        itcEligible: b.itcEligible,
        addToStock: b.addToStock,
        ...b.totals,
        status: 'PENDING',
        items: { create: b.items },
      },
      include: { items: true },
    });
    if (bill.addToStock) await applyStock(tx, bill);
    return tx.bill.findUniqueOrThrow({ where: { id }, include: billInclude });
  });
}

export async function cancelBill(id: string) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({ where: { id } });
    if (!bill) throw notFound('Bill');
    if (bill.status !== 'CANCELLED') {
      if (bill.amountPaid > 0) throw badRequest('This bill has payments recorded. Delete the payments before cancelling.');
      if (bill.amountDebited > 0) throw badRequest('This bill has debit notes. Cancel them before cancelling the bill.');
      await assertOpenPeriod([bill.date], `Bill ${bill.billNumber}`);
      if (bill.addToStock) await reverseStock(tx, id, bill.billNumber, 'cancelled');
      await tx.bill.update({ where: { id }, data: { status: 'CANCELLED' } });
    }
    return tx.bill.findUniqueOrThrow({ where: { id }, include: billInclude });
  });
}

export async function addBillPayment(id: string, input: z.infer<typeof billPaymentInput>) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({ where: { id } });
    if (!bill) throw notFound('Bill');
    if (bill.status === 'CANCELLED') throw badRequest('Cannot pay a cancelled bill');
    await assertOpenPeriod([input.paymentDate ?? new Date()], 'This payment');
    const balance = billBalance(bill);
    if (input.amount > balance + 0.005) throw badRequest(`Payment exceeds the balance due (${balance.toFixed(2)})`);
    await tx.billPayment.create({
      data: {
        billId: id,
        amount: round2(input.amount),
        tdsAmount: round2(input.tdsAmount ?? 0),
        tdsSection: (input.tdsAmount ?? 0) > 0 ? input.tdsSection ?? null : null,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate ?? new Date(),
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
      },
    });
    const amountPaid = round2(bill.amountPaid + input.amount);
    await tx.bill.update({ where: { id }, data: { amountPaid, status: paidStatus(bill.grandTotal, amountPaid + bill.amountDebited) } });
    return tx.bill.findUniqueOrThrow({ where: { id }, include: billInclude });
  });
}

export async function deleteBillPayment(billId: string, paymentId: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.billPayment.findFirst({ where: { id: paymentId, billId } });
    if (!payment) throw notFound('Payment');
    await assertOpenPeriod([payment.paymentDate], 'This payment');
    if (await tx.debitNote.count({ where: { billId, status: 'ISSUED', refundAmount: { gt: 0 } } })) {
      throw badRequest('A debit note on this bill expects a refund of part of these payments. Cancel the debit note first.');
    }
    await tx.billPayment.delete({ where: { id: paymentId } });
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
    const agg = await tx.billPayment.aggregate({ where: { billId }, _sum: { amount: true } });
    const amountPaid = round2(agg._sum.amount ?? 0);
    await tx.bill.update({
      where: { id: billId },
      data: { amountPaid, status: bill.status === 'CANCELLED' ? 'CANCELLED' : paidStatus(bill.grandTotal, amountPaid + bill.amountDebited) },
    });
    return tx.bill.findUniqueOrThrow({ where: { id: billId }, include: billInclude });
  });
}
