import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';

/**
 * v3.8: TDS on payments, supplier debit notes, stock valuation in the P&L, bank
 * statement reconciliation, GSTR-1 JSON and GSTR-2B matching.
 */

let auth: Record<string, string>;
let customer: string;
let b2bCustomer: string;
let supplier: string;
let vinyl: string;
const DAY = 86_400_000;
const isoDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const month = isoDay().slice(0, 7);
const ddmmyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  await api.put('/api/settings').set(auth).send({ state: 'Goa', gstNumber: '30ABCDE1234F1ZD' });
  customer = (await api.post('/api/customers').set(auth).send({ name: 'Goa Walk-in', state: 'Goa' })).body.data.id;
  b2bCustomer = (await api.post('/api/customers').set(auth).send({ name: 'Notebook Cafe', gstin: '27AAACN1234B1Z5' })).body.data.id;
  supplier = (await api.post('/api/suppliers').set(auth).send({ name: 'PrintPro Goa', gst: '30AAACP1234Q1ZL', state: 'Goa' })).body.data.id;
  vinyl = (await api.post('/api/inventory').set(auth).send({ name: 'Vinyl roll', unit: 'm', currentStock: 0, costPerUnit: 0 })).body.data.id;
});
afterAll(() => prisma.$disconnect());

describe('TDS', () => {
  let invoice: { id: string; invoiceNumber: string };

  it('settles an invoice with TDS deducted by the customer, counting only the cash as collected', async () => {
    invoice = (await api.post('/api/invoices').set(auth).send({ customerId: b2bCustomer, issue: true, items: [{ type: 'CUSTOM', name: 'Design work', unitPrice: 10000, taxRate: 18, quantity: 1 }] })).body.data;
    const bad = await api.post(`/api/invoices/${invoice.id}/payments`).set(auth).send({ amount: 100, tdsAmount: 200 });
    expect(bad.status).toBe(400);
    // Customer pays 11,800 less 10% TDS on 10,000 = 10,800 in cash.
    const paid = await api.post(`/api/invoices/${invoice.id}/payments`).set(auth).send({ amount: 11800, tdsAmount: 1000, paymentMethod: 'BANK_TRANSFER', referenceId: 'UTR1' });
    expect(paid.body.data).toMatchObject({ status: 'PAID', balanceDue: 0 });
    const k = (await api.get('/api/dashboard').set(auth)).body.data.kpis;
    expect(k.collectedThisMonth).toBe(10800);
    const cash = (await api.get(`/api/reports/cash?month=${month}`).set(auth)).body.data;
    expect(cash.moneyIn).toBe(10800);
    const st = (await api.get(`/api/customers/${b2bCustomer}/statement?month=${month}`).set(auth)).body.data;
    expect(st.lines.find((l: { kind: string }) => l.kind === 'PAYMENT').details).toMatch(/incl\. TDS 1000\.00/);
  });

  it('records TDS you deduct from supplier payments, by section', async () => {
    const bill = (await api.post('/api/bills').set(auth).send({ supplierId: supplier, billNumber: 'SVC-1', items: [{ description: 'Printing service', quantity: 1, unitPrice: 20000, taxRate: 18 }] })).body.data;
    const pay = await api.post(`/api/bills/${bill.id}/payments`).set(auth).send({ amount: 23600, tdsAmount: 400, tdsSection: '194C' });
    expect(pay.body.data).toMatchObject({ status: 'PAID' });
    const tds = (await api.get(`/api/reports/tds?month=${month}`).set(auth)).body.data;
    expect(tds.receivable).toMatchObject({ total: 1000 });
    expect(tds.receivable.rows[0]).toMatchObject({ customer: 'Notebook Cafe', invoice: invoice.invoiceNumber, tds: 1000 });
    expect(tds.payable.total).toBe(400);
    expect(tds.payable.bySection).toEqual([{ section: '194C', payments: 1, amount: 23600, tds: 400 }]);
    expect(tds.payable.byMonth).toEqual([{ month, tds: 400 }]);
    const cash = (await api.get(`/api/reports/cash?month=${month}`).set(auth)).body.data;
    expect(cash.moneyOut.supplierPayments).toBe(23200);
  });
});

