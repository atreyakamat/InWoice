import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';

let auth: Record<string, string>;
let goaCustomer: string;
let keralaCustomer: string;
let sticker: { id: string };
let pack: { id: string };

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  await api.put('/api/settings').set(auth).send({ state: 'Goa', defaultTaxRate: 18, invoicePrefix: 'T-', paymentTermsDays: 10 });
  goaCustomer = (await api.post('/api/customers').set(auth).send({ name: 'Goa Buyer', state: 'Goa', email: 'goa@test.local' })).body.data.id;
  keralaCustomer = (await api.post('/api/customers').set(auth).send({ name: 'Kerala Buyer', state: 'Kerala' })).body.data.id;
  sticker = (await api.post('/api/products').set(auth).send({ name: 'Sticker', price: 100, stock: 50, hsnCode: '4911' })).body.data;
  const other = (await api.post('/api/products').set(auth).send({ name: 'Badge', price: 40, stock: 10, taxRate: 5 })).body.data;
  pack = (
    await api
      .post('/api/packs')
      .set(auth)
      .send({ name: 'Combo', price: 250, items: [{ productId: sticker.id, quantity: 2 }, { productId: other.id, quantity: 1 }] })
  ).body.data;
});
afterAll(() => prisma.$disconnect());

const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

describe('customers', () => {
  it('validates input', async () => {
    expect((await api.post('/api/customers').set(auth).send({ name: '' })).status).toBe(400);
    expect((await api.post('/api/customers').set(auth).send({ name: 'X', email: 'not-an-email' })).status).toBe(400);
  });

  it('searches and returns per-customer stats', async () => {
    const res = await api.get('/api/customers?search=kerala').set(auth);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ name: 'Kerala Buyer', totalSpent: 0, invoiceCount: 0 });
  });
});

