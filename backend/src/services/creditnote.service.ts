import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { optDate, optStr, round2 } from '../lib/util';
import { assertOpenPeriod, getSettings } from './settings.service';
import { balanceOf, statusFromPayments } from './invoice.service';

type Tx = Prisma.TransactionClient;

export const CREDIT_REASONS = ['RETURN', 'DISCOUNT', 'DEFICIENCY', 'CORRECTION', 'OTHER'] as const;

export const creditNoteInput = z.object({
  date: optDate,
  reason: z.enum(CREDIT_REASONS).default('RETURN'),
  notes: optStr,
  // Put returned goods back into finished-goods stock.
  restock: z.boolean().default(false),
  shippingAmount: z.coerce.number().min(0).default(0),
  items: z
    .array(
      z.object({
        invoiceItemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(0).default(0),
        // Taxable value to credit. Defaults to quantity x the line's discounted unit price.
        amount: z.coerce.number().min(0).optional(),
      }),
    )
    .default([]),
});

export type CreditNoteInput = z.infer<typeof creditNoteInput>;

export const creditNoteInclude = {
  items: true,
  customer: true,
  invoice: { select: { id: true, invoiceNumber: true, date: true, grandTotal: true, placeOfSupply: true } },
} satisfies Prisma.CreditNoteInclude;

interface RestockLog {
  products: { productId: string; quantity: number }[];
}

async function nextCreditNoteNumber(tx: Tx): Promise<string> {
  const settings = await getSettings();
  for (let guard = 0; guard < 10_000; guard++) {
    const updated = await tx.businessSettings.update({
      where: { id: settings.id },
      data: { nextCreditNoteNumber: { increment: 1 } },
    });
    const number = `${updated.creditNotePrefix}${String(updated.nextCreditNoteNumber - 1).padStart(4, '0')}`;
    if (!(await tx.creditNote.count({ where: { creditNoteNumber: number } }))) return number;
  }
  throw badRequest('Could not find a free credit note number. Check the prefix and counter in Settings.');
}

/** Re-derive the invoice's credited total and status from its active credit notes. */
async function syncInvoiceCredits(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const agg = await tx.creditNote.aggregate({ where: { invoiceId, status: 'ISSUED' }, _sum: { total: true } });
  const amountCredited = round2(agg._sum.total ?? 0);
  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountCredited,
      status: inv.status === 'CANCELLED' || inv.status === 'DRAFT' ? inv.status : statusFromPayments(inv.grandTotal, inv.amountPaid, amountCredited),
    },
  });
}

/**
 * Issue a credit note against an issued invoice. Tax is reversed at the original line's
 * rate and with the original CGST/SGST vs IGST split; the invoice discount is respected.
 */
