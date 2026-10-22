import { describe, expect, it } from 'vitest';
import { computeDocument, fromInclusive } from '../../src/lib/accounting';
import { round2 } from '../../src/lib/util';
import { previewDocument, previewExpense } from '../../../frontend/src/lib/docmath';
import { lineError, linesBody, salesTotals, type Line } from '../../../frontend/src/lib/salesLines';

/** The bill/expense forms show live totals; they must match what the server saves. */

const cases = [
  { lines: [{ quantity: 2, unitPrice: 500, taxRate: 18 }, { quantity: 1, unitPrice: 250, taxRate: 5 }], discount: 125, shippingCost: 50 },
  { lines: [{ quantity: 3, unitPrice: 33.33, taxRate: 12 }], discount: 0.01, shippingCost: 0 },
  { lines: [{ quantity: 2.5, unitPrice: 80.4, taxRate: 28 }, { quantity: 7, unitPrice: 0, taxRate: 18 }], discount: 0, shippingCost: 12.5 },
  { lines: [{ quantity: 1, unitPrice: 100, taxRate: 18 }], discount: 1000, shippingCost: 0 },
  { lines: [{ quantity: 17, unitPrice: 19.99, taxRate: 3 }, { quantity: 4, unitPrice: 1234.56, taxRate: 18 }], discount: 321.09, shippingCost: 99 },
];

describe('frontend preview matches server totals', () => {
  for (const [i, c] of cases.entries()) {
    for (const interState of [false, true]) {
      it(`case ${i + 1} (${interState ? 'inter' : 'intra'}-state)`, () => {
        const server = computeDocument(c.lines, { ...c, interState });
        const preview = previewDocument(c.lines, { ...c, interState });
        expect(preview).toEqual({
          subtotal: server.subtotal,
          discount: server.discount,
          taxAmount: server.taxAmount,
          igst: server.igst,
          cgst: server.cgst,
          sgst: server.sgst,
          shippingCost: server.shippingCost,
          grandTotal: server.grandTotal,
        });
      });
    }
  }

  it('expense amounts with and without GST', () => {
    for (const [amount, rate] of [[1180, 18], [999, 12], [590, 18], [250, 0], [0.99, 5]] as const) {
      const s = fromInclusive(amount, rate);
      expect(previewExpense(amount, rate, true)).toEqual({ taxable: s.taxable, tax: s.tax, total: round2(amount) });
      expect(previewExpense(amount, rate, false)).toEqual({ taxable: amount, tax: round2((amount * rate) / 100), total: round2(amount + round2((amount * rate) / 100)) });
    }
  });
});

describe('invoice/quote form lines', () => {
  const line = (p: Partial<Line>): Line => ({ key: 1, type: 'CUSTOM', itemId: '', name: 'Work', hsnCode: '', quantity: '1', unitPrice: '100', taxRate: '18', ...p });

  it('previews the same totals the server computes', () => {
    const lines = [line({ quantity: '3', unitPrice: '333.33' }), line({ type: 'PRODUCT', itemId: 'p1', unitPrice: '', taxRate: '5' })];
    const preview = salesTotals(lines, '50', '20', false, (l) => (l.itemId === 'p1' ? 250 : null));
    const server = computeDocument([{ quantity: 3, unitPrice: 333.33, taxRate: 18 }, { quantity: 1, unitPrice: 250, taxRate: 5 }], { discount: 50, shippingCost: 20, interState: false });
    expect(preview.grandTotal).toBe(server.grandTotal);
    expect(preview.taxAmount).toBe(server.taxAmount);
  });

  it('validates lines like the server, allowing catalog prices only where asked', () => {
    expect(lineError([])).toMatch(/at least one/);
    expect(lineError([line({ name: ' ' })])).toMatch(/description/);
    expect(lineError([line({ quantity: '1.5' })])).toMatch(/whole number/);
    const catalog = line({ type: 'PRODUCT', itemId: 'p1', unitPrice: '' });
    expect(lineError([catalog])).toMatch(/unit price/);
    expect(lineError([catalog], { allowBlankPrice: true })).toBeNull();
    expect(linesBody([catalog])[0]).toMatchObject({ itemId: 'p1', unitPrice: undefined, quantity: 1 });
  });
});
