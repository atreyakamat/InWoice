import { round2 } from './util';

/**
 * Pure accounting helpers (no database). Kept separate so they can be unit tested on
 * their own and reused by bills, expenses and the reports.
 */

export interface GstSplit {
  igst: number;
  cgst: number;
  sgst: number;
}

/** Split a tax amount into IGST (inter-state) or CGST + SGST (same state). Paise-exact. */
export function splitGst(tax: number, interState: boolean): GstSplit {
  const t = round2(tax);
  if (interState) return { igst: t, cgst: 0, sgst: 0 };
  const cgst = round2(t / 2);
  return { igst: 0, cgst, sgst: round2(t - cgst) };
}

/** Taxable value and tax inside a GST-inclusive amount, e.g. ₹1,180 at 18% → 1,000 + 180. */
export function fromInclusive(total: number, rate: number) {
  const taxable = rate > 0 ? round2(total / (1 + rate / 100)) : round2(total);
  return { taxable, tax: round2(total - taxable) };
}

export interface LineIn {
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

/**
 * Totals for a document with lines, a document-level discount and untaxed shipping.
 * Tax is charged on the discounted value and apportioned per line (same rule as invoices).
 */
export function computeDocument<T extends LineIn>(lines: T[], opts: { discount?: number; shippingCost?: number; interState: boolean }) {
  const withTotals = lines.map((l) => ({ ...l, unitPrice: round2(l.unitPrice), total: round2(l.quantity * l.unitPrice) }));
  const subtotal = round2(withTotals.reduce((s, l) => s + l.total, 0));
  const discount = Math.min(round2(opts.discount ?? 0), subtotal);
  const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
  const withTax = withTotals.map((l) => ({ ...l, taxAmount: round2(l.total * ratio * (l.taxRate / 100)) }));
  const taxAmount = round2(withTax.reduce((s, l) => s + l.taxAmount, 0));
  const shippingCost = round2(opts.shippingCost ?? 0);
  return {
    lines: withTax,
    subtotal,
    discount,
    taxAmount,
    ...splitGst(taxAmount, opts.interState),
    shippingCost,
    grandTotal: round2(subtotal - discount + taxAmount + shippingCost),
  };
}

/** Stored status of a bill (or invoice) from what has been paid. */
export function paidStatus(total: number, paid: number): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (paid > 0 && paid + 0.005 >= total) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'PENDING';
}

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days a due date has passed (0 or negative = not overdue yet). */
export const daysOverdue = (dueDate: Date | null, now = new Date()) =>
  dueDate ? Math.round((startOfDay(now).getTime() - startOfDay(dueDate).getTime()) / DAY) : 0;

export const AGE_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

/** Ageing bucket for an open document: "current" until the due date passes. */
export function ageBucket(dueDate: Date | null, now = new Date()): AgeBucket {
  const d = daysOverdue(dueDate, now);
  if (d <= 0) return 'current';
  if (d <= 30) return '1-30';
  if (d <= 60) return '31-60';
  if (d <= 90) return '61-90';
  return '90+';
}

/** Sum open balances into ageing buckets. */
export function ageingTotals(rows: { dueDate: Date | null; balance: number }[], now = new Date()) {
  const buckets = Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])) as Record<AgeBucket, number>;
  for (const r of rows) {
    const b = ageBucket(r.dueDate, now);
    buckets[b] = round2(buckets[b] + r.balance);
  }
  const total = round2(Object.values(buckets).reduce((s, v) => s + v, 0));
  return { buckets, total, overdue: round2(total - buckets.current) };
}

/**
 * GST set-off (GSTR-3B table 6.1, Rule 88A): input credit is used against output tax in
 * the legal order, and whatever is left is paid in cash.
 *  - IGST credit first: against IGST, then CGST, then SGST.
 *  - CGST credit: against CGST, then IGST. Never against SGST.
 *  - SGST credit: against SGST, then IGST. Never against CGST.
 */
export function setOffItc(output: GstSplit, credit: GstSplit) {
  const due = { igst: round2(output.igst), cgst: round2(output.cgst), sgst: round2(output.sgst) };
  const left = { igst: round2(credit.igst), cgst: round2(credit.cgst), sgst: round2(credit.sgst) };
  const used = { igst: 0, cgst: 0, sgst: 0 };

  const apply = (from: keyof GstSplit, to: keyof GstSplit) => {
    const amt = round2(Math.min(left[from], due[to]));
    if (amt <= 0) return;
    left[from] = round2(left[from] - amt);
    due[to] = round2(due[to] - amt);
    used[from] = round2(used[from] + amt);
  };

  apply('igst', 'igst');
  apply('igst', 'cgst');
  apply('igst', 'sgst');
  apply('cgst', 'cgst');
  apply('cgst', 'igst');
  apply('sgst', 'sgst');
  apply('sgst', 'igst');

  return {
    creditUsed: used,
    cashPayable: { ...due, total: round2(due.igst + due.cgst + due.sgst) },
    creditCarriedForward: { ...left, total: round2(left.igst + left.cgst + left.sgst) },
  };
}

/** Percentage with one decimal, or null when the base is zero. */
export const pct = (part: number, whole: number) => (Math.abs(whole) > 0.005 ? Math.round((part / whole) * 1000) / 10 : null);
