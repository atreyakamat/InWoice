/**
 * Live totals for the bill and expense forms. Mirrors the server's rules
 * (backend/src/lib/accounting.ts) so the preview matches what gets saved; a backend
 * unit test checks the two stay in step.
 */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PreviewLine {
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export function previewDocument(lines: PreviewLine[], opts: { discount?: number; shippingCost?: number; interState: boolean }) {
  const totals = lines.map((l) => round2(l.quantity * round2(l.unitPrice)));
  const subtotal = round2(totals.reduce((s, t) => s + t, 0));
  const discount = Math.min(round2(opts.discount ?? 0), subtotal);
  const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
  const taxAmount = round2(lines.reduce((s, l, i) => s + round2(totals[i]! * ratio * (l.taxRate / 100)), 0));
  const half = round2(taxAmount / 2);
  const shippingCost = round2(opts.shippingCost ?? 0);
  return {
    subtotal,
    discount,
    taxAmount,
    igst: opts.interState ? taxAmount : 0,
    cgst: opts.interState ? 0 : half,
    sgst: opts.interState ? 0 : round2(taxAmount - half),
    shippingCost,
    grandTotal: round2(subtotal - discount + taxAmount + shippingCost),
  };
}

/** Taxable value and GST for an expense amount, entered with or without GST. */
export function previewExpense(amount: number, taxRate: number, taxInclusive: boolean) {
  if (taxInclusive) {
    const taxable = taxRate > 0 ? round2(amount / (1 + taxRate / 100)) : round2(amount);
    return { taxable, tax: round2(amount - taxable), total: round2(amount) };
  }
  const tax = round2((amount * taxRate) / 100);
  return { taxable: round2(amount), tax, total: round2(amount + tax) };
}

/** GST state code ("27") from a GSTIN, or null. */
export const gstinState = (gstin: string | null | undefined) => (gstin && /^\d{2}/.test(gstin.trim()) ? gstin.trim().slice(0, 2) : null);
