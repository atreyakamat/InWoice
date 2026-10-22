import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { optDate, optStr, round2 } from '../lib/util';
import { paidStatus, splitGst } from '../lib/accounting';
import { assertOpenPeriod, getSettings } from './settings.service';
import { recordMovement } from './stock.service';

type Tx = Prisma.TransactionClient;

/**
 * Debit notes (purchase returns) against a supplier bill: goods sent back, a price cut
 * agreed after the bill, or a correction. GST is reversed at each line's original rate
 * with the bill's discount and CGST/SGST vs IGST split, so input credit goes down by
 * exactly the right amount. Returned materials can be taken back out of stock.
 */

export const DEBIT_REASONS = ['RETURN', 'DISCOUNT', 'DEFICIENCY', 'CORRECTION', 'OTHER'] as const;

export const debitNoteInput = z.object({
  date: optDate,
  reason: z.enum(DEBIT_REASONS).default('RETURN'),
  notes: optStr,
  // Take returned material lines back out of stock.
  restock: z.boolean().default(false),
  items: z
    .array(
      z.object({
        billItemId: z.string().uuid(),
        quantity: z.coerce.number().min(0).default(0),
        // Taxable value. Defaults to quantity x the line's discounted unit price.
        amount: z.coerce.number().min(0).optional(),
      }),
    )
    .min(1, 'Choose at least one line'),
});

export type DebitNoteInput = z.infer<typeof debitNoteInput>;

export const debitNoteInclude = {
  items: true,
  supplier: { select: { id: true, name: true, gst: true } },
  bill: { select: { id: true, billNumber: true, date: true, grandTotal: true } },
} satisfies Prisma.DebitNoteInclude;

async function nextNumber(tx: Tx): Promise<string> {
  const settings = await getSettings();
  for (let guard = 0; guard < 10_000; guard++) {
    const updated = await tx.businessSettings.update({ where: { id: settings.id }, data: { nextDebitNoteNumber: { increment: 1 } } });
    const number = `${updated.debitNotePrefix}${String(updated.nextDebitNoteNumber - 1).padStart(4, '0')}`;
    if (!(await tx.debitNote.count({ where: { debitNoteNumber: number } }))) return number;
  }
  throw badRequest('Could not find a free debit note number. Check the prefix and counter in Settings.');
}

/** Re-derive the bill's debited total and status from its active debit notes. */
async function syncBill(tx: Tx, billId: string) {
  const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
  const agg = await tx.debitNote.aggregate({ where: { billId, status: 'ISSUED' }, _sum: { total: true } });
  const amountDebited = round2(agg._sum.total ?? 0);
  await tx.bill.update({
    where: { id: billId },
    data: { amountDebited, status: bill.status === 'CANCELLED' ? 'CANCELLED' : paidStatus(bill.grandTotal, bill.amountPaid + amountDebited) },
  });
}

