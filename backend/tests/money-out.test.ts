import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { exportData } from '../src/services/backup.service';

/**
 * v3.4 "money out": supplier bills, supplier payments, expenses, and the reports built on
 * them (P&L, GSTR-3B, ageing, cash). One business scenario with hand-checked numbers:
 *
 *  Sales:     35,000 taxable (30,000 intra-state + 5,000 inter-state to a registered buyer)
 *  Purchases: 11,100 (bills, GST you can claim excluded; the office chair's blocked GST included)
 *  Expenses:   7,590 (rent 5,000 + electricity 2,000 + courier 590 incl. its unclaimable GST)
 *  Net profit 16,310.
 */

let auth: Record<string, string>;
const DAY = 86_400_000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY).toISOString();
const month = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

const sup: Record<'local' | 'mh' | 'box', string> = { local: '', mh: '', box: '' };
const bill: Record<string, { id: string }> = {};
let vinyl: string;

const stockOf = async (id: string) => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).currentStock;

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  await api.put('/api/settings').set(auth).send({ state: 'Goa', gstNumber: '30ABCDE1234F1ZD', defaultTaxRate: 18, paymentTermsDays: 15 });
  vinyl = (await api.post('/api/inventory').set(auth).send({ name: 'Vinyl roll', unit: 'm', currentStock: 0 })).body.data.id;

  // Sales for the period.
  const walkIn = (await api.post('/api/customers').set(auth).send({ name: 'Goa Walk-in', state: 'Goa' })).body.data.id;
  const cafe = (await api.post('/api/customers').set(auth).send({ name: 'Notebook Cafe', gstin: '27AAACN1234B1Z5' })).body.data.id;
  const inv1 = await api
    .post('/api/invoices')
    .set(auth)
    .send({ customerId: walkIn, issue: true, items: [{ type: 'CUSTOM', name: 'Wall art', quantity: 30, unitPrice: 1000, taxRate: 18 }] });
  expect(inv1.body.data.grandTotal).toBe(35400);
  const inv2 = await api
    .post('/api/invoices')
    .set(auth)
    .send({ customerId: cafe, issue: true, dueDate: daysFromNow(-10), items: [{ type: 'CUSTOM', name: 'Mural', quantity: 1, unitPrice: 5000, taxRate: 18 }] });
  expect(inv2.body.data.igst).toBe(900);
  await api.post(`/api/invoices/${inv1.body.data.id}/payments`).set(auth).send({ amount: 20000, paymentMethod: 'UPI' });
});
afterAll(() => prisma.$disconnect());

