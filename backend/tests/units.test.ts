import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';

/**
 * Jobs priced by area: a sticker studio charging ₹80 per square foot of finished sticker,
 * using 1.1 sq ft of vinyl per sq ft sold (10% wastage).
 */

let auth: Record<string, string>;
let customerId = '';
let vinylJob: { id: string };
let keychain: { id: string };
let vinylRoll: { id: string };

const vinylLeft = async () => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: vinylRoll.id } })).currentStock;
const create = (body: Record<string, unknown>) => api.post('/api/invoices').set(auth).send({ customerId, ...body });

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  await api.put('/api/settings').set(auth).send({ state: 'Goa', gstNumber: '30ABCDE1234F1ZD', defaultTaxRate: 18, invoicePrefix: 'S-' }).expect(200);
  customerId = (await api.post('/api/customers').set(auth).send({ name: 'Bean There Café', state: 'Goa', gstin: '30AAACP1234Q1ZL' })).body.data.id;
  const job = await api.post('/api/products').set(auth).send({ name: 'Custom vinyl sticker', price: 80, unit: 'sqft', taxRate: 18, hsnCode: '4911' });
  expect(job.status).toBe(201);
  vinylJob = job.body.data;
  keychain = (await api.post('/api/products').set(auth).send({ name: 'Enamel keychain', price: 199, stock: 10, taxRate: 18, hsnCode: '7117' })).body.data;
  vinylRoll = await prisma.inventoryItem.create({ data: { name: 'Printable vinyl', category: 'RAW_MATERIAL', unit: 'sqft', currentStock: 100, costPerUnit: 12 } });
  await prisma.productBOM.create({ data: { productId: vinylJob.id, items: { create: [{ inventoryItemId: vinylRoll.id, quantityRequired: 1.1 }] } } });
});
afterAll(() => prisma.$disconnect());

