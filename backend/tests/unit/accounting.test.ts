import { describe, expect, it } from 'vitest';
import { ageBucket, ageingTotals, computeDocument, daysOverdue, fromInclusive, paidStatus, pct, setOffItc, splitGst } from '../../src/lib/accounting';

const daysAgo = (n: number, from = new Date(2026, 5, 15, 12)) => new Date(from.getTime() - n * 86_400_000);
const NOW = new Date(2026, 5, 15, 12); // 15 Jun 2026, midday

describe('splitGst', () => {
  it('puts everything in IGST for inter-state supplies', () => {
    expect(splitGst(180, true)).toEqual({ igst: 180, cgst: 0, sgst: 0 });
  });

  it('halves tax into CGST + SGST without losing a paisa', () => {
    expect(splitGst(180, false)).toEqual({ igst: 0, cgst: 90, sgst: 90 });
    const odd = splitGst(18.01, false);
    expect(odd.cgst + odd.sgst).toBeCloseTo(18.01, 10);
    expect(odd).toEqual({ igst: 0, cgst: 9.01, sgst: 9 });
  });
});

describe('fromInclusive', () => {
  it('extracts the taxable value and GST from an amount that includes GST', () => {
    expect(fromInclusive(1180, 18)).toEqual({ taxable: 1000, tax: 180 });
    expect(fromInclusive(999, 12)).toEqual({ taxable: 891.96, tax: 107.04 });
  });

  it('treats a 0% rate as all taxable', () => {
    expect(fromInclusive(250, 0)).toEqual({ taxable: 250, tax: 0 });
  });
});

describe('computeDocument', () => {
  const lines = [
    { quantity: 2, unitPrice: 500, taxRate: 18 },
    { quantity: 1, unitPrice: 250, taxRate: 5 },
  ];

  it('applies the discount before tax, apportioned across lines, with untaxed shipping', () => {
    const d = computeDocument(lines, { discount: 125, shippingCost: 50, interState: false });
    expect(d.subtotal).toBe(1250);
    expect(d.lines.map((l) => l.taxAmount)).toEqual([162, 11.25]);
    expect(d).toMatchObject({ discount: 125, taxAmount: 173.25, cgst: 86.63, sgst: 86.62, igst: 0, shippingCost: 50, grandTotal: 1348.25 });
  });

  it('uses IGST for inter-state documents', () => {
    const d = computeDocument(lines, { interState: true });
    expect(d).toMatchObject({ taxAmount: 192.5, igst: 192.5, cgst: 0, sgst: 0, grandTotal: 1442.5 });
  });

  it('never lets the discount exceed the subtotal', () => {
    const d = computeDocument([{ quantity: 1, unitPrice: 100, taxRate: 18 }], { discount: 500, interState: false });
    expect(d).toMatchObject({ discount: 100, taxAmount: 0, grandTotal: 0 });
  });

  it('handles fractional quantities (kg, metres)', () => {
    const d = computeDocument([{ quantity: 2.5, unitPrice: 80, taxRate: 12 }], { interState: false });
    expect(d).toMatchObject({ subtotal: 200, taxAmount: 24, grandTotal: 224 });
  });
});

describe('paidStatus', () => {
  it('moves from pending to partial to paid', () => {
    expect(paidStatus(1000, 0)).toBe('PENDING');
    expect(paidStatus(1000, 400)).toBe('PARTIAL');
    expect(paidStatus(1000, 1000)).toBe('PAID');
    expect(paidStatus(1000, 999.996)).toBe('PAID'); // rounding tolerance
  });
});

describe('ageing', () => {
  it('counts whole days past the due date', () => {
    expect(daysOverdue(null, NOW)).toBe(0);
    expect(daysOverdue(daysAgo(0), NOW)).toBe(0);
    expect(daysOverdue(daysAgo(3), NOW)).toBe(3);
    expect(daysOverdue(new Date(2026, 5, 20), NOW)).toBe(-5);
  });

  it('puts documents in the right bucket at each boundary', () => {
    expect(ageBucket(null, NOW)).toBe('current');
    expect(ageBucket(daysAgo(0), NOW)).toBe('current');
    expect(ageBucket(daysAgo(1), NOW)).toBe('1-30');
    expect(ageBucket(daysAgo(30), NOW)).toBe('1-30');
    expect(ageBucket(daysAgo(31), NOW)).toBe('31-60');
    expect(ageBucket(daysAgo(60), NOW)).toBe('31-60');
    expect(ageBucket(daysAgo(61), NOW)).toBe('61-90');
    expect(ageBucket(daysAgo(91), NOW)).toBe('90+');
  });

  it('totals balances per bucket', () => {
    const t = ageingTotals(
      [
        { dueDate: null, balance: 100 },
        { dueDate: daysAgo(10), balance: 200.5 },
        { dueDate: daysAgo(12), balance: 0.25 },
        { dueDate: daysAgo(100), balance: 50 },
      ],
      NOW,
    );
    expect(t.buckets).toEqual({ current: 100, '1-30': 200.75, '31-60': 0, '61-90': 0, '90+': 50 });
    expect(t.total).toBe(350.75);
    expect(t.overdue).toBe(250.75);
  });
});

describe('setOffItc (GSTR-3B set-off order)', () => {
  it('uses IGST credit first on IGST, then CGST, then SGST', () => {
    const r = setOffItc({ igst: 1000, cgst: 500, sgst: 500 }, { igst: 1200, cgst: 100, sgst: 300 });
    expect(r.creditUsed).toEqual({ igst: 1200, cgst: 100, sgst: 300 });
    expect(r.cashPayable).toEqual({ igst: 0, cgst: 200, sgst: 200, total: 400 });
    expect(r.creditCarriedForward.total).toBe(0);
  });

  it('never uses CGST credit against SGST (or the other way round)', () => {
    const r = setOffItc({ igst: 0, cgst: 0, sgst: 500 }, { igst: 0, cgst: 500, sgst: 0 });
    expect(r.cashPayable).toEqual({ igst: 0, cgst: 0, sgst: 500, total: 500 });
    expect(r.creditCarriedForward).toEqual({ igst: 0, cgst: 500, sgst: 0, total: 500 });
  });

  it('lets CGST and SGST credit pay IGST after their own head', () => {
    const r = setOffItc({ igst: 300, cgst: 100, sgst: 100 }, { igst: 0, cgst: 250, sgst: 200 });
    // CGST: 100 on CGST, 150 on IGST. SGST: 100 on SGST, then 100 on the remaining 150 IGST.
    expect(r.cashPayable).toEqual({ igst: 50, cgst: 0, sgst: 0, total: 50 });
    expect(r.creditCarriedForward.total).toBe(0);
  });

  it('carries forward unused credit and pays nothing when credit exceeds tax', () => {
    const r = setOffItc({ igst: 100, cgst: 50, sgst: 50 }, { igst: 500, cgst: 0, sgst: 0 });
    expect(r.cashPayable.total).toBe(0);
    expect(r.creditCarriedForward).toEqual({ igst: 300, cgst: 0, sgst: 0, total: 300 });
  });

  it('pays everything in cash when there is no credit', () => {
    expect(setOffItc({ igst: 10, cgst: 20, sgst: 20 }, { igst: 0, cgst: 0, sgst: 0 }).cashPayable.total).toBe(50);
  });
});

describe('pct', () => {
  it('returns a one-decimal percentage, or null for a zero base', () => {
    expect(pct(1631, 3500)).toBe(46.6);
    expect(pct(-50, 200)).toBe(-25);
    expect(pct(10, 0)).toBeNull();
  });
});
