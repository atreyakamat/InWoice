/** Selling units (mirrors backend/src/lib/units.ts; a unit test checks they match). */
export const UNITS = {
  pcs: { label: 'pcs', whole: true },
  sqft: { label: 'sq ft', whole: false },
  sqm: { label: 'sq m', whole: false },
  m: { label: 'm', whole: false },
  ft: { label: 'ft', whole: false },
  hrs: { label: 'hrs', whole: false },
  kg: { label: 'kg', whole: false },
  set: { label: 'set', whole: true },
  roll: { label: 'roll', whole: true },
} as const;

export type Unit = keyof typeof UNITS;
export const UNIT_KEYS = Object.keys(UNITS) as Unit[];
export const unitOf = (u: string | null | undefined): Unit => (u && u in UNITS ? (u as Unit) : 'pcs');
export const unitLabel = (u: string | null | undefined) => UNITS[unitOf(u)].label;
export const isArea = (u: string | null | undefined) => u === 'sqft' || u === 'sqm';

/** "12.5 sq ft", "3 pcs". */
export const qtyText = (q: number, u: string | null | undefined) => `${Number.isInteger(q) ? q : Number(q.toFixed(3))} ${unitLabel(u)}`;

// --- Size → area ------------------------------------------------------------------------

/** Feet per unit of length. */
export const LENGTH_UNITS = { in: 1 / 12, cm: 1 / 30.48, mm: 1 / 304.8, ft: 1 } as const;
export type LengthUnit = keyof typeof LENGTH_UNITS;
const SQFT_TO_SQM = 0.09290304;

export interface SizeInput {
  width: number;
  height: number;
  lengthUnit: LengthUnit;
  copies: number;
}

/**
 * Area of a job (width × height × copies) in sq ft or sq m, rounded to 2 decimals, with a
 * description for the invoice line: "24 × 36 in × 2 = 12.00 sq ft".
 * `roundUpTo` (e.g. 0.25) rounds each job up to the next step, as many print shops do.
 */
export function areaOf(size: SizeInput, target: 'sqft' | 'sqm', roundUpTo = 0) {
  const f = LENGTH_UNITS[size.lengthUnit];
  const sqft = size.width * f * (size.height * f) * size.copies;
  let area = target === 'sqft' ? sqft : sqft * SQFT_TO_SQM;
  area = Math.round(area * 1e6) / 1e6; // drop float noise before rounding up
  if (roundUpTo > 0) area = Math.ceil(area / roundUpTo - 1e-9) * roundUpTo;
  const quantity = Math.round(area * 100) / 100;
  const n = (x: number) => String(Number(x.toFixed(2)));
  const details = `${n(size.width)} × ${n(size.height)} ${size.lengthUnit}${size.copies !== 1 ? ` × ${size.copies}` : ''} = ${quantity.toFixed(2)} ${unitLabel(target)}`;
  return { quantity, details };
}
