import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { round2 } from '../lib/util';
import { daysOverdue } from '../lib/accounting';
import { balanceOf } from './invoice.service';
import { sendReminder } from './reminder.service';
import { emailQuote } from './documents.service';
import { generate, isAiEnabled, parseJsonFromText } from './ai.service';
import { getSettings } from './settings.service';

/**
 * The actions centre: InWoice proposes concrete jobs (chase these invoices, reorder these
 * materials, follow up these quotes); nothing happens until a person approves the exact
 * list. The proposals are rules over your data, so they work without AI; with AI on,
 * reminder emails can be drafted in a personal tone for you to edit before sending.
 */

const DAY = 86_400_000;

export async function suggestedActions(now = new Date()) {
  const [overdue, materials, openPoLines, quotes] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
      select: { id: true, invoiceNumber: true, dueDate: true, grandTotal: true, amountPaid: true, amountCredited: true, lastReminderAt: true, customer: { select: { name: true, email: true } } },
      orderBy: { dueDate: 'asc' },
      take: 50,
    }),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, unit: true, currentStock: true, reorderLevel: true, minimumStock: true, costPerUnit: true, supplier: { select: { id: true, name: true, status: true } } },
    }),
    prisma.purchaseOrderItem.findMany({ where: { purchaseOrder: { status: { in: ['DRAFT', 'ORDERED', 'PARTIAL'] } } }, select: { inventoryItemId: true } }),
    prisma.quote.findMany({
      where: { status: 'SENT', validUntil: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), lte: new Date(now.getTime() + 3 * DAY) } },
      select: { id: true, quoteNumber: true, validUntil: true, grandTotal: true, sentAt: true, customer: { select: { name: true, email: true } } },
      orderBy: { validUntil: 'asc' },
    }),
  ]);

  // Overdue invoices with an email address that haven't been chased in the last 3 days.
  const reminders = overdue
    .filter((i) => i.customer.email && (!i.lastReminderAt || now.getTime() - i.lastReminderAt.getTime() > 3 * DAY))
    .map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, customer: i.customer.name, email: i.customer.email!, balance: balanceOf(i), daysOverdue: daysOverdue(i.dueDate, now) }))
    .filter((i) => i.balance > 0);

  // Materials at or below their reorder level that aren't already on an open order.
  const onOrder = new Set(openPoLines.map((l) => l.inventoryItemId));
  const reorder = materials
    .filter((m) => m.reorderLevel > 0 && m.currentStock <= m.reorderLevel && !onOrder.has(m.id))
    .map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      stock: m.currentStock,
      reorderLevel: m.reorderLevel,
      // Bring stock back to twice the reorder level.
      quantity: round2(Math.max(m.reorderLevel * 2 - Math.max(m.currentStock, 0), m.minimumStock || 1)),
      unitPrice: m.costPerUnit,
      supplierId: m.supplier?.status === 'ACTIVE' ? m.supplier.id : null,
      supplierName: m.supplier?.status === 'ACTIVE' ? m.supplier.name : null,
    }));

  const followUps = quotes
    .filter((q) => q.customer.email)
    .map((q) => ({ id: q.id, quoteNumber: q.quoteNumber, customer: q.customer.name, email: q.customer.email!, total: q.grandTotal, validUntil: q.validUntil }));

  return {
    reminders: { title: 'Chase overdue invoices', total: round2(reminders.reduce((s, r) => s + r.balance, 0)), items: reminders },
    reorder: { title: 'Reorder materials running low', items: reorder },
    followUps: { title: 'Follow up quotes about to expire', items: followUps },
  };
}

// --- Reminder drafts ------------------------------------------------------------------