export async function createCreditNote(invoiceId: string, input: CreditNoteInput) {
  await assertOpenPeriod([input.date ?? new Date()], 'This credit note');
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, creditNotes: { where: { status: 'ISSUED' }, include: { items: true } } },
    });
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'DRAFT') throw badRequest('Drafts can be edited directly. Credit notes are for issued invoices.');
    if (inv.status === 'CANCELLED') throw badRequest('This invoice is cancelled');

    const discountRatio = inv.subtotal > 0 ? (inv.subtotal - inv.discount) / inv.subtotal : 0;
    const interState = inv.igst > 0;

    const prior = new Map<string, { qty: number; value: number; tax: number }>();
    for (const cn of inv.creditNotes) {
      for (const ci of cn.items) {
        const p = prior.get(ci.invoiceItemId) ?? { qty: 0, value: 0, tax: 0 };
        prior.set(ci.invoiceItemId, { qty: p.qty + ci.quantity, value: p.value + ci.taxableValue, tax: p.tax + ci.taxAmount });
      }
    }

    const lines: Prisma.CreditNoteItemCreateWithoutCreditNoteInput[] = [];
    const restock = new Map<string, { type: string; itemId: string; quantity: number }>();
    for (const req of input.items) {
      if (req.quantity === 0 && !req.amount) continue;
      const item = inv.items.find((i) => i.id === req.invoiceItemId);
      if (!item) throw badRequest('A credit note line does not belong to this invoice');
      const done = prior.get(item.id) ?? { qty: 0, value: 0, tax: 0 };
      if (req.quantity > item.quantity - done.qty) {
        throw badRequest(`"${item.name}": only ${item.quantity - done.qty} left to credit`);
      }
      const lineValue = round2(item.total * discountRatio);
      const remaining = round2(lineValue - done.value);
      const taxableValue = round2(req.amount ?? req.quantity * item.unitPrice * discountRatio);
      if (taxableValue > remaining + 0.005) {
        throw badRequest(`"${item.name}": at most ${remaining.toFixed(2)} (before tax) can still be credited`);
      }
      if (taxableValue <= 0) continue;
      // Crediting what is left of a line reverses exactly the tax still on it (no paisa drift).
      const isRest = taxableValue >= remaining - 0.005;
      lines.push({
        invoiceItemId: item.id,
        name: item.name,
        hsnCode: item.hsnCode,
        quantity: req.quantity,
        taxableValue,
        taxRate: item.taxRate,
        taxAmount: isRest ? round2(item.taxAmount - done.tax) : round2((taxableValue * item.taxRate) / 100),
      });
      if (req.quantity > 0 && item.itemId && (item.type === 'PRODUCT' || item.type === 'PACK')) {
        restock.set(item.id, { type: item.type, itemId: item.itemId, quantity: req.quantity });
      }
    }

    const shippingDone = inv.creditNotes.reduce((s, c) => s + c.shippingAmount, 0);
    const shippingAmount = round2(input.shippingAmount);
    if (shippingAmount > round2(inv.shippingCost - shippingDone) + 0.005) {
      throw badRequest(`At most ${round2(inv.shippingCost - shippingDone).toFixed(2)} of shipping can still be credited`);
    }
    if (!lines.length && shippingAmount <= 0) throw badRequest('Nothing to credit. Enter a quantity or amount on at least one line.');

    const taxableValue = round2(lines.reduce((s, l) => s + l.taxableValue, 0));
    const taxAmount = round2(lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0));
    const igst = interState ? taxAmount : 0;
    const cgst = interState ? 0 : round2(taxAmount / 2);
    const sgst = interState ? 0 : round2(taxAmount - cgst);
    const total = round2(taxableValue + taxAmount + shippingAmount);

    // A credit can never exceed what was invoiced.
    if (total > round2(inv.grandTotal - inv.amountCredited) + 0.02) {
      throw badRequest('Credit notes would exceed the invoice total');
    }
    // Whatever the customer has already paid beyond the reduced invoice value is owed back.
    const refundAmount = round2(Math.max(0, total - balanceOf(inv)));

    const log: RestockLog = { products: [] };
    if (input.restock) {
      for (const r of restock.values()) {
        const components =
          r.type === 'PACK'
            ? (await tx.packItem.findMany({ where: { packId: r.itemId } })).map((p) => ({ productId: p.productId, quantity: p.quantity * r.quantity }))
            : [{ productId: r.itemId, quantity: r.quantity }];
        for (const c of components) {
          const updated = await tx.product.updateMany({ where: { id: c.productId }, data: { stock: { increment: c.quantity } } });
          if (updated.count) log.products.push(c);
        }
      }
    }

    const cn = await tx.creditNote.create({
      data: {
        creditNoteNumber: await nextCreditNoteNumber(tx),
        invoiceId: inv.id,
        customerId: inv.customerId,
        date: input.date ?? new Date(),
        reason: input.reason,
        notes: input.notes ?? null,
        taxableValue,
        taxAmount,
        cgst,
        sgst,
        igst,
        shippingAmount,
        total,
        refundAmount,
        restock: input.restock && log.products.length > 0,
        stockLog: log.products.length ? JSON.stringify(log) : null,
        items: { create: lines },
      },
    });
    await syncInvoiceCredits(tx, inv.id);
    await tx.activity.create({
      data: {
        customerId: inv.customerId,
        eventType: 'CREDIT_NOTE_ISSUED',
        title: `Credit note ${cn.creditNoteNumber} for ${inv.invoiceNumber}: ${total.toFixed(2)}${refundAmount > 0 ? ` (refund due ${refundAmount.toFixed(2)})` : ''}`,
        referenceType: 'INVOICE',
        referenceId: inv.id,
      },
    });
    return tx.creditNote.findUniqueOrThrow({ where: { id: cn.id }, include: creditNoteInclude });
  });
}

/** Cancel a credit note: the invoice balance comes back and restocked goods are taken out again. */
export async function cancelCreditNote(id: string) {
  return prisma.$transaction(async (tx) => {
    const cn = await tx.creditNote.findUnique({ where: { id }, include: { invoice: true } });
    if (!cn) throw notFound('Credit note');
    if (cn.status !== 'CANCELLED') await assertOpenPeriod([cn.date], `Credit note ${cn.creditNoteNumber}`);
    if (cn.status !== 'CANCELLED') {
      const log: RestockLog = cn.stockLog ? JSON.parse(cn.stockLog) : { products: [] };
      for (const p of log.products) {
        await tx.product.updateMany({ where: { id: p.productId }, data: { stock: { decrement: p.quantity } } });
      }
      await tx.creditNote.update({ where: { id }, data: { status: 'CANCELLED' } });
      await syncInvoiceCredits(tx, cn.invoiceId);
      await tx.activity.create({
        data: {
          customerId: cn.customerId,
          eventType: 'CREDIT_NOTE_CANCELLED',
          title: `Credit note ${cn.creditNoteNumber} cancelled`,
          referenceType: 'INVOICE',
          referenceId: cn.invoiceId,
        },
      });
    }
    return tx.creditNote.findUniqueOrThrow({ where: { id }, include: creditNoteInclude });
  });
}