describe('invoice lifecycle', () => {
  let invoiceId: string;

  it('creates a draft with intra-state GST (CGST + SGST) and sequential numbers', async () => {
    const res = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: goaCustomer, items: [{ type: 'PRODUCT', itemId: sticker.id, quantity: 3 }], shippingCost: 50 });
    expect(res.status).toBe(201);
    const inv = res.body.data;
    invoiceId = inv.id;
    expect(inv.invoiceNumber).toBe('T-0001');
    expect(inv.status).toBe('DRAFT');
    expect(inv.subtotal).toBe(300);
    expect(inv.taxAmount).toBe(54);
    expect(inv.cgst).toBe(27);
    expect(inv.sgst).toBe(27);
    expect(inv.igst).toBe(0);
    expect(inv.grandTotal).toBe(404);
    expect(inv.items[0]).toMatchObject({ name: 'Sticker', unitPrice: 100, hsnCode: '4911', taxRate: 18 });
    // Due date defaults to payment terms (10 days).
    expect(new Date(inv.dueDate).getTime() - new Date(inv.date).getTime()).toBe(10 * 86_400_000);
    // Drafts do not touch stock.
    expect(await stockOf(sticker.id)).toBe(50);
  });

  it('uses IGST for inter-state sales and applies discount before tax', async () => {
    const res = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: keralaCustomer, discount: 100, items: [{ type: 'CUSTOM', name: 'Design fee', quantity: 1, unitPrice: 1000 }] });
    const inv = res.body.data;
    expect(inv.invoiceNumber).toBe('T-0002');
    expect(inv.placeOfSupply).toBe('Kerala');
    expect(inv.igst).toBe(162); // 18% of 900
    expect(inv.cgst + inv.sgst).toBe(0);
    expect(inv.grandTotal).toBe(1062);
  });

  it('rejects bad invoice input', async () => {
    expect((await api.post('/api/invoices').set(auth).send({ customerId: goaCustomer, items: [] })).status).toBe(400);
    expect(
      (await api.post('/api/invoices').set(auth).send({ customerId: goaCustomer, items: [{ type: 'CUSTOM', name: 'x', quantity: 1 }] })).status,
    ).toBe(400);
    expect(
      (
        await api
          .post('/api/invoices')
          .set(auth)
          .send({ customerId: '00000000-0000-0000-0000-000000000000', items: [{ type: 'CUSTOM', name: 'x', quantity: 1, unitPrice: 1 }] })
      ).status,
    ).toBe(404);
  });

  it('edits drafts', async () => {
    const res = await api
      .put(`/api/invoices/${invoiceId}`)
      .set(auth)
      .send({ customerId: goaCustomer, items: [{ type: 'PRODUCT', itemId: sticker.id, quantity: 4 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.subtotal).toBe(400);
    expect(res.body.data.invoiceNumber).toBe('T-0001');
  });

  it('issuing deducts stock, creates fulfillment, and locks the invoice', async () => {
    const res = await api.post(`/api/invoices/${invoiceId}/issue`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.fulfillment.status).toBe('PENDING');
    expect(await stockOf(sticker.id)).toBe(46);

    // Issuing twice is harmless (idempotent).
    await api.post(`/api/invoices/${invoiceId}/issue`).set(auth);
    expect(await stockOf(sticker.id)).toBe(46);

    const edit = await api
      .put(`/api/invoices/${invoiceId}`)
      .set(auth)
      .send({ customerId: goaCustomer, items: [{ type: 'PRODUCT', itemId: sticker.id, quantity: 1 }] });
    expect(edit.status).toBe(400);
    expect((await api.delete(`/api/invoices/${invoiceId}`).set(auth)).status).toBe(400);
  });

  it('records partial and full payments, rejecting overpayment', async () => {
    const total = 472; // 400 + 18%
    const partial = await api.post(`/api/invoices/${invoiceId}/payments`).set(auth).send({ amount: 200, paymentMethod: 'UPI' });
    expect(partial.status).toBe(201);
    expect(partial.body.data.status).toBe('PARTIAL');
    expect(partial.body.data.balanceDue).toBe(total - 200);

    const over = await api.post(`/api/invoices/${invoiceId}/payments`).set(auth).send({ amount: 1000 });
    expect(over.status).toBe(400);

    const rest = await api.post(`/api/invoices/${invoiceId}/payments`).set(auth).send({ amount: total - 200, paymentMethod: 'CASH' });
    expect(rest.body.data.status).toBe('PAID');
    expect(rest.body.data.balanceDue).toBe(0);
    expect(rest.body.data.payments).toHaveLength(2);
  });

  it('blocks cancelling a paid invoice until payments are removed, then restores stock', async () => {
    expect((await api.post(`/api/invoices/${invoiceId}/cancel`).set(auth)).status).toBe(400);
    const inv = (await api.get(`/api/invoices/${invoiceId}`).set(auth)).body.data;
    for (const p of inv.payments) {
      await api.delete(`/api/invoices/${invoiceId}/payments/${p.id}`).set(auth);
    }
    const after = (await api.get(`/api/invoices/${invoiceId}`).set(auth)).body.data;
    expect(after.status).toBe('PENDING');
    expect(after.amountPaid).toBe(0);

    const cancelled = await api.post(`/api/invoices/${invoiceId}/cancel`).set(auth);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.fulfillment.status).toBe('CANCELLED');
    expect(await stockOf(sticker.id)).toBe(50);
    expect((await api.post(`/api/invoices/${invoiceId}/payments`).set(auth).send({ amount: 10 })).status).toBe(400);
  });

  it('expands packs into component stock when issued', async () => {
    const res = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: goaCustomer, issue: true, items: [{ type: 'PACK', itemId: pack.id, quantity: 2 }] });
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.subtotal).toBe(500);
    expect(await stockOf(sticker.id)).toBe(46); // 2 packs x 2 stickers
  });

  it('paying a draft issues it first', async () => {
    const draft = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: goaCustomer, items: [{ type: 'PRODUCT', itemId: sticker.id, quantity: 1 }] });
    const paid = await api.post(`/api/invoices/${draft.body.data.id}/payments`).set(auth).send({ amount: 118 });
    expect(paid.body.data.status).toBe('PAID');
    expect(await stockOf(sticker.id)).toBe(45);
  });

  it('derives OVERDUE and filters by it', async () => {
    const res = await api
      .post('/api/invoices')
      .set(auth)
      .send({
        customerId: keralaCustomer,
        issue: true,
        date: '2026-01-01',
        dueDate: '2026-01-15',
        items: [{ type: 'CUSTOM', name: 'Old job', quantity: 1, unitPrice: 100 }],
      });
    expect(res.body.data.displayStatus).toBe('OVERDUE');
    const list = await api.get('/api/invoices?status=OVERDUE').set(auth);
    expect(list.body.data.map((i: { id: string }) => i.id)).toContain(res.body.data.id);
  });

  it('skips used numbers if the counter is set back in settings', async () => {
    await api.put('/api/settings').set(auth).send({ nextInvoiceNumber: 1 });
    const res = await api
      .post('/api/invoices')
      .set(auth)
      .send({ customerId: goaCustomer, items: [{ type: 'CUSTOM', name: 'After reset', quantity: 1, unitPrice: 5 }] });
    expect(res.status).toBe(201);
    const numbers = (await prisma.invoice.findMany({ select: { invoiceNumber: true } })).map((i) => i.invoiceNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('duplicates into a new draft', async () => {
    const res = await api.post(`/api/invoices/${invoiceId}/duplicate`).set(auth);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.invoiceNumber).not.toBe('T-0001');
    expect(res.body.data.items).toHaveLength(1);
  });

  it('renders a PDF and a WhatsApp share link', async () => {
    const pdf = await api.get(`/api/invoices/${invoiceId}/pdf`).set(auth).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const wa = await api.get(`/api/invoices/${invoiceId}/whatsapp`).set(auth);
    expect(wa.body.data.url).toMatch(/^https:\/\/wa\.me\//);
  });

  it('cannot email without SMTP configured', async () => {
    const res = await api.post(`/api/invoices/${invoiceId}/send`).set(auth).send({});
    expect(res.status).toBe(400);
  });

  it('protects customers with invoices from deletion', async () => {
    expect((await api.delete(`/api/customers/${goaCustomer}`).set(auth)).status).toBe(409);
    const detail = await api.get(`/api/customers/${goaCustomer}`).set(auth);
    expect(detail.body.data.stats.invoiceCount).toBeGreaterThan(0);
    expect(detail.body.data.activities.length).toBeGreaterThan(0);
  });

  it('archives products that appear on invoices instead of deleting them', async () => {
    const res = await api.delete(`/api/products/${sticker.id}`).set(auth);
    expect(res.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: sticker.id } })).status).toBe('ARCHIVED');
  });

  it('exports CSV', async () => {
    const res = await api.get('/api/export/invoices').set(auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('invoiceNumber');
    expect(res.text).toContain('T-0001');
  });
});
