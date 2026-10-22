import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { gstinCheckChar, gstinError, stateCode } from '../src/lib/gst';

let auth: Record<string, string>;
let b2bCustomer: string; // registered, Maharashtra (state taken from the GSTIN)
let goaCustomer: string; // unregistered, same state
let keralaCustomer: string; // unregistered, other state
let sticker: { id: string };
let lamp: { id: string };
const inv: Record<string, { id: string; invoiceNumber: string }> = {};
const month = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  await api.put('/api/settings').set(auth).send({ state: 'Goa', gstNumber: '30ABCDE1234F1ZD', defaultTaxRate: 18, invoicePrefix: 'G-' });
  sticker = (await api.post('/api/products').set(auth).send({ name: 'Sticker', price: 100, stock: 100, hsnCode: '4911' })).body.data;
  lamp = (await api.post('/api/products').set(auth).send({ name: 'Lamp', price: 60000, stock: 10, hsnCode: '9405', taxRate: 12 })).body.data;
});
afterAll(() => prisma.$disconnect());

const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
const getInvoice = async (id: string) => (await api.get(`/api/invoices/${id}`).set(auth)).body.data;

describe('GST helpers', () => {
  it('validates GSTIN structure and check digit', () => {
    expect(gstinError('27AAPFU0939F1ZV')).toBeNull(); // a published, valid GSTIN
    expect(gstinError('27AAPFU0939F1ZX')).toMatch(/check digit/);
    expect(gstinError('GST123')).toMatch(/15 characters/);
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V');
  });

  it('resolves state names, aliases and codes', () => {
    expect(stateCode('Goa')).toBe('30');
    expect(stateCode('tamil nadu')).toBe('33');
    expect(stateCode('TN')).toBe('33');
    expect(stateCode('Orissa')).toBe('21');
    expect(stateCode('32-Kerala')).toBe('32');
    expect(stateCode('Atlantis')).toBeNull();
  });
});

describe('customers with GSTIN', () => {
  it('rejects a mistyped GSTIN and normalises a valid one', async () => {
    const bad = await api.post('/api/customers').set(auth).send({ name: 'Typo Traders', gstin: '27AAACN1234B1Z9' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/check digit/);
    const ok = await api.post('/api/customers').set(auth).send({ name: 'Notebook Café', gstin: '27aaacn1234b1z5' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.gstin).toBe('27AAACN1234B1Z5');
    b2bCustomer = ok.body.data.id;
    goaCustomer = (await api.post('/api/customers').set(auth).send({ name: 'Goa Walk-in', state: 'goa' })).body.data.id;
    keralaCustomer = (await api.post('/api/customers').set(auth).send({ name: 'Kerala Resort', state: 'Kerala' })).body.data.id;
  });
});

describe('invoices for the period', () => {
  it('derives inter-state IGST from the customer GSTIN when no state is given', async () => {
    const res = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: b2bCustomer, issue: true, items: [{ type: 'PRODUCT', itemId: sticker.id, quantity: 10 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ invoiceNumber: 'G-0001', subtotal: 1000, igst: 180, cgst: 0, grandTotal: 1180, placeOfSupply: '27-Maharashtra' });
    inv.b2b = res.body.data;
  });

  it('creates a discounted intra-state B2C invoice and pays it', async () => {
    const res = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: goaCustomer, issue: true, discount: 100, items: [{ type: 'PRODUCT', itemId: sticker.id, quantity: 5 }] });
    expect(res.body.data).toMatchObject({ subtotal: 500, taxAmount: 72, cgst: 36, sgst: 36, grandTotal: 472 });
    inv.b2cs = res.body.data;
    const paid = await api.post(`/api/invoices/${inv.b2cs.id}/payments`).set(auth).send({ amount: 472, paymentMethod: 'CASH' });
    expect(paid.body.data.status).toBe('PAID');
  });

  it('creates a large inter-state B2C invoice (B2CL), a draft and a cancelled invoice', async () => {
    const big = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: keralaCustomer, issue: true, items: [{ type: 'PRODUCT', itemId: lamp.id, quantity: 2 }] });
    expect(big.body.data).toMatchObject({ subtotal: 120000, igst: 14400, grandTotal: 134400 });
    inv.b2cl = big.body.data;
    await api.post('/api/invoices').set(auth).send({ customerId: goaCustomer, items: [{ type: 'CUSTOM', name: 'Draft', unitPrice: 10, quantity: 1 }] });
    const c = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: goaCustomer, issue: true, items: [{ type: 'CUSTOM', name: 'Oops', unitPrice: 10, quantity: 1 }] });
    await api.post(`/api/invoices/${c.body.data.id}/cancel`).set(auth);
  });
});