describe('debit notes (purchase returns)', () => {
  let bill: { id: string; items: { id: string }[] };

  it('returns materials to the supplier, reversing GST and taking them out of stock', async () => {
    bill = (
      await api
        .post('/api/bills')
        .set(auth)
        .send({ supplierId: supplier, billNumber: 'MAT-1', addToStock: true, items: [{ inventoryItemId: vinyl, category: 'Raw materials', quantity: 10, unitPrice: 200, taxRate: 18 }] })
    ).body.data;
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: vinyl } })).currentStock).toBe(10);
    const over = await api.post(`/api/bills/${bill.id}/debit-notes`).set(auth).send({ items: [{ billItemId: bill.items[0]!.id, quantity: 11 }] });
    expect(over.status).toBe(400);
    const dn = await api.post(`/api/bills/${bill.id}/debit-notes`).set(auth).send({ reason: 'RETURN', restock: true, items: [{ billItemId: bill.items[0]!.id, quantity: 2 }] });
    expect(dn.status).toBe(201);
    expect(dn.body.data).toMatchObject({ debitNoteNumber: 'DN-0001', taxableValue: 400, taxAmount: 72, cgst: 36, sgst: 36, total: 472, refundAmount: 0, restock: true });
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: vinyl } })).currentStock).toBe(8);
    const b = (await api.get(`/api/bills/${bill.id}`).set(auth)).body.data;
    expect(b).toMatchObject({ amountDebited: 472, balanceDue: 1888, status: 'PARTIAL' });
    expect((await api.post(`/api/bills/${bill.id}/cancel`).set(auth)).status).toBe(400);
  });

  it('nets debit notes out of purchases, input credit, the register and what you owe', async () => {
    const pnl = (await api.get(`/api/reports/pnl?month=${month}`).set(auth)).body.data;
    expect(pnl.purchases.rows.find((r: { category: string }) => r.category === 'Raw materials').amount).toBe(1600);
    expect(pnl.debitNotes).toBe(1);
    const g = (await api.get(`/api/reports/gstr3b?month=${month}`).set(auth)).body.data;
    // Bills: 3,600 (service) + 360 (materials) of CGST+SGST, less 72 reversed.
    expect(g.itc.fromBills).toMatchObject({ cgst: 1944, sgst: 1944, debitNotes: 1, reversed: { igst: 0, cgst: 36, sgst: 36 } });
    const reg = await api.get(`/api/reports/purchase-register?month=${month}`).set(auth);
    expect(reg.text).toContain('Debit note,DN-0001');
    expect((await api.get('/api/bills').set(auth)).body.summary.owed).toBe(1888);
  });

  it('works out a refund when the bill was already paid, and cancelling puts everything back', async () => {
    await api.post(`/api/bills/${bill.id}/payments`).set(auth).send({ amount: 1888 });
    const dn2 = await api.post(`/api/bills/${bill.id}/debit-notes`).set(auth).send({ reason: 'DISCOUNT', items: [{ billItemId: bill.items[0]!.id, amount: 100 }] });
    expect(dn2.body.data).toMatchObject({ total: 118, refundAmount: 118 });
    const payId = (await api.get(`/api/bills/${bill.id}`).set(auth)).body.data.payments[0].id;
    expect((await api.delete(`/api/bills/${bill.id}/payments/${payId}`).set(auth)).status).toBe(400);
    await api.post(`/api/bills/debit-notes/${dn2.body.data.id}/cancel`).set(auth);
    const first = (await api.get('/api/bills/debit-notes/all').set(auth)).body.data.find((d: { debitNoteNumber: string }) => d.debitNoteNumber === 'DN-0001');
    await api.post(`/api/bills/debit-notes/${first.id}/cancel`).set(auth);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: vinyl } })).currentStock).toBe(10);
    expect((await api.get(`/api/bills/${bill.id}`).set(auth)).body.data).toMatchObject({ amountDebited: 0 });
  });
});