describe('suppliers', () => {
  it('validates the supplier GSTIN and stores the state', async () => {
    const bad = await api.post('/api/suppliers').set(auth).send({ name: 'Typo Ltd', gst: '30AAACP1234Q1ZM' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/check digit/);

    const local = await api.post('/api/suppliers').set(auth).send({ name: 'PrintPro Goa', gst: '30aaacp1234q1zl', state: 'Goa', paymentTerms: 'Net 15' });
    expect(local.status).toBe(201);
    expect(local.body.data.gst).toBe('30AAACP1234Q1ZL');
    sup.local = local.body.data.id;
    sup.mh = (await api.post('/api/suppliers').set(auth).send({ name: 'Mumbai Inks', gst: '27AAACM5678R1ZL' })).body.data.id;
    sup.box = (await api.post('/api/suppliers').set(auth).send({ name: 'Box Mart' })).body.data.id;
  });
});

describe('bills', () => {
  it('requires a login', async () => {
    expect((await api.get('/api/bills')).status).toBe(401);
  });

  it('records a same-state bill with CGST+SGST, adds materials to stock and sets the due date from the terms', async () => {
    const res = await api
      .post('/api/bills')
      .set(auth)
      .send({
        supplierId: sup.local,
        billNumber: 'PP-101',
        shippingCost: 100,
        addToStock: true,
        items: [
          { inventoryItemId: vinyl, quantity: 10, unitPrice: 200, taxRate: 18 },
          { description: 'Cutting blades', category: 'Tools & equipment', quantity: 2, unitPrice: 150, taxRate: 18 },
        ],
      });
    expect(res.status).toBe(201);
    const b = res.body.data;
    expect(b).toMatchObject({ subtotal: 2300, taxAmount: 414, cgst: 207, sgst: 207, igst: 0, grandTotal: 2814, itcEligible: true, addToStock: true, status: 'PENDING', balanceDue: 2814 });
    expect(b.items[0]).toMatchObject({ description: 'Vinyl roll', category: 'Purchases' });
    expect(Math.round((new Date(b.dueDate).getTime() - new Date(b.date).getTime()) / DAY)).toBe(15);
    expect(await stockOf(vinyl)).toBe(10);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: vinyl } })).costPerUnit).toBe(200);
    bill.a = b;
  });

  it('re-applies stock exactly when an unpaid bill is edited', async () => {
    const lines = (qty: number) => [
      { inventoryItemId: vinyl, quantity: qty, unitPrice: 200, taxRate: 18 },
      { description: 'Cutting blades', category: 'Tools & equipment', quantity: 2, unitPrice: 150, taxRate: 18 },
    ];
    const edited = await api.put(`/api/bills/${bill.a.id}`).set(auth).send({ supplierId: sup.local, billNumber: 'PP-101', shippingCost: 100, addToStock: true, items: lines(12) });
    expect(edited.status).toBe(200);
    expect(edited.body.data.grandTotal).toBe(3286);
    expect(await stockOf(vinyl)).toBe(12);
    const back = await api.put(`/api/bills/${bill.a.id}`).set(auth).send({ supplierId: sup.local, billNumber: 'PP-101', shippingCost: 100, addToStock: true, items: lines(10) });
    expect(back.body.data.grandTotal).toBe(2814);
    expect(await stockOf(vinyl)).toBe(10);
  });

  it('uses IGST for an out-of-state supplier (state taken from the GSTIN) and applies the discount before tax', async () => {
    const res = await api
      .post('/api/bills')
      .set(auth)
      .send({ supplierId: sup.mh, billNumber: 'MH/77', dueDate: daysFromNow(-40), discount: 200, items: [{ description: 'Ink', quantity: 5, unitPrice: 400, taxRate: 12 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: 2000, discount: 200, igst: 216, cgst: 0, grandTotal: 2016, displayStatus: 'OVERDUE' });
    bill.b = res.body.data;
  });

  it('allows the same bill number from a different supplier, with no input credit from an unregistered one', async () => {
    const res = await api
      .post('/api/bills')
      .set(auth)
      .send({ supplierId: sup.box, billNumber: 'PP-101', items: [{ description: 'Packing boxes', category: 'Packaging', quantity: 100, unitPrice: 10, taxRate: 0 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ grandTotal: 1000, itcEligible: false, dueDate: null });
    bill.c = res.body.data;
  });

  it('rejects a duplicate bill number from the same supplier', async () => {
    const dup = await api.post('/api/bills').set(auth).send({ supplierId: sup.local, billNumber: 'PP-101', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    expect(dup.status).toBe(409);
  });

  it('can mark GST as not claimable (blocked credit)', async () => {
    const res = await api
      .post('/api/bills')
      .set(auth)
      .send({ supplierId: sup.local, billNumber: 'CH-9', itcEligible: false, items: [{ description: 'Office chair', category: 'Furniture', quantity: 1, unitPrice: 5000, taxRate: 18 }] });
    expect(res.body.data).toMatchObject({ taxAmount: 900, cgst: 450, sgst: 450, grandTotal: 5900, itcEligible: false });
    bill.d = res.body.data;
  });

  it('reverses stock when a bill is cancelled, and cancelling twice is harmless', async () => {
    const e = await api
      .post('/api/bills')
      .set(auth)
      .send({ supplierId: sup.local, billNumber: 'TMP-1', addToStock: true, items: [{ inventoryItemId: vinyl, quantity: 5, unitPrice: 200, taxRate: 18 }] });
    expect(await stockOf(vinyl)).toBe(15);
    const c = await api.post(`/api/bills/${e.body.data.id}/cancel`).set(auth);
    expect(c.body.data.status).toBe('CANCELLED');
    expect(await stockOf(vinyl)).toBe(10);
    expect((await api.post(`/api/bills/${e.body.data.id}/cancel`).set(auth)).status).toBe(200);
    expect(await stockOf(vinyl)).toBe(10);
    expect((await api.put(`/api/bills/${e.body.data.id}`).set(auth).send({ supplierId: sup.local, billNumber: 'TMP-1', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] })).status).toBe(400);
  });

  it('refuses a purchase order from another supplier', async () => {
    const po = await api.post('/api/purchase-orders').set(auth).send({ supplierId: sup.local, items: [{ inventoryItemId: vinyl, quantityOrdered: 1, unitPrice: 1 }] });
    const res = await api.post('/api/bills').set(auth).send({ supplierId: sup.mh, billNumber: 'X-1', purchaseOrderId: po.body.data.id, items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/different supplier/);
    await api.delete(`/api/purchase-orders/${po.body.data.id}`).set(auth);
  });
});

describe('supplier payments', () => {
  it('blocks overpayment and marks a bill paid', async () => {
    const over = await api.post(`/api/bills/${bill.a.id}/payments`).set(auth).send({ amount: 3000 });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/exceeds/);
    const paid = await api.post(`/api/bills/${bill.a.id}/payments`).set(auth).send({ amount: 2814, paymentMethod: 'UPI', referenceId: 'UTR123' });
    expect(paid.status).toBe(201);
    expect(paid.body.data).toMatchObject({ status: 'PAID', balanceDue: 0, amountPaid: 2814 });
  });

  it('locks a part-paid bill against edits and cancellation, and deleting a payment restores the balance', async () => {
    const part = await api.post(`/api/bills/${bill.b.id}/payments`).set(auth).send({ amount: 1000, paymentMethod: 'BANK_TRANSFER' });
    expect(part.body.data).toMatchObject({ status: 'PARTIAL', balanceDue: 1016 });
    const edit = await api.put(`/api/bills/${bill.b.id}`).set(auth).send({ supplierId: sup.mh, billNumber: 'MH/77', items: [{ description: 'Ink', quantity: 1, unitPrice: 1 }] });
    expect(edit.status).toBe(400);
    expect((await api.post(`/api/bills/${bill.b.id}/cancel`).set(auth)).status).toBe(400);

    const extra = await api.post(`/api/bills/${bill.b.id}/payments`).set(auth).send({ amount: 500, paymentMethod: 'CASH' });
    const payId = extra.body.data.payments.find((p: { amount: number }) => p.amount === 500).id;
    const undone = await api.delete(`/api/bills/${bill.b.id}/payments/${payId}`).set(auth);
    expect(undone.body.data).toMatchObject({ amountPaid: 1000, status: 'PARTIAL' });
  });

  it('lists, filters and totals what is owed', async () => {
    const all = await api.get('/api/bills').set(auth);
    expect(all.body.total).toBe(5);
    expect(all.body.summary).toEqual({ openBills: 3, owed: 7916 });
    const overdue = await api.get('/api/bills?status=OVERDUE').set(auth);
    expect(overdue.body.data.map((b: { billNumber: string }) => b.billNumber)).toEqual(['MH/77']);
    expect((await api.get('/api/bills?q=mumbai').set(auth)).body.total).toBe(1);
    expect((await api.get(`/api/bills?supplierId=${sup.local}&status=OPEN`).set(auth)).body.total).toBe(1);
  });

  it('shows the balance owed on each supplier', async () => {
    const list = (await api.get('/api/suppliers').set(auth)).body.data as { id: string; balanceDue: number }[];
    const owed = Object.fromEntries(list.map((s) => [s.id, s.balanceDue]));
    expect(owed).toEqual({ [sup.local]: 5900, [sup.mh]: 1016, [sup.box]: 1000 });
    const detail = await api.get(`/api/suppliers/${sup.local}`).set(auth);
    expect(detail.body.data.balanceDue).toBe(5900);
    expect(detail.body.data.bills.length).toBe(3);
  });
});

describe('expenses', () => {
  it('records GST-inclusive expenses and works out the input credit', async () => {
    const rent = await api.post('/api/expenses').set(auth).send({ category: 'Rent', description: 'Shop rent', amount: 5000, paymentMethod: 'BANK_TRANSFER' });
    expect(rent.status).toBe(201);
    expect(rent.body.data).toMatchObject({ amount: 5000, taxAmount: 0, total: 5000, itcEligible: false });

    const power = await api
      .post('/api/expenses')
      .set(auth)
      .send({ category: 'Electricity & utilities', description: 'June bill', amount: 2360, taxRate: 18, vendor: 'Goa Power', vendorGstin: '30aaape4321k1zf' });
    expect(power.body.data).toMatchObject({ amount: 2000, taxAmount: 360, cgst: 180, sgst: 180, igst: 0, total: 2360, itcEligible: true, vendorGstin: '30AAAPE4321K1ZF' });

    const courier = await api.post('/api/expenses').set(auth).send({ category: 'Transport & courier', description: 'Courier', amount: 590, taxRate: 18 });
    expect(courier.body.data).toMatchObject({ amount: 500, taxAmount: 90, itcEligible: false });
  });

  it('validates input', async () => {
    const noGstin = await api.post('/api/expenses').set(auth).send({ category: 'Rent', description: 'x', amount: 100, taxRate: 18, itcEligible: true });
    expect(noGstin.status).toBe(400);
    expect(noGstin.body.error).toMatch(/GSTIN/);
    expect((await api.post('/api/expenses').set(auth).send({ category: 'Rent', description: 'x', amount: 100, vendorGstin: 'BAD' })).status).toBe(400);
    expect((await api.post('/api/expenses').set(auth).send({ category: 'Rent', amount: 100 })).status).toBe(400);
    expect((await api.post('/api/expenses').set(auth).send({ category: 'Rent', description: 'x', amount: 0 })).status).toBe(400);
  });

  it('edits (GST on top) and deletes an expense', async () => {
    const snack = (await api.post('/api/expenses').set(auth).send({ category: 'Food & refreshments', description: 'Snacks', amount: 100 })).body.data;
    const upd = await api.put(`/api/expenses/${snack.id}`).set(auth).send({ category: 'Food & refreshments', description: 'Snacks', amount: 150, taxRate: 5, taxInclusive: false });
    expect(upd.body.data).toMatchObject({ amount: 150, taxAmount: 7.5, total: 157.5 });
    expect((await api.delete(`/api/expenses/${snack.id}`).set(auth)).status).toBe(200);
    expect((await api.get(`/api/expenses/${snack.id}`).set(auth)).status).toBe(404);
  });

  it('lists with totals by category and suggests categories', async () => {
    const list = await api.get('/api/expenses').set(auth);
    expect(list.body.total).toBe(3);
    expect(list.body.summary.total).toBe(7950);
    expect(list.body.summary.byCategory[0]).toEqual({ category: 'Rent', total: 5000 });
    expect((await api.get('/api/expenses?q=courier').set(auth)).body.total).toBe(1);
    const cats = (await api.get('/api/expenses/categories').set(auth)).body.data as string[];
    expect(cats).toContain('Rent');
    expect(cats).toContain('Other');
    expect(new Set(cats).size).toBe(cats.length);
  });
});

describe('profit & loss', () => {
  it('nets sales, purchases and expenses, excluding claimable GST', async () => {
    const res = await api.get(`/api/reports/pnl?month=${month}`).set(auth);
    expect(res.status).toBe(200);
    const p = res.body.data;
    expect(p.income).toMatchObject({ sales: 35000, shipping: 0, creditNotes: 0, net: 35000, invoices: 2 });
    expect(p.purchases.rows).toEqual([
      { category: 'Furniture', amount: 5900 },
      { category: 'Purchases', amount: 3800 },
      { category: 'Packaging', amount: 1000 },
      { category: 'Tools & equipment', amount: 300 },
      { category: 'Freight on purchases', amount: 100 },
    ]);
    expect(p.purchases).toMatchObject({ total: 11100, bills: 4 });
    expect(p.grossProfit).toBe(23900);
    expect(p.grossMarginPct).toBe(68.3);
    expect(p.expenses.rows).toEqual([
      { category: 'Rent', amount: 5000 },
      { category: 'Electricity & utilities', amount: 2000 },
      { category: 'Transport & courier', amount: 590 },
    ]);
    expect(p.netProfit).toBe(16310);
    expect(p.netMarginPct).toBe(46.6);
    expect(p.months).toEqual([{ month, income: 35000, purchases: 11100, expenses: 7590, profit: 16310 }]);
  });

  it('exports the P&L as CSV', async () => {
    const res = await api.get(`/api/reports/pnl/csv?month=${month}`).set(auth);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Net profit,Net profit,16310');
    expect(res.text).toContain('Purchases,Furniture,-5900');
  });

  it('is empty for a month with no activity', async () => {
    const p = (await api.get('/api/reports/pnl?month=2020-01').set(auth)).body.data;
    expect(p).toMatchObject({ netProfit: 0, netMarginPct: null });
  });
});

describe('GSTR-3B', () => {
  it('summarises output tax, input credit and cash payable after set-off', async () => {
    const r = (await api.get(`/api/reports/gstr3b?month=${month}`).set(auth)).body.data;
    expect(r.outward).toEqual({ taxable: 35000, igst: 900, cgst: 2700, sgst: 2700, totalTax: 6300 });
    expect(r.itc.fromBills).toMatchObject({ igst: 216, cgst: 207, sgst: 207, documents: 2, debitNotes: 0 });
    expect(r.itc.fromExpenses).toEqual({ igst: 0, cgst: 180, sgst: 180, documents: 1 });
    expect(r.itc.total).toEqual({ igst: 216, cgst: 387, sgst: 387, totalTax: 990 });
    expect(r.ineligibleItc).toEqual({ igst: 0, cgst: 495, sgst: 495, totalTax: 990 });
    expect(r.cashPayable).toEqual({ igst: 684, cgst: 2313, sgst: 2313, total: 5310 });
    expect(r.creditCarriedForward.total).toBe(0);
    expect(r.interStateUnregistered).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/GSTR-2B/);
  });
});

describe('ageing and cash', () => {
  it('ages receivables and payables', async () => {
    const r = (await api.get('/api/reports/ageing').set(auth)).body.data;
    expect(r.payables).toMatchObject({ total: 7916, overdue: 1016, count: 3 });
    expect(r.payables.buckets).toEqual({ current: 6900, '1-30': 0, '31-60': 1016, '61-90': 0, '90+': 0 });
    expect(r.payables.parties[0]).toMatchObject({ name: 'Mumbai Inks', overdue: 1016 });
    expect(r.payables.oldest[0]).toMatchObject({ number: 'MH/77', daysOverdue: 40 });
    expect(r.receivables).toMatchObject({ total: 21300, overdue: 5900 });
    expect(r.receivables.buckets['1-30']).toBe(5900);
  });

  it('shows money in and out and what falls due soon', async () => {
    const c = (await api.get(`/api/reports/cash?month=${month}`).set(auth)).body.data;
    expect(c.moneyIn).toBe(20000);
    expect(c.moneyOut).toEqual({ supplierPayments: 3814, expenses: 7950, total: 11764 });
    expect(c.net).toBe(8236);
    expect(c.upcoming.toPay).toEqual({ overdue: 1016, next7Days: 2016, next30Days: 7916, total: 7916 });
    expect(c.upcoming.toReceive).toMatchObject({ overdue: 5900, next30Days: 21300, total: 21300 });
  });

  it('exports a purchase register with every bill line and expense', async () => {
    const res = await api.get(`/api/reports/purchase-register?month=${month}`).set(auth);
    const lines = res.text.replace(/^﻿/, '').split('\n');
    expect(lines[0]).toBe('document,number,date,party,gstin,item,category,hsn,quantity,unitPrice,taxRate,taxableValue,cgst,sgst,igst,total,itcEligible,reference');
    expect(lines.length).toBe(10); // header + 3 lines of PP-101 (incl. freight) + MH/77 + boxes + chair + 3 expenses
    expect(res.text).toContain('Bill,MH/77');
    expect(res.text).not.toContain('TMP-1'); // cancelled
  });
});

describe('dashboard and insights', () => {
  it('shows payables, spending and profit this month', async () => {
    const k = (await api.get('/api/dashboard').set(auth)).body.data.kpis;
    expect(k).toMatchObject({ payables: 7916, payablesCount: 3, payablesOverdue: 1016, payablesOverdueCount: 1, spentThisMonth: 11764, profitThisMonth: 16310, tracksCosts: true });
  });

  it('flags overdue supplier bills and scores profit from the real margin', async () => {
    const r = (await api.post('/api/executive/analyze').set(auth)).body.data;
    expect(r.healthScore.profitHealth).toBe(100); // 46.6% net margin
    const risks = (await api.get('/api/executive').set(auth)).body.data.risks as { referenceType: string; title: string }[];
    expect(risks.some((x) => x.referenceType === 'BILL' && x.title.includes('MH/77'))).toBe(true);
    expect(r.briefing.content).toContain('Owed to suppliers');
  });
});

describe('purchase orders and bills', () => {
  it('links a bill to a received order without adding stock twice', async () => {
    const po = (await api.post('/api/purchase-orders').set(auth).send({ supplierId: sup.local, status: 'ORDERED', items: [{ inventoryItemId: vinyl, quantityOrdered: 20, unitPrice: 190 }] })).body.data;
    await api.post(`/api/purchase-orders/${po.id}/receive`).set(auth).send({ items: [{ inventoryItemId: vinyl, quantity: 20 }] });
    expect(await stockOf(vinyl)).toBe(30);
    const b = await api
      .post('/api/bills')
      .set(auth)
      .send({ supplierId: sup.local, billNumber: 'PP-150', purchaseOrderId: po.id, addToStock: true, items: [{ inventoryItemId: vinyl, quantity: 20, unitPrice: 190, taxRate: 18 }] });
    expect(b.status).toBe(201);
    expect(b.body.data).toMatchObject({ addToStock: false, grandTotal: 4484, purchaseOrder: { poNumber: po.poNumber } });
    expect(await stockOf(vinyl)).toBe(30);
    const withBills = (await api.get(`/api/purchase-orders/${po.id}`).set(auth)).body.data;
    expect(withBills.bills.map((x: { billNumber: string }) => x.billNumber)).toEqual(['PP-150']);
  });

  it('keeps suppliers with bills (marks them inactive instead of deleting)', async () => {
    const res = await api.delete(`/api/suppliers/${sup.box}`).set(auth);
    expect(res.body.message).toMatch(/inactive/);
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: sup.box } })).status).toBe('INACTIVE');
  });

  it('includes bills, payments and expenses in backups', async () => {
    const b = await exportData();
    expect(b.tables.Bill?.length).toBe(6);
    expect(b.tables.BillItem?.length).toBe(7);
    expect(b.tables.BillPayment?.length).toBe(2);
    expect(b.tables.Expense?.length).toBe(3);
  });
});