export async function createDebitNote(billId: string, input: DebitNoteInput) {
  await assertOpenPeriod([input.date ?? new Date()], 'This debit note');
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      include: { items: true, debitNotes: { where: { status: 'ISSUED' }, include: { items: true } } },
    });
    if (!bill) throw notFound('Bill');
    if (bill.status === 'CANCELLED') throw badRequest('This bill is cancelled');

    const ratio = bill.subtotal > 0 ? (bill.subtotal - bill.discount) / bill.subtotal : 0;
    const prior = new Map<string, { qty: number; value: number; tax: number }>();
    for (const dn of bill.debitNotes) {
      for (const di of dn.items) {
        const p = prior.get(di.billItemId) ?? { qty: 0, value: 0, tax: 0 };
        prior.set(di.billItemId, { qty: p.qty + di.quantity, value: p.value + di.taxableValue, tax: p.tax + di.taxAmount });
      }
    }

    const lines: { billItemId: string; description: string; quantity: number; taxableValue: number; taxRate: number; taxAmount: number; inventoryItemId: string | null }[] = [];
    for (const req of input.items) {
      if (req.quantity === 0 && !req.amount) continue;
      const item = bill.items.find((i) => i.id === req.billItemId);
      if (!item) throw badRequest('A debit note line does not belong to this bill');
      const done = prior.get(item.id) ?? { qty: 0, value: 0, tax: 0 };
      if (req.quantity > round2(item.quantity - done.qty) + 1e-9) throw badRequest(`"${item.description}": only ${round2(item.quantity - done.qty)} left to return`);
      const remaining = round2(item.total * ratio - done.value);
      const taxableValue = round2(req.amount ?? req.quantity * item.unitPrice * ratio);
      if (taxableValue > remaining + 0.005) throw badRequest(`"${item.description}": at most ${remaining.toFixed(2)} (before tax) can still be debited`);
      if (taxableValue <= 0) continue;
      const isRest = taxableValue >= remaining - 0.005;
      lines.push({
        billItemId: item.id,
        description: item.description,
        quantity: req.quantity,
        taxableValue,
        taxRate: item.taxRate,
        taxAmount: isRest ? round2(item.taxAmount - done.tax) : round2((taxableValue * item.taxRate) / 100),
        inventoryItemId: item.inventoryItemId,
      });
    }
    if (!lines.length) throw badRequest('Nothing to debit. Enter a quantity or amount on at least one line.');

    const taxableValue = round2(lines.reduce((s, l) => s + l.taxableValue, 0));
    const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
    const total = round2(taxableValue + taxAmount);
    if (total > round2(bill.grandTotal - bill.amountDebited) + 0.02) throw badRequest('Debit notes would exceed the bill total');
    // Anything already paid beyond the reduced bill is a refund the supplier owes you.
    const openBalance = Math.max(0, round2(bill.grandTotal - bill.amountPaid - bill.amountDebited));
    const refundAmount = round2(Math.max(0, total - openBalance));

    const dn = await tx.debitNote.create({
      data: {
        debitNoteNumber: await nextNumber(tx),
        billId: bill.id,
        supplierId: bill.supplierId,
        date: input.date ?? new Date(),
        reason: input.reason,
        notes: input.notes ?? null,
        taxableValue,
        taxAmount,
        ...splitGst(taxAmount, bill.igst > 0),
        total,
        refundAmount,
        restock: false,
        items: { create: lines.map(({ inventoryItemId: _ignored, ...l }) => l) },
      },
    });
    if (input.restock) {
      let moved = false;
      for (const l of lines) {
        if (!l.inventoryItemId || l.quantity <= 0) continue;
        await recordMovement(tx, {
          inventoryItemId: l.inventoryItemId,
          type: 'ADJUSTMENT',
          quantity: -l.quantity,
          referenceType: 'DEBIT_NOTE',
          referenceId: dn.id,
          notes: `Returned to supplier (${dn.debitNoteNumber})`,
        });
        moved = true;
      }
      if (moved) await tx.debitNote.update({ where: { id: dn.id }, data: { restock: true } });
    }
    await syncBill(tx, bill.id);
    return tx.debitNote.findUniqueOrThrow({ where: { id: dn.id }, include: debitNoteInclude });
  });
}

/** Cancel a debit note: the bill balance comes back and returned stock is put back. */
export async function cancelDebitNote(id: string) {
  return prisma.$transaction(async (tx) => {
    const dn = await tx.debitNote.findUnique({ where: { id } });
    if (!dn) throw notFound('Debit note');
    if (dn.status !== 'CANCELLED') {
      await assertOpenPeriod([dn.date], `Debit note ${dn.debitNoteNumber}`);
      const moves = await tx.stockMovement.groupBy({ by: ['inventoryItemId'], where: { referenceType: 'DEBIT_NOTE', referenceId: id }, _sum: { quantity: true } });
      for (const m of moves) {
        const qty = round2(m._sum.quantity ?? 0);
        if (Math.abs(qty) < 1e-9 || !(await tx.inventoryItem.count({ where: { id: m.inventoryItemId } }))) continue;
        await recordMovement(tx, { inventoryItemId: m.inventoryItemId, type: 'ADJUSTMENT', quantity: -qty, referenceType: 'DEBIT_NOTE', referenceId: id, notes: `${dn.debitNoteNumber} cancelled` });
      }
      await tx.debitNote.update({ where: { id }, data: { status: 'CANCELLED' } });
      await syncBill(tx, dn.billId);
    }
    return tx.debitNote.findUniqueOrThrow({ where: { id }, include: debitNoteInclude });
  });
}