describe('stock valuation', () => {
  it('values stock at cost and shows the change in the P&L when both ends are known', async () => {
    const now = (await api.get('/api/reports/stock').set(auth)).body.data.now;
    expect(now).toEqual({ materialsValue: 2000, productsValue: 0, total: 2000 }); // 10 m of vinyl at 200
    let pnl = (await api.get(`/api/reports/pnl?month=${month}`).set(auth)).body.data;
    expect(pnl.stock).toBeNull(); // nothing recorded at the start of the month
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    await prisma.stockSnapshot.create({ data: { date: start, materialsValue: 500, productsValue: 0, total: 500 } });
    pnl = (await api.get(`/api/reports/pnl?month=${month}`).set(auth)).body.data;
    expect(pnl.stock).toMatchObject({ opening: 500, closing: 2000, change: 1500 });
    expect(pnl.stock.costOfSales).toBe(pnl.purchases.total - 1500);
    expect(pnl.stock.netProfitAfterStock).toBe(Math.round((pnl.netProfit + 1500) * 100) / 100);
    const snap = await api.post('/api/reports/stock/snapshot').set(auth);
    expect(snap.body.data.total).toBe(2000);
  });
});

describe('bank reconciliation', () => {
  let open: { id: string; invoiceNumber: string };
  let ids: Record<string, string> = {};

  const statement = () =>
    [
      'HDFC BANK Ltd.',
      'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
      `${ddmmyy(isoDay())},NEFT NOTEBOOK CAFE,UTR1,${ddmmyy(isoDay())},,"10,800.00","50,800.00"`,
      `${ddmmyy(isoDay())},UPI WALKIN ${open.invoiceNumber},UPI99,${ddmmyy(isoDay())},,590.00,"51,390.00"`,
      `${ddmmyy(isoDay())},BANK CHARGES,,${ddmmyy(isoDay())},118.00,,"51,272.00"`,
      `${ddmmyy(isoDay())},TRANSFER TO SELF,,${ddmmyy(isoDay())},"1,000.00",,"50,272.00"`,
    ].join('\n');

  it('previews a statement and recognises the columns', async () => {
    open = (await api.post('/api/invoices').set(auth).send({ customerId: customer, issue: true, items: [{ type: 'CUSTOM', name: 'Stickers', unitPrice: 500, taxRate: 18, quantity: 1 }] })).body.data;
    const p = await api.post('/api/bank/preview').set(auth).set('Content-Type', 'text/csv').send(statement());
    expect(p.status).toBe(200);
    expect(p.body.data.mapping).toMatchObject({ headerRow: 1, date: 0, description: 1, debit: 4, credit: 5 });
    expect(p.body.data.sample).toHaveLength(4);
  });

  it('imports once, and matches the payment already recorded automatically', async () => {
    const mapping = (await api.post('/api/bank/preview').set(auth).set('Content-Type', 'text/csv').send(statement())).body.data.mapping;
    const imp = await api.post(`/api/bank/import?mapping=${encodeURIComponent(JSON.stringify(mapping))}`).set(auth).set('Content-Type', 'text/csv').send(statement());
    expect(imp.status).toBe(201);
    // 10,800 = the cash part of the TDS payment recorded earlier.
    expect(imp.body.data).toMatchObject({ imported: 4, duplicates: 0, matched: 1 });
    const again = await api.post(`/api/bank/import?mapping=${encodeURIComponent(JSON.stringify(mapping))}`).set(auth).set('Content-Type', 'text/csv').send(statement());
    expect(again.body.data).toMatchObject({ imported: 0, duplicates: 4 });
    const list = (await api.get('/api/bank').set(auth)).body.data as { id: string; description: string; status: string; suggestions: { type: string; id: string }[] }[];
    ids = Object.fromEntries(list.map((t) => [t.description, t.id]));
    expect(list.find((t) => t.description === 'NEFT NOTEBOOK CAFE')!.status).toBe('MATCHED');
    const upi = list.find((t) => t.description.startsWith('UPI WALKIN'))!;
    expect(upi.suggestions[0]).toMatchObject({ type: 'INVOICE', id: open.id });
  });

  it('pays an open invoice from a bank line in one step', async () => {
    const res = await api.post(`/api/bank/${ids[`UPI WALKIN ${open.invoiceNumber}`]}/match`).set(auth).send({ type: 'INVOICE', id: open.id });
    expect(res.body.data.status).toBe('MATCHED');
    const inv = (await api.get(`/api/invoices/${open.id}`).set(auth)).body.data;
    expect(inv).toMatchObject({ status: 'PAID' });
    expect(inv.payments[0]).toMatchObject({ amount: 590, paymentMethod: 'BANK_TRANSFER', referenceId: 'UPI99', reconciled: true });
  });

  it('turns bank charges into an expense, ignores transfers, and can undo a match', async () => {
    const e = await api.post(`/api/bank/${ids['BANK CHARGES']}/expense`).set(auth).send({ category: 'Bank & payment charges', taxRate: 18 });
    expect(e.status).toBe(201);
    expect(e.body.data).toMatchObject({ amount: 100, taxAmount: 18, total: 118, reconciled: false });
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: e.body.data.id } })).reconciled).toBe(true);
    await api.post(`/api/bank/${ids['TRANSFER TO SELF']}/ignore`).set(auth);
    const summary = (await api.get('/api/bank').set(auth)).body.summary.byStatus;
    expect(summary).toMatchObject({ MATCHED: { count: 3 }, IGNORED: { count: 1 } });
    expect(summary.UNMATCHED).toBeUndefined();
    await api.post(`/api/bank/${ids['BANK CHARGES']}/unmatch`).set(auth);
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: e.body.data.id } })).reconciled).toBe(false);
    expect((await api.post(`/api/bank/${ids['NEFT NOTEBOOK CAFE']}/expense`).set(auth).send({ category: 'Rent' })).status).toBe(400);
  });

  it('is not available to sales staff', async () => {
    await api.post('/api/auth/users').set(auth).send({ name: 'Sales One', email: 'sales1@test.local', password: 'password123', role: 'SALES' });
    const t = (await api.post('/api/auth/login').send({ email: 'sales1@test.local', password: 'password123' })).body.token;
    expect((await api.get('/api/bank').set('Authorization', `Bearer ${t}`)).status).toBe(403);
  });
});

