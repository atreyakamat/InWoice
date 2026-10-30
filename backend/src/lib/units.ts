/**
 * Units a line can be sold in. "pcs" is counted stock; the rest are measured (area, length,
 * time, weight) and allow decimal quantities. `uqc` is the GST Unique Quantity Code used in
 * the GSTR-1 HSN summary.
 */
export const UNITS = {
  pcs: { label: 'pcs', uqc: 'NOS', uqcLabel: 'NOS-NUMBERS', whole: true },
  sqft: { label: 'sq ft', uqc: 'SQF', uqcLabel: 'SQF-SQUARE FEET', whole: false },
  sqm: { label: 'sq m', uqc: 'SQM', uqcLabel: 'SQM-SQUARE METERS', whole: false },
  m: { label: 'm', uqc: 'MTR', uqcLabel: 'MTR-METERS', whole: false },
  ft: { label: 'ft', uqc: 'OTH', uqcLabel: 'OTH-OTHERS', whole: false },
  hrs: { label: 'hrs', uqc: 'OTH', uqcLabel: 'OTH-OTHERS', whole: false },
  kg: { label: 'kg', uqc: 'KGS', uqcLabel: 'KGS-KILOGRAMS', whole: false },
  set: { label: 'set', uqc: 'SET', uqcLabel: 'SET-SETS', whole: true },
  roll: { label: 'roll', uqc: 'ROL', uqcLabel: 'ROL-ROLLS', whole: true },
} as const;

export type Unit = keyof typeof UNITS;
export const UNIT_KEYS = Object.keys(UNITS) as Unit[];

export const unitOf = (u: string | null | undefined): Unit => (u && u in UNITS ? (u as Unit) : 'pcs');
export const unitLabel = (u: string | null | undefined) => UNITS[unitOf(u)].label;

/** "12.5 sq ft", "3 pcs" (whole numbers without decimals). */
export const qtyText = (q: number, u: string | null | undefined) => `${Number.isInteger(q) ? q : Number(q.toFixed(3))} ${unitLabel(u)}`;
