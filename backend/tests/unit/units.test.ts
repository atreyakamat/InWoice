import { describe, expect, it } from 'vitest';
import { UNITS as SERVER_UNITS, qtyText } from '../../src/lib/units';
import { UNITS as FORM_UNITS, areaOf } from '../../../frontend/src/lib/units';
import { previewDocument } from '../../../frontend/src/lib/docmath';

describe('size → square feet (the job calculator)', () => {
  it('24 × 36 in × 2 copies = 12 sq ft', () => {
    expect(areaOf({ width: 24, height: 36, lengthUnit: 'in', copies: 2 }, 'sqft')).toEqual({ quantity: 12, details: '24 × 36 in × 2 = 12.00 sq ft' });
  });

  it('a single copy leaves out "× 1"', () => {
    expect(areaOf({ width: 12, height: 12, lengthUnit: 'in', copies: 1 }, 'sqft').details).toBe('12 × 12 in = 1.00 sq ft');
  });

  it('works from cm, mm and feet', () => {
    expect(areaOf({ width: 30.48, height: 30.48, lengthUnit: 'cm', copies: 1 }, 'sqft').quantity).toBe(1);
    expect(areaOf({ width: 609.6, height: 304.8, lengthUnit: 'mm', copies: 3 }, 'sqft').quantity).toBe(6);
    expect(areaOf({ width: 4, height: 2.5, lengthUnit: 'ft', copies: 1 }, 'sqft').quantity).toBe(10);
  });

  it('odd sizes round to 2 decimals: 18 × 10 in = 1.25 sq ft; 7 × 5 in = 0.24 sq ft', () => {
    expect(areaOf({ width: 18, height: 10, lengthUnit: 'in', copies: 1 }, 'sqft').quantity).toBe(1.25);
    expect(areaOf({ width: 7, height: 5, lengthUnit: 'in', copies: 1 }, 'sqft').quantity).toBe(0.24);
  });

  it('can round each job up (e.g. to the next quarter square foot)', () => {
    expect(areaOf({ width: 7, height: 5, lengthUnit: 'in', copies: 1 }, 'sqft', 0.25).quantity).toBe(0.25);
    expect(areaOf({ width: 24, height: 36, lengthUnit: 'in', copies: 2 }, 'sqft', 0.25).quantity).toBe(12);
  });

  it('square metres too: 1 m × 1 m = 1 sq m', () => {
    expect(areaOf({ width: 100, height: 100, lengthUnit: 'cm', copies: 1 }, 'sqm').quantity).toBe(1);
  });

  it('the preview applies a minimum charge per line like the server', () => {
    expect(previewDocument([{ quantity: 1.5, unitPrice: 80, taxRate: 18, minCharge: 150 }], { interState: false })).toMatchObject({ subtotal: 150, grandTotal: 177 });
    expect(previewDocument([{ quantity: 2, unitPrice: 80, taxRate: 18, minCharge: 150 }], { interState: false }).subtotal).toBe(160);
  });

  it('rounding up to ½ sq ft: 7 × 5 in (0.24) → 0.5; 18 × 10 in (1.25) → 1.5', () => {
    expect(areaOf({ width: 7, height: 5, lengthUnit: 'in', copies: 1 }, 'sqft', 0.5).quantity).toBe(0.5);
    expect(areaOf({ width: 18, height: 10, lengthUnit: 'in', copies: 1 }, 'sqft', 0.5).quantity).toBe(1.5);
    expect(areaOf({ width: 12, height: 12, lengthUnit: 'in', copies: 1 }, 'sqft', 0.5).quantity).toBe(1);
  });

  it('the form previews ₹80/sq ft jobs exactly as the server will charge', () => {
    // 12 sq ft × ₹80 = ₹960 + 18% GST = ₹1,132.80; 2.25 sq ft × ₹80 = ₹180.
    expect(previewDocument([{ quantity: 12, unitPrice: 80, taxRate: 18 }], { interState: false })).toMatchObject({ subtotal: 960, cgst: 86.4, sgst: 86.4, grandTotal: 1132.8 });
    expect(previewDocument([{ quantity: 2.25, unitPrice: 80, taxRate: 18 }], { interState: false }).subtotal).toBe(180);
  });
});

describe('units', () => {
  it('the form and the server know the same units', () => {
    expect(Object.keys(FORM_UNITS)).toEqual(Object.keys(SERVER_UNITS));
    for (const k of Object.keys(SERVER_UNITS) as (keyof typeof SERVER_UNITS)[]) {
      expect(FORM_UNITS[k]).toMatchObject({ label: SERVER_UNITS[k].label, whole: SERVER_UNITS[k].whole });
    }
  });

  it('square feet use the GST unit code SQF', () => {
    expect(SERVER_UNITS.sqft.uqc).toBe('SQF');
    expect(SERVER_UNITS.pcs.uqc).toBe('NOS');
  });

  it('formats quantities', () => {
    expect(qtyText(12, 'sqft')).toBe('12 sq ft');
    expect(qtyText(2.25, 'sqft')).toBe('2.25 sq ft');
    expect(qtyText(3, 'pcs')).toBe('3 pcs');
    expect(qtyText(0.1 + 0.2, 'm')).toBe('0.3 m');
  });
});