describe('GST portal files', () => {
  it('exports GSTR-1 JSON for a month', async () => {
    const res = await api.get(`/api/reports/gst/json?month=${month}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(new RegExp(`GSTR1_30ABCDE1234F1ZD_${month.slice(5)}${month.slice(0, 4)}\\.json`));
    expect(res.body.b2b[0]).toMatchObject({ ctin: '27AAACN1234B1Z5' });
    expect(res.body.b2b[0].inv[0]).toMatchObject({ val: 11800, pos: '27', itms: [{ num: 1801, itm_det: { txval: 10000, rt: 18, iamt: 1800 } }] });
    expect(res.body.b2cs[0]).toMatchObject({ sply_ty: 'INTRA', pos: '30', txval: 500, camt: 45, samt: 45 });
    expect((await api.get('/api/reports/gst/json?from=2026-01-01&to=2026-03-31').set(auth)).status).toBe(400);
  });

  it('matches GSTR-2B with your bills', async () => {
    const twoB = {
      data: {
        rtnprd: `${month.slice(5)}${month.slice(0, 4)}`,
        docdata: {
          b2b: [
            {
              ctin: '30AAACP1234Q1ZL',
              trdnm: 'PrintPro Goa',
              inv: [
                { inum: 'svc 1', dt: '01-10-2026', val: 23600, items: [{ rt: 18, txval: 20000, cgst: 1800, sgst: 1800 }] }, // matches SVC-1
                { inum: 'MAT-1', dt: '02-10-2026', val: 2400, items: [{ rt: 18, txval: 2000, cgst: 200, sgst: 200 }] }, // tax differs (we have 360)
                { inum: 'NEW-9', dt: '03-10-2026', val: 1180, items: [{ rt: 18, txval: 1000, cgst: 90, sgst: 90 }] }, // not in our books
              ],
            },
          ],
        },
      },
    };
    await api.post('/api/bills').set(auth).send({ supplierId: supplier, billNumber: 'LATE-1', items: [{ description: 'Ink', quantity: 1, unitPrice: 1000, taxRate: 18 }] });
    const r = (await api.post(`/api/reports/gstr2b/match?month=${month}`).set(auth).send(twoB)).body.data;
    expect(r.summary).toMatchObject({ portalInvoices: 3, matched: 1, mismatched: 1, missingInBooks: 1, missingInBooksTax: 180, notInPortal: 1, taxAtRisk: 180 });
    expect(r.matched.find((m: { number: string }) => m.number === 'MAT-1')).toMatchObject({ ok: false, taxDifference: 40 });
    expect(r.notInPortal[0]).toMatchObject({ number: 'LATE-1' });
    expect((await api.post('/api/reports/gstr2b/match').set(auth).send({ nope: true })).status).toBe(400);
  });
});