describe('selling by the square foot', () => {
  let invoiceId = '';

  it('a product can be priced per sq ft', async () => {
    const p = await prisma.product.findUniqueOrThrow({ where: { id: vinylJob.id } });
    expect(p).toMatchObject({ unit: 'sqft', price: 80 });
  });

  it('24 × 36 in × 2 = 12 sq ft at ₹80 → ₹960 + 18% GST', async () => {
    const r = await create({ items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 12, details: '24 × 36 in × 2' }] });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ subtotal: 960, cgst: 86.4, sgst: 86.4, grandTotal: 1132.8 });
    expect(r.body.data.items[0]).toMatchObject({ quantity: 12, unit: 'sqft', details: '24 × 36 in × 2', unitPrice: 80, total: 960 });
    invoiceId = r.body.data.id;
  });

  it('issuing uses up vinyl from the bill of materials (12 × 1.1 = 13.2 sq ft), not finished stock', async () => {
    await api.post(`/api/invoices/${invoiceId}/issue`).set(auth).expect(200);
    expect(await vinylLeft()).toBeCloseTo(86.8, 6);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: vinylJob.id } })).stock).toBe(0);
    const move = await prisma.stockMovement.findFirst({ where: { referenceId: invoiceId } });
    expect(move?.notes).toContain('12 sqft x Custom vinyl sticker');
  });

  it('cancelling puts the vinyl back', async () => {
    await api.post(`/api/invoices/${invoiceId}/cancel`).set(auth).expect(200);
    expect(await vinylLeft()).toBeCloseTo(100, 6);
  });

  it('decimals: 2.25 sq ft = ₹180; at most 3 decimal places', async () => {
    const r = await create({ items: [{ type: 'CUSTOM', name: 'Window decal', unit: 'sqft', quantity: 2.25, unitPrice: 80, taxRate: 18 }] });
    expect(r.body.data).toMatchObject({ subtotal: 180, grandTotal: 212.4 });
    expect((await create({ items: [{ type: 'CUSTOM', name: 'X', unit: 'sqft', quantity: 1.2345, unitPrice: 80 }] })).status).toBe(400);
  });

  it('pieces stay whole numbers: 2.5 keychains or 1.5 packs are refused', async () => {
    const r = await create({ items: [{ type: 'PRODUCT', itemId: keychain.id, quantity: 2.5 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('whole number');
    expect((await create({ items: [{ type: 'CUSTOM', name: 'Sticker sheet', quantity: 1.5, unitPrice: 20 }] })).status).toBe(400);
    // A counted product still uses its stock.
    await create({ issue: true, items: [{ type: 'PRODUCT', itemId: keychain.id, quantity: 3 }] }).expect(201);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: keychain.id } })).stock).toBe(7);
  });

  it('a quote in sq ft converts to an invoice with the same size and unit', async () => {
    const q = (await api.post('/api/quotes').set(auth).send({ customerId, items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 6.25, details: '30 × 30 in' }] })).body.data;
    expect(q.grandTotal).toBe(590); // 6.25 × 80 = 500 + 18%
    const conv = await api.post(`/api/quotes/${q.id}/convert`).set(auth);
    const inv = (await api.get(`/api/invoices/${conv.body.data.invoiceId ?? conv.body.data.id}`).set(auth)).body.data;
    expect(inv.items[0]).toMatchObject({ quantity: 6.25, unit: 'sqft', details: '30 × 30 in' });
  });

  it('returning part of a job credits by area and does not "restock" a printed sticker', async () => {
    const inv = (await create({ issue: true, items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 10 }] })).body.data;
    const r = await api.post(`/api/invoices/${inv.id}/credit-notes`).set(auth).send({ reason: 'DEFICIENCY', restock: true, items: [{ invoiceItemId: inv.items[0].id, quantity: 2.5 }] });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ taxableValue: 200, taxAmount: 36, total: 236 });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: vinylJob.id } })).stock).toBe(0);
  });

  it('the till sells by area too', async () => {
    const r = await api.post('/api/pos/sale').set(auth).send({ method: 'CASH', items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 1.5, details: '18 × 12 in' }] });
    expect(r.status).toBe(201);
    expect(r.body.data.invoice).toMatchObject({ subtotal: 120, grandTotal: 141.6, status: 'PAID' });
  });

  it('GSTR-1 HSN summary reports square feet as SQF and pieces as NOS', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const report = (await api.get(`/api/reports/gst?month=${month}`).set(auth)).body.data;
    const sqf = report.hsn.filter((h: { uqc: string }) => h.uqc === 'SQF');
    const nos = report.hsn.filter((h: { uqc: string }) => h.uqc === 'NOS');
    // Issued in sq ft: 6.25 (quote) is a draft, so: 10 − 2.5 returned + 1.5 at the till = 9.
    expect(sqf.reduce((s: number, h: { quantity: number }) => s + h.quantity, 0)).toBeCloseTo(9, 6);
    expect(nos.reduce((s: number, h: { quantity: number }) => s + h.quantity, 0)).toBe(3);
    const csv = await api.get(`/api/reports/gst/csv/hsn?month=${month}`).set(auth);
    expect(csv.text).toContain('SQF-SQUARE FEET');
    const json = JSON.parse((await api.get(`/api/reports/gst/json?month=${month}`).set(auth)).text);
    const rows = [...json.hsn.hsn_b2b, ...json.hsn.hsn_b2c];
    expect(rows.map((r: { uqc: string }) => r.uqc).sort()).toEqual(expect.arrayContaining(['NOS', 'SQF']));
  });

  it('the invoice PDF renders with units', async () => {
    const inv = (await create({ issue: true, items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 12, details: '24 × 36 in × 2' }] })).body.data;
    const r = await api.get(`/api/invoices/${inv.id}/pdf`).set(auth).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('minimum charge per job', () => {
  it('a job worth less than the minimum is billed at the minimum', async () => {
    await api.put(`/api/products/${vinylJob.id}`).set(auth).send({ name: 'Custom vinyl sticker', price: 80, unit: 'sqft', minCharge: 150 }).expect(200);
    // 1.5 sq ft × ₹80 = ₹120, below the ₹150 minimum → ₹150 + 18% = ₹177.
    const small = (await create({ items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 1.5, details: '18 × 12 in' }] })).body.data;
    expect(small.items[0]).toMatchObject({ quantity: 1.5, unitPrice: 80, total: 150, minCharge: 150 });
    expect(small).toMatchObject({ subtotal: 150, cgst: 13.5, sgst: 13.5, grandTotal: 177 });
    // 2 sq ft = ₹160 is above the minimum: charged as normal.
    const big = (await create({ items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 2 }] })).body.data;
    expect(big.items[0]).toMatchObject({ total: 160, minCharge: null });
  });

  it('applies to each job (line) on its own, and to quotes', async () => {
    const r = (await create({ items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 1 }, { type: 'PRODUCT', itemId: vinylJob.id, quantity: 0.5 }] })).body.data;
    expect(r.items.map((i: { total: number }) => i.total)).toEqual([150, 150]);
    const q = (await api.post('/api/quotes').set(auth).send({ customerId, items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 1 }] })).body.data;
    expect(q.subtotal).toBe(150);
  });

  it('a minimum-charge job returned in full credits what was billed (₹150, not ₹80 × size)', async () => {
    const inv = (await create({ issue: true, items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 1.5 }] })).body.data;
    const half = await api.post(`/api/invoices/${inv.id}/credit-notes`).set(auth).send({ reason: 'DEFICIENCY', items: [{ invoiceItemId: inv.items[0].id, quantity: 0.75 }] });
    expect(half.body.data.taxableValue).toBe(75); // half the job → half of ₹150
    const rest = await api.post(`/api/invoices/${inv.id}/credit-notes`).set(auth).send({ reason: 'RETURN', items: [{ invoiceItemId: inv.items[0].id, quantity: 0.75 }] });
    expect(rest.body.data.taxableValue).toBe(75);
    expect((await api.get(`/api/invoices/${inv.id}`).set(auth)).body.data.amountCredited).toBe(177);
  });

  it('the minimum can be removed', async () => {
    await api.put(`/api/products/${vinylJob.id}`).set(auth).send({ name: 'Custom vinyl sticker', price: 80, unit: 'sqft', minCharge: '' }).expect(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: vinylJob.id } })).minCharge).toBeNull();
    expect((await create({ items: [{ type: 'PRODUCT', itemId: vinylJob.id, quantity: 1 }] })).body.data.subtotal).toBe(80);
  });
});

describe('area rounding setting', () => {
  it('defaults to rounding up to ¼ sq ft and accepts only sensible steps', async () => {
    expect((await api.get('/api/settings').set(auth)).body.data.areaRoundUp).toBe(0.25);
    expect((await api.put('/api/settings').set(auth).send({ areaRoundUp: 0.3 })).status).toBe(400);
    await api.put('/api/settings').set(auth).send({ areaRoundUp: 0.5 }).expect(200);
    expect((await api.get('/api/settings').set(auth)).body.data.areaRoundUp).toBe(0.5);
  });
});