/** Draft one reminder per invoice: written by AI when it's on, otherwise a polite template. */
export async function draftReminders(invoiceIds: string[]) {
  if (!invoiceIds.length) return [];
  const [settings, invoices] = await Promise.all([
    getSettings(),
    prisma.invoice.findMany({
      where: { id: { in: invoiceIds.slice(0, 20) }, status: { in: ['PENDING', 'PARTIAL'] } },
      select: { id: true, invoiceNumber: true, dueDate: true, grandTotal: true, amountPaid: true, amountCredited: true, customer: { select: { name: true } } },
    }),
  ]);
  const cur = settings.currencySymbol;
  const facts = invoices.map((i) => ({ invoiceId: i.id, customer: i.customer.name, invoice: i.invoiceNumber, amountDue: `${cur}${balanceOf(i).toFixed(2)}`, daysOverdue: daysOverdue(i.dueDate) }));
  const template = (f: (typeof facts)[number]) =>
    [
      `Hi ${f.customer},`,
      '',
      `A gentle reminder that invoice ${f.invoice} for ${f.amountDue} is now ${f.daysOverdue} day${f.daysOverdue === 1 ? '' : 's'} past its due date.`,
      settings.upiId ? `You can pay by UPI to ${settings.upiId}; the invoice with a QR code is attached.` : 'The invoice is attached.',
      'If you have already paid, thank you, and please ignore this note.',
      '',
      settings.businessName,
    ].join('\n');

  let ai: { invoiceId: string; message: string }[] = [];
  let source: 'AI' | 'TEMPLATE' = 'TEMPLATE';
  if (await isAiEnabled()) {
    try {
      const r = await generate({
        system:
          `You write short, warm, professional payment reminder emails for ${settings.businessName}, a small Indian business. ` +
          'Use only the facts given. Keep each under 90 words, no subject line, sign off with the business name. ' +
          (settings.upiId ? `Mention they can pay by UPI to ${settings.upiId}. ` : '') +
          'Firmer (but still polite) when more than 30 days overdue. Reply with a JSON array of {"invoiceId": string, "message": string} only.',
        prompt: JSON.stringify(facts),
        maxTokens: 3000,
      });
      ai = (parseJsonFromText<{ invoiceId: string; message: string }[]>(r.text) ?? []).filter((d) => typeof d?.message === 'string' && d.message.trim());
      if (ai.length) source = 'AI';
    } catch {
      // Fall back to the template: drafting must never block chasing payments.
    }
  }
  return facts.map((f) => ({ ...f, source: ai.find((d) => d.invoiceId === f.invoiceId) ? source : ('TEMPLATE' as const), message: ai.find((d) => d.invoiceId === f.invoiceId)?.message.trim() ?? template(f) }));
}

// --- Running approved actions ---------------------------------------------------------

export const runInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reminders'), items: z.array(z.object({ id: z.string().uuid(), message: z.string().max(4000).optional() })).min(1).max(50) }),
  z.object({ kind: z.literal('reorder'), items: z.array(z.object({ id: z.string().uuid(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().min(0).optional() })).min(1).max(100) }),
  z.object({ kind: z.literal('followUps'), items: z.array(z.object({ id: z.string().uuid() })).min(1).max(50) }),
]);

export async function runAction(input: z.infer<typeof runInput>) {
  const done: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const why = (err: unknown) => (err instanceof Error ? err.message : String(err));

  if (input.kind === 'reminders') {
    for (const it of input.items) {
      try {
        const r = await sendReminder(it.id, { message: it.message });
        done.push(`Reminder emailed to ${r.to}`);
      } catch (err) {
        failed.push({ id: it.id, error: why(err) });
      }
    }
  } else if (input.kind === 'followUps') {
    for (const it of input.items) {
      try {
        const r = await emailQuote(it.id, { subject: undefined, message: undefined });
        done.push(`Quote re-sent to ${r.to}`);
      } catch (err) {
        failed.push({ id: it.id, error: why(err) });
      }
    }
  } else {
    // One draft purchase order per supplier; nothing is ordered until you mark it ordered.
    const materials = await prisma.inventoryItem.findMany({ where: { id: { in: input.items.map((i) => i.id) } }, select: { id: true, name: true, costPerUnit: true, supplierId: true } });
    const bySupplier = new Map<string, { inventoryItemId: string; quantityOrdered: number; unitPrice: number }[]>();
    for (const it of input.items) {
      const m = materials.find((x) => x.id === it.id);
      if (!m) {
        failed.push({ id: it.id, error: 'Material not found' });
        continue;
      }
      if (!m.supplierId) {
        failed.push({ id: it.id, error: `${m.name} has no supplier. Set one on the material first.` });
        continue;
      }
      bySupplier.set(m.supplierId, [...(bySupplier.get(m.supplierId) ?? []), { inventoryItemId: m.id, quantityOrdered: it.quantity, unitPrice: it.unitPrice ?? m.costPerUnit }]);
    }
    const year = new Date().getFullYear();
    for (const [supplierId, items] of bySupplier) {
      const count = await prisma.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${year}-` } } });
      const lines = items.map((i) => ({ ...i, totalPrice: round2(i.quantityOrdered * i.unitPrice) }));
      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber: `PO-${year}-${String(count + 1).padStart(4, '0')}`,
          supplierId,
          status: 'DRAFT',
          notes: 'Suggested by InWoice for materials running low',
          totalAmount: round2(lines.reduce((s, l) => s + l.totalPrice, 0)),
          items: { create: lines },
        },
      });
      done.push(`Draft order ${po.poNumber} created`);
    }
  }
  if (!done.length && failed.length) throw badRequest(failed[0]!.error);
  return { done, failed };
}
