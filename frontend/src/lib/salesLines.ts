import { previewDocument } from './docmath';
import type { Customer } from './types';
import { UNITS, unitOf, type Unit } from './units';

/**
 * Line items shared by the invoice, quote and recurring-invoice forms: form state,
 * validation, API shape and the totals preview (same maths as the server).
 */

export type LineType = 'PRODUCT' | 'PACK' | 'CUSTOM';

export interface Line {
  key: number;
  type: LineType;
  itemId: string;
  name: string;
  hsnCode: string;
  quantity: string;
  unit: Unit;
  details: string; // e.g. "24 × 36 in × 2 = 12.00 sq ft"
  minCharge?: number | null; // the product's minimum charge per job
  unitPrice: string;
  taxRate: string;
}

export interface SavedLine {
  type: string;
  itemId: string | null;
  name: string | null;
  hsnCode: string | null;
  quantity: number;
  unit?: string | null;
  details?: string | null;
  minCharge?: number | null;
  unitPrice: number | null;
  taxRate: number | null;
}

let keySeq = 1;
export const toNum = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? 0 : Number(v));

export const blankLine = (defaultTax: number): Line => ({
  key: keySeq++,
  type: 'PRODUCT',
  itemId: '',
  name: '',
  hsnCode: '',
  quantity: '1',
  unit: 'pcs',
  details: '',
  unitPrice: '',
  taxRate: String(defaultTax),
});

export const linesFrom = (items: SavedLine[]): Line[] =>
  items.map((i) => ({
    key: keySeq++,
    type: i.type as LineType,
    itemId: i.itemId ?? '',
    name: i.name ?? '',
    hsnCode: i.hsnCode ?? '',
    quantity: String(i.quantity),
    unit: unitOf(i.unit),
    details: i.details ?? '',
    minCharge: i.minCharge ?? null,
    unitPrice: i.unitPrice === null ? '' : String(i.unitPrice),
    taxRate: i.taxRate === null ? '' : String(i.taxRate),
  }));

/** First problem with the lines, or null. */
export function lineError(lines: Line[], { allowBlankPrice = false } = {}): string | null {
  if (!lines.length) return 'Add at least one line item';
  for (const [i, l] of lines.entries()) {
    if (l.type !== 'CUSTOM' && !l.itemId) return `Line ${i + 1}: choose a ${l.type === 'PACK' ? 'pack' : 'product'}`;
    if (l.type === 'CUSTOM' && !l.name.trim()) return `Line ${i + 1}: enter a description`;
    const q = toNum(l.quantity);
    if (!(q > 0)) return `Line ${i + 1}: enter a quantity above 0`;
    const unit = UNITS[unitOf(l.unit)];
    if ((unit.whole || l.type === 'PACK') && !Number.isInteger(q)) return `Line ${i + 1}: ${unit.label} must be a whole number (or change the unit, e.g. to sq ft)`;
    if (Math.abs(q * 1000 - Math.round(q * 1000)) > 1e-6) return `Line ${i + 1}: use at most 3 decimal places`;
    const blank = l.unitPrice.trim() === '';
    if ((blank && !(allowBlankPrice && l.type !== 'CUSTOM')) || toNum(l.unitPrice) < 0) return `Line ${i + 1}: enter a unit price`;
  }
  return null;
}

/** API shape. A blank price on a catalog line means "use the catalog price at the time". */
export const linesBody = (lines: Line[]) =>
  lines.map((l) => ({
    type: l.type,
    itemId: l.type === 'CUSTOM' ? null : l.itemId,
    name: l.name.trim() || null,
    hsnCode: l.hsnCode.trim() || null,
    quantity: toNum(l.quantity),
    unit: l.type === 'PACK' ? 'pcs' : unitOf(l.unit),
    details: l.details?.trim() || null,
    unitPrice: l.unitPrice.trim() === '' ? undefined : toNum(l.unitPrice),
    taxRate: l.taxRate.trim() === '' ? null : toNum(l.taxRate),
  }));

const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
const gstState = (gstin?: string | null) => (gstin && /^\d{2}/.test(gstin.trim()) ? gstin.trim().slice(0, 2) : null);

/** Same-state vs inter-state guess for the preview (the server decides with GST state codes). */
export function isInterState(business: { state: string | null; gstNumber: string | null } | null, customer: Customer | null) {
  if (!business || !customer) return false;
  const a = gstState(business.gstNumber);
  const b = gstState(customer.gstin);
  if (a && b && !customer.state) return a !== b;
  return Boolean(business.state && customer.state && norm(business.state) !== norm(customer.state));
}

export function salesTotals(lines: Line[], discount: string, shipping: string, interState: boolean, catalogPrice: (l: Line) => number | null) {
  return previewDocument(
    lines.map((l) => ({
      quantity: toNum(l.quantity),
      unitPrice: l.unitPrice.trim() === '' ? (catalogPrice(l) ?? 0) : toNum(l.unitPrice),
      taxRate: toNum(l.taxRate),
      minCharge: l.type === 'PRODUCT' ? l.minCharge : null,
    })),
    { discount: toNum(discount), shippingCost: toNum(shipping), interState },
  );
}
