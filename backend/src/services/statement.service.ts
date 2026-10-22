import prisma from '../lib/prisma';
import { notFound } from '../lib/errors';
import { round2 } from '../lib/util';
import { balanceOf, displayStatus } from './invoice.service';
import type { Period } from './gst.service';

/**
 * Statement of account: opening balance, every invoice, payment and credit note in the
 * period with a running balance, and what is still open. Invoices count when issued
 * (not drafts or cancelled ones). A negative balance is credit in the customer's favour
 * (e.g. a refund due on a credit note).
 */

const ISSUED = ['PENDING', 'PARTIAL', 'PAID'];

export interface StatementLine {
  date: Date;
  kind: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
  reference: string;
  details: string;
  debit: number;
  credit: number;
  balance: number;
}

export async function customerStatement(customerId: string, period: Period, now = new Date()) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw notFound('Customer');
  const before = { lt: period.from };
  const within = { gte: period.from, lt: period.to };

  const [invBefore, payBefore, cnBefore, invoices, payments, credits, open] = await Promise.all([
    prisma.invoice.aggregate({ where: { customerId, status: { in: ISSUED }, date: before }, _sum: { grandTotal: true } }),
    prisma.payment.aggregate({ where: { invoice: { customerId, status: { in: ISSUED } }, paymentDate: before }, _sum: { amount: true } }),
    prisma.creditNote.aggregate({ where: { customerId, status: 'ISSUED', date: before }, _sum: { total: true } }),
    prisma.invoice.findMany({ where: { customerId, status: { in: ISSUED }, date: within }, select: { date: true, invoiceNumber: true, grandTotal: true, dueDate: true } }),
    prisma.payment.findMany({
      where: { invoice: { customerId, status: { in: ISSUED } }, paymentDate: within },
      select: { paymentDate: true, amount: true, tdsAmount: true, paymentMethod: true, referenceId: true, invoice: { select: { invoiceNumber: true } } },
    }),
    prisma.creditNote.findMany({ where: { customerId, status: 'ISSUED', date: within }, select: { date: true, creditNoteNumber: true, total: true, invoice: { select: { invoiceNumber: true } } } }),
    prisma.invoice.findMany({
      where: { customerId, status: { in: ['PENDING', 'PARTIAL'] } },
      orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
      select: { id: true, invoiceNumber: true, date: true, dueDate: true, grandTotal: true, amountPaid: true, amountCredited: true, status: true },
    }),
  ]);

  const opening = round2((invBefore._sum.grandTotal ?? 0) - (payBefore._sum.amount ?? 0) - (cnBefore._sum.total ?? 0));
  const order = { INVOICE: 0, CREDIT_NOTE: 1, PAYMENT: 2 } as const;
  const method = (m: string) => (m === 'UPI' ? 'UPI' : m.toLowerCase().replace(/_/g, ' '));
  const raw: Omit<StatementLine, 'balance'>[] = [
    ...invoices.map((i) => ({ date: i.date, kind: 'INVOICE' as const, reference: i.invoiceNumber, details: i.dueDate ? `Invoice, due ${i.dueDate.toDateString()}` : 'Invoice', debit: i.grandTotal, credit: 0 })),
    ...payments.map((p) => ({
      date: p.paymentDate,
      kind: 'PAYMENT' as const,
      reference: p.invoice.invoiceNumber,
      details: `Payment received (${method(p.paymentMethod)}${p.referenceId ? ` ${p.referenceId}` : ''})${p.tdsAmount > 0 ? `, incl. TDS ${p.tdsAmount.toFixed(2)}` : ''}`,
      debit: 0,
      credit: p.amount,
    })),
    ...credits.map((c) => ({ date: c.date, kind: 'CREDIT_NOTE' as const, reference: c.creditNoteNumber, details: `Credit note against ${c.invoice.invoiceNumber}`, debit: 0, credit: c.total })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || order[a.kind] - order[b.kind] || a.reference.localeCompare(b.reference));

  let running = opening;
  const lines: StatementLine[] = raw.map((l) => {
    running = round2(running + l.debit - l.credit);
    return { ...l, debit: round2(l.debit), credit: round2(l.credit), balance: running };
  });
  const totalInvoiced = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalReceived = round2(lines.filter((l) => l.kind === 'PAYMENT').reduce((s, l) => s + l.credit, 0));
  const totalCredited = round2(lines.filter((l) => l.kind === 'CREDIT_NOTE').reduce((s, l) => s + l.credit, 0));

  const openRows = open
    .map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, date: i.date, dueDate: i.dueDate, balance: balanceOf(i), status: displayStatus(i) }))
    .filter((i) => i.balance > 0);
  const amountDue = round2(openRows.reduce((s, i) => s + i.balance, 0));
  const overdue = round2(openRows.filter((i) => i.status === 'OVERDUE').reduce((s, i) => s + i.balance, 0));

  return {
    customer: { id: customer.id, name: customer.name, email: customer.email, address: customer.address, city: customer.city, state: customer.state, gstin: customer.gstin },
    period: { label: period.label, from: period.from, to: new Date(period.to.getTime() - 1) },
    generatedAt: now,
    opening,
    lines,
    totals: { invoiced: totalInvoiced, received: totalReceived, credited: totalCredited },
    closing: running,
    openInvoices: openRows,
    amountDue,
    overdue,
  };
}

export type CustomerStatement = Awaited<ReturnType<typeof customerStatement>>;