describe('credit notes', () => {
  it('refuses credit notes on drafts and cancelled invoices', async () => {
    const draft = await prisma.invoice.findFirstOrThrow({ where: { status: 'DRAFT' }, include: { items: true } });
    const res = await api
      .post(`/api/invoices/${draft.id}/credit-notes`)
      .set(auth)
      .send({ items: [{ invoiceItemId: draft.items[0]!.id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('a return on a paid invoice restocks goods and records a refund due', async () => {
    const full = await getInvoice(inv.b2cs.id);
    const before = await stockOf(sticker.id);
    const res = await api
      .post(`/api/invoices/${inv.b2cs.id}/credit-notes`)
      .set(auth)
      .send({ reason: 'RETURN', restock: true, items: [{ invoiceItemId: full.items[0].id, quantity: 2 }] });
    expect(res.status).toBe(201);
    // 2 x 100 x (400/500 after discount) = 160 taxable, 18% => 28.80 split CGST/SGST
    expect(res.body.data).toMatchObject({ creditNoteNumber: 'CN-0001', taxableValue: 160, taxAmount: 28.8, cgst: 14.4, sgst: 14.4, igst: 0, total: 188.8, refundAmount: 188.8 });
    expect(await stockOf(sticker.id)).toBe(before + 2);
    const after = await getInvoice(inv.b2cs.id);
    expect(after).toMatchObject({ amountCredited: 188.8, status: 'PAID', balanceDue: 0, displayStatus: 'PAID' });
    expect(after.creditNotes).toHaveLength(1);
  });

  it('cannot credit more than was invoiced', async () => {
    const full = await getInvoice(inv.b2cs.id);
    const res = await api
      .post(`/api/invoices/${inv.b2cs.id}/credit-notes`)
      .set(auth)
      .send({ items: [{ invoiceItemId: full.items[0].id, quantity: 4 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only 3 left/);
    const empty = await api.post(`/api/invoices/${inv.b2cs.id}/credit-notes`).set(auth).send({ items: [] });
    expect(empty.status).toBe(400);
  });

  it('will not delete a payment that a credit note has partly refunded', async () => {
    const full = await getInvoice(inv.b2cs.id);
    const res = await api.delete(`/api/invoices/${inv.b2cs.id}/payments/${full.payments[0].id}`).set(auth);
    expect(res.status).toBe(400);
  });

  it('a value-only discount credit reduces the balance due on an unpaid invoice', async () => {
    const full = await getInvoice(inv.b2b.id);
    const res = await api
      .post(`/api/invoices/${inv.b2b.id}/credit-notes`)
      .set(auth)
      .send({ reason: 'DISCOUNT', items: [{ invoiceItemId: full.items[0].id, amount: 100 }] });
    expect(res.body.data).toMatchObject({ taxableValue: 100, igst: 18, cgst: 0, total: 118, refundAmount: 0 });
    const after = await getInvoice(inv.b2b.id);
    expect(after).toMatchObject({ amountCredited: 118, balanceDue: 1062, status: 'PARTIAL' });
    expect((await api.post(`/api/invoices/${inv.b2b.id}/payments`).set(auth).send({ amount: 1100 })).status).toBe(400);
    const paid = await api.post(`/api/invoices/${inv.b2b.id}/payments`).set(auth).send({ amount: 1062 });
    expect(paid.body.data).toMatchObject({ status: 'PAID', balanceDue: 0 });
  });

  it('a full credit settles the invoice as CREDITED; cancelling it restores the balance and stock', async () => {
    const full = await getInvoice(inv.b2cl.id);
    const before = await stockOf(lamp.id);
    const res = await api
      .post(`/api/invoices/${inv.b2cl.id}/credit-notes`)
      .set(auth)
      .send({ restock: true, items: [{ invoiceItemId: full.items[0].id, quantity: 2 }] });
    expect(res.body.data).toMatchObject({ total: 134400, igst: 14400, refundAmount: 0 });
    expect(await getInvoice(inv.b2cl.id)).toMatchObject({ status: 'PAID', displayStatus: 'CREDITED', balanceDue: 0 });
    expect(await stockOf(lamp.id)).toBe(before + 2);

    // The invoice can't be cancelled while a credit note stands against it.
    expect((await api.post(`/api/invoices/${inv.b2cl.id}/cancel`).set(auth)).status).toBe(400);

    const cancelled = await api.post(`/api/credit-notes/${res.body.data.id}/cancel`).set(auth);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(await getInvoice(inv.b2cl.id)).toMatchObject({ status: 'PENDING', amountCredited: 0, balanceDue: 134400 });
    expect(await stockOf(lamp.id)).toBe(before);

    // Credit one of the two lamps instead.
    const one = await api
      .post(`/api/invoices/${inv.b2cl.id}/credit-notes`)
      .set(auth)
      .send({ items: [{ invoiceItemId: full.items[0].id, quantity: 1 }] });
    expect(one.body.data).toMatchObject({ taxableValue: 60000, igst: 7200, total: 67200 });
  });

  it('lists credit notes and renders a PDF', async () => {
    const list = await api.get(`/api/credit-notes?invoiceId=${inv.b2cl.id}`).set(auth);
    expect(list.body.total).toBe(2);
    const pdf = await api
      .get(`/api/credit-notes/${list.body.data[0].id}/pdf`)
      .set(auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('balances everywhere are net of credit notes', async () => {
    const dash = (await api.get('/api/dashboard').set(auth)).body.data;
    expect(dash.kpis.outstanding).toBe(67200); // only the lamp invoice is still open
    const customers = (await api.get('/api/customers?search=kerala').set(auth)).body.data;
    expect(customers[0]).toMatchObject({ totalSpent: 67200, outstanding: 67200 });
    const detail = (await api.get(`/api/customers/${goaCustomer}`).set(auth)).body.data;
    expect(detail.stats).toMatchObject({ totalSpent: 283.2, outstanding: 0 });
  });
});

describe('GST report (GSTR-1)', () => {
  let report: any;

  it('builds every section for the month', async () => {
    const res = await api.get(`/api/reports/gst?month=${month}`).set(auth);
    expect(res.status).toBe(200);
    report = res.body.data;
    expect(report.business).toMatchObject({ gstin: '30ABCDE1234F1ZD', state: '30-Goa' });
  });

  it('B2B: one row per invoice per rate for registered buyers', () => {
    expect(report.b2b).toEqual([
      expect.objectContaining({ gstin: '27AAACN1234B1Z5', invoiceNumber: 'G-0001', invoiceValue: 1180, placeOfSupply: '27-Maharashtra', rate: 18, taxable: 1000, igst: 180 }),
    ]);
  });

  it('B2CL: large inter-state invoices to unregistered buyers', () => {
    expect(report.b2cl).toEqual([expect.objectContaining({ invoiceNumber: 'G-0003', placeOfSupply: '32-Kerala', rate: 12, taxable: 120000, igst: 14400 })]);
  });

  it('B2CS: small B2C supplies grouped by state and rate, net of their credit notes', () => {
    expect(report.b2cs).toEqual([expect.objectContaining({ placeOfSupply: '30-Goa', rate: 18, taxable: 240, cgst: 21.6, sgst: 21.6, igst: 0 })]);
  });

  it('credit notes: CDNR for registered buyers, CDNUR for B2CL invoices', () => {
    expect(report.cdnr).toEqual([expect.objectContaining({ gstin: '27AAACN1234B1Z5', invoiceNumber: 'G-0001', rate: 18, taxable: 100, igst: 18, noteValue: 118 })]);
    expect(report.cdnur).toEqual([expect.objectContaining({ invoiceNumber: 'G-0003', rate: 12, taxable: 60000, igst: 7200 })]);
  });

  it('HSN summary is split B2B/B2C and net of credit notes', () => {
    const find = (type: string, hsn: string) => report.hsn.find((h: any) => h.supplyType === type && h.hsn === hsn);
    expect(find('B2B', '4911')).toMatchObject({ quantity: 10, taxable: 900, igst: 162 });
    expect(find('B2C', '4911')).toMatchObject({ quantity: 3, taxable: 240, cgst: 21.6, sgst: 21.6 });
    expect(find('B2C', '9405')).toMatchObject({ quantity: 1, taxable: 60000, igst: 7200 });
    expect(find('B2C', 'NA')).toBeUndefined(); // the cancelled custom line is not reported
  });

  it('documents issued count cancelled invoices and credit notes', () => {
    const invoices = report.docs.find((d: any) => d.nature.startsWith('Invoices'));
    expect(invoices).toMatchObject({ from: 'G-0001', to: 'G-0005', total: 4, cancelled: 1 });
    expect(report.docs.find((d: any) => d.nature === 'Credit Note')).toMatchObject({ from: 'CN-0001', to: 'CN-0004', total: 4, cancelled: 1 });
  });

  it('summary nets credit notes off outward supplies', () => {
    expect(report.summary).toMatchObject({ invoices: 3, creditNotes: 3, taxableValue: 61140, b2bTaxable: 900, b2cTaxable: 60240 });
    expect(report.summary.totalTax).toBe(7405.2); // 180 + 14400 + 43.2 - 18 - 7200
  });

  it('exports each section as CSV in the offline tool layout, plus a sales register', async () => {
    const b2b = await api.get(`/api/reports/gst/csv/b2b?month=${month}`).set(auth);
    expect(b2b.status).toBe(200);
    expect(b2b.headers['content-disposition']).toMatch(/gstr1-b2b/);
    expect(b2b.text).toContain('GSTIN/UIN of Recipient,Receiver Name,Invoice Number');
    expect(b2b.text).toContain('27AAACN1234B1Z5');
    const hsn = await api.get(`/api/reports/gst/csv/hsn?month=${month}`).set(auth);
    expect(hsn.text).toContain('9405');
    const reg = await api.get(`/api/reports/sales-register?month=${month}`).set(auth);
    expect(reg.text).toContain('Credit note');
    expect(reg.text).toContain('-60000');
  });

  it('rejects bad periods and sections', async () => {
    expect((await api.get('/api/reports/gst?month=2026-13x').set(auth)).status).toBe(400);
    expect((await api.get('/api/reports/gst?from=2026-05-01&to=2026-04-01').set(auth)).status).toBe(400);
    expect((await api.get(`/api/reports/gst/csv/nope?month=${month}`).set(auth)).status).toBe(400);
  });

  it('an empty month returns empty sections', async () => {
    const res = await api.get('/api/reports/gst?month=2001-01').set(auth);
    expect(res.body.data.summary).toMatchObject({ invoices: 0, taxableValue: 0, totalTax: 0 });
    expect(res.body.data.docs).toEqual([]);
  });
});
