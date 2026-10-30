import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { gstinCheckChar } from '../src/lib/gst';

/**
 * A month in the life of a real small business, with every figure worked out by hand:
 * a Goa sticker and print studio selling to a café in Goa (B2B, CGST+SGST), a retailer in
 * Mumbai (B2B, IGST), walk-in buyers (B2C), and a large one-off mural for an unregistered
 * client in Bengaluru (B2C large, IGST). Mixed GST rates, discounts, shipping, part
 * payments, TDS, a return, a cancellation, a quote, and sending from your own Gmail.
 */

const gstin = (first14: string) => first14 + gstinCheckChar(first14);
const BUSINESS_GSTIN = gstin('30ABCDE1234F1Z');
const CAFE_GSTIN = gstin('30AAACP1234Q1Z');
const MUMBAI_GSTIN = gstin('27AAPFU0939F1Z');

let auth: Record<string, string>;
const c: Record<string, string> = {};
const inv: Record<string, { id: string; invoiceNumber: string; items: { id: string }[] }> = {};

const create = async (body: Record<string, unknown>) => {
  const res = await api.post('/api/invoices').set(auth).send(body);
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const issue = async (id: string) => (await api.post(`/api/invoices/${id}/issue`).set(auth)).body.data;
const pay = async (id: string, body: Record<string, unknown>) => api.post(`/api/invoices/${id}/payments`).set(auth).send(body);
const fetchInvoice = async (id: string) => (await api.get(`/api/invoices/${id}`).set(auth)).body.data;

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  await api
    .put('/api/settings')
    .set(auth)
    .send({
      businessName: 'Stix N Vibes',
      state: 'Goa',
      gstNumber: BUSINESS_GSTIN,
      defaultTaxRate: 18,
      invoicePrefix: 'SNV/26-27/',
      paymentTermsDays: 15,
      upiId: 'stixnvibes@okhdfc',
      thankYouMessage: 'Thanks for supporting local art!',
    })
    .expect(200);
  const add = async (key: string, body: Record<string, unknown>) => {
    const res = await api.post('/api/customers').set(auth).send(body);
    if (res.status !== 201) throw new Error(`customer ${key}: ${JSON.stringify(res.body)}`);
    c[key] = res.body.data.id;
  };
  await add('cafe', { name: 'Bean There Café', email: 'accounts@beanthere.in', phone: '+91 98220 12345', state: 'Goa', gstin: CAFE_GSTIN });
  await add('mumbai', { name: 'Kala Retail LLP', email: 'purchase@kalaretail.in', gstin: MUMBAI_GSTIN });
  await add('walkin', { name: 'Riya Naik', phone: '9850012345', state: 'Goa' });
  await add('mural', { name: 'Arjun Rao', email: 'arjun.rao@example.com', state: 'Karnataka' });
  await add('noEmail', { name: 'Market Stall Buyer', state: 'Goa' });
});
afterAll(() => prisma.$disconnect());

describe('creating different kinds of invoices', () => {
  it('B2B within Goa: mixed 12% and 18% lines, 10% discount, shipping → CGST + SGST', async () => {
    const d = await create({
      customerId: c.cafe,
      date: '2026-10-05',
      discount: 550,
      shippingCost: 100,
      items: [
        { name: 'Vinyl sticker (die-cut)', hsnCode: '4911', quantity: 200, unitPrice: 15, taxRate: 12 },
        { name: 'A3 art poster', hsnCode: '4911', quantity: 10, unitPrice: 250, taxRate: 18 },
      ],
    });
    inv.cafe = d;
    // 3000 + 2500 = 5500; less 550 → 4950 taxable.
    // Tax on the discounted value: 3000×0.9×12% = 324, 2500×0.9×18% = 405 → 729.
    expect(d).toMatchObject({ invoiceNumber: 'SNV/26-27/0001', status: 'DRAFT', subtotal: 5500, discount: 550, taxAmount: 729, cgst: 364.5, sgst: 364.5, igst: 0, shippingCost: 100, grandTotal: 5779 });
    expect(d.placeOfSupply).toMatch(/Goa/i);
    // Due date follows the 15-day payment terms once issued.
    const issued = await issue(d.id);
    expect(issued.status).toBe('PENDING');
    expect(issued.dueDate.slice(0, 10)).toBe('2026-10-20');
  });

  it('B2B to Maharashtra: state taken from the GSTIN → IGST', async () => {
    const d = await create({
      customerId: c.mumbai,
      date: '2026-10-08',
      shippingCost: 250,
      issue: true,
      items: [{ name: 'Sticker sheet (bulk)', hsnCode: '4911', quantity: 500, unitPrice: 12, taxRate: 12 }],
    });
    inv.mumbai = d;
    expect(d).toMatchObject({ invoiceNumber: 'SNV/26-27/0002', status: 'PENDING', subtotal: 6000, taxAmount: 720, igst: 720, cgst: 0, sgst: 0, grandTotal: 6970 });
  });

  it('B2C walk-in: odd prices split to the paisa', async () => {
    const d = await create({ customerId: c.walkin, date: '2026-10-10', issue: true, items: [{ name: 'Enamel keychain', hsnCode: '7117', quantity: 3, unitPrice: 199, taxRate: 18 }] });
    inv.walkin = d;
    // 597 × 18% = 107.46 → 53.73 + 53.73.
    expect(d).toMatchObject({ subtotal: 597, taxAmount: 107.46, cgst: 53.73, sgst: 53.73, grandTotal: 704.46 });
  });

  it('B2C large to Karnataka (unregistered, over ₹1 lakh) → IGST and reported as B2CL', async () => {
    const d = await create({
      customerId: c.mural,
      date: '2026-10-02',
      dueDate: '2026-10-12',
      issue: true,
      items: [{ name: 'Hand-painted café mural (design + installation)', hsnCode: '9983', quantity: 1, unitPrice: 120000, taxRate: 18 }],
    });
    inv.mural = d;
    expect(d).toMatchObject({ subtotal: 120000, igst: 21600, grandTotal: 141600 });
  });

  it('a 0% line and a 5% line on one bill', async () => {
    const d = await create({
      customerId: c.noEmail,
      date: '2026-10-12',
      issue: true,
      items: [
        { name: 'Printed colouring book', hsnCode: '4901', quantity: 2, unitPrice: 300, taxRate: 0 },
        { name: 'Cotton tote bag', hsnCode: '6305', quantity: 4, unitPrice: 180, taxRate: 5 },
      ],
    });
    inv.mixed = d;
    // 600 at 0% + 720 at 5% (36) → 1356.
    expect(d).toMatchObject({ subtotal: 1320, taxAmount: 36, cgst: 18, sgst: 18, grandTotal: 1356 });
  });

  it('refuses nonsense: no lines, negative prices, unknown customer', async () => {
    expect((await api.post('/api/invoices').set(auth).send({ customerId: c.cafe, items: [] })).status).toBe(400);
    expect((await api.post('/api/invoices').set(auth).send({ customerId: c.cafe, items: [{ name: 'X', quantity: 1, unitPrice: -5 }] })).status).toBe(400);
    const missing = await api.post('/api/invoices').set(auth).send({ customerId: '00000000-0000-4000-8000-000000000000', items: [{ name: 'X', quantity: 1, unitPrice: 5 }] });
    expect([400, 404]).toContain(missing.status);
  });
});

describe('getting paid', () => {
  it('part payment by UPI, then the rest by bank transfer → paid', async () => {
    let r = await pay(inv.cafe.id, { amount: 3000, paymentMethod: 'UPI', paymentDate: '2026-10-07', referenceId: 'UPI-4471' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ status: 'PARTIAL', amountPaid: 3000, balanceDue: 2779 });
    r = await pay(inv.cafe.id, { amount: 2779, paymentMethod: 'BANK_TRANSFER', paymentDate: '2026-10-18' });
    expect(r.body.data).toMatchObject({ status: 'PAID', balanceDue: 0 });
    // Paying more than is owed is refused.
    expect((await pay(inv.cafe.id, { amount: 1 })).status).toBe(400);
  });

  it('customer deducts TDS: ₹6,900 in the bank + ₹70 TDS settles ₹6,970', async () => {
    // The amount settled includes the TDS; the cash received is amount − TDS.
    const r = await pay(inv.mumbai.id, { amount: 6970, tdsAmount: 70, paymentMethod: 'BANK_TRANSFER', paymentDate: '2026-10-15' });
    expect(r.body.data).toMatchObject({ status: 'PAID', balanceDue: 0 });
  });

  it('an advance on the mural leaves it part-paid and overdue', async () => {
    const r = await pay(inv.mural.id, { amount: 50000, paymentMethod: 'BANK_TRANSFER', paymentDate: '2026-10-03' });
    expect(r.body.data).toMatchObject({ status: 'PARTIAL', balanceDue: 91600 });
    expect((await fetchInvoice(inv.mural.id)).displayStatus).toBe('OVERDUE');
  });

  it('cash at the counter', async () => {
    const r = await pay(inv.walkin.id, { amount: 704.46, paymentMethod: 'CASH' });
    expect(r.body.data.status).toBe('PAID');
  });
});

describe('returns and corrections', () => {
  it('café returns 20 stickers: GST reversed at 12% after the discount, refund due', async () => {
    const full = await fetchInvoice(inv.cafe.id);
    const stickerLine = full.items.find((i: { name: string }) => i.name.startsWith('Vinyl'));
    const r = await api.post(`/api/invoices/${inv.cafe.id}/credit-notes`).set(auth).send({ reason: 'RETURN', items: [{ invoiceItemId: stickerLine.id, quantity: 20 }] });
    expect(r.status).toBe(201);
    // 20 × ₹15 × 0.9 = 270 taxable, 12% = 32.40 → 16.20 + 16.20; already paid, so all of it is refundable.
    expect(r.body.data).toMatchObject({ taxableValue: 270, taxAmount: 32.4, cgst: 16.2, sgst: 16.2, total: 302.4, refundAmount: 302.4 });
  });

  it('a wrong invoice is cancelled and drops out of everything', async () => {
    const wrong = await create({ customerId: c.walkin, date: '2026-10-14', issue: true, items: [{ name: 'Typo order', quantity: 1, unitPrice: 999, taxRate: 18 }] });
    const r = await api.post(`/api/invoices/${wrong.id}/cancel`).set(auth);
    expect(r.body.data.status).toBe('CANCELLED');
    inv.cancelled = wrong;
  });
});

describe('storing and finding invoices', () => {
  it('every invoice is saved with a unique sequential number', async () => {
    const all = await prisma.invoice.findMany({ orderBy: { invoiceNumber: 'asc' }, select: { invoiceNumber: true } });
    expect(all.map((i) => i.invoiceNumber)).toEqual(['SNV/26-27/0001', 'SNV/26-27/0002', 'SNV/26-27/0003', 'SNV/26-27/0004', 'SNV/26-27/0005', 'SNV/26-27/0006']);
  });

  it('search by customer and filter by status', async () => {
    const byName = await api.get('/api/invoices?search=kala').set(auth);
    expect(byName.body.data.map((i: { invoiceNumber: string }) => i.invoiceNumber)).toEqual(['SNV/26-27/0002']);
    const cancelled = await api.get('/api/invoices?status=CANCELLED').set(auth);
    expect(cancelled.body.data).toHaveLength(1);
    const forCustomer = await api.get(`/api/invoices?customerId=${c.cafe}`).set(auth);
    expect(forCustomer.body.data).toHaveLength(1);
  });

  it('every invoice renders a PDF', async () => {
    for (const key of ['cafe', 'mumbai', 'walkin', 'mural', 'mixed', 'cancelled']) {
      const r = await api.get(`/api/invoices/${inv[key]!.id}/pdf?download=1`).set(auth).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(r.status).toBe(200);
      expect(r.headers['content-disposition']).toContain(`${inv[key]!.invoiceNumber}.pdf`);
      expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect((r.body as Buffer).length).toBeGreaterThan(1500);
    }
  });

  it("the customer's balance and lifetime value add up", async () => {
    const mural = (await api.get(`/api/customers/${c.mural}`).set(auth)).body.data;
    expect(mural.stats).toMatchObject({ totalSpent: 141600, outstanding: 91600 });
    // Café: 5779 billed − 302.40 returned; fully paid, so nothing outstanding (the refund is owed back).
    const cafe = (await api.get(`/api/customers/${c.cafe}`).set(auth)).body.data;
    expect(cafe.stats).toMatchObject({ totalSpent: 5476.6, outstanding: 0 });
  });
});

describe('GST return for October', () => {
  it('puts each invoice in the right GSTR-1 section with the right tax', async () => {
    const r = (await api.get('/api/reports/gst?month=2026-10').set(auth)).body.data;
    // Cancelled invoice excluded; 5 issued invoices.
    expect(r.summary.invoices).toBe(5);
    // B2B has one row per invoice per tax rate (invoice 1 has 12% and 18% lines).
    expect(r.b2b.map((x: { invoiceNumber: string; rate: number }) => `${x.invoiceNumber}@${x.rate}`).sort()).toEqual(['SNV/26-27/0001@12', 'SNV/26-27/0001@18', 'SNV/26-27/0002@12']);
    expect(r.b2cl.map((x: { invoiceNumber: string }) => x.invoiceNumber)).toEqual(['SNV/26-27/0004']);
    expect(r.cdnr).toHaveLength(1);
    // Taxable: 4950 + 6000 + 597 + 120000 + 1320 - 270 (return) = 132597.
    expect(r.summary.taxableValue).toBe(132597);
    // IGST: 720 + 21600. CGST/SGST: 364.5 + 53.73 + 18 - 16.2 each.
    expect(r.summary.igst).toBe(22320);
    expect(r.summary.cgst).toBe(420.03);
    expect(r.summary.sgst).toBe(420.03);
  });

  it('exports GSTR-1 JSON with the business GSTIN', async () => {
    const r = await api.get('/api/reports/gst/json?month=2026-10').set(auth);
    expect(r.status).toBe(200);
    const json = typeof r.body === 'object' && r.body.gstin ? r.body : JSON.parse(r.text);
    expect(json.gstin).toBe(BUSINESS_GSTIN);
    expect(json.fp).toBe('102026');
  });
});

describe('quote → invoice', () => {
  it('a quotation converts to an invoice with the same lines and totals', async () => {
    const q = await api
      .post('/api/quotes')
      .set(auth)
      .send({ customerId: c.cafe, date: '2026-10-16', items: [{ name: 'Menu board sticker set', hsnCode: '4911', quantity: 5, unitPrice: 800, taxRate: 12 }] });
    expect(q.status).toBe(201);
    expect(q.body.data.grandTotal).toBe(4480);
    const conv = await api.post(`/api/quotes/${q.body.data.id}/convert`).set(auth);
    expect(conv.status).toBeLessThan(300);
    const invoiceId = conv.body.data.invoiceId ?? conv.body.data.invoice?.id ?? conv.body.data.id;
    const created = await fetchInvoice(invoiceId);
    expect(created).toMatchObject({ subtotal: 4000, cgst: 240, sgst: 240, grandTotal: 4480 });
  });
});

describe('sending from your own Gmail / Outlook', () => {
  it('previews the email without changing anything', async () => {
    const draft = await create({ customerId: c.cafe, date: '2026-10-20', items: [{ name: 'Window decal', quantity: 2, unitPrice: 450, taxRate: 18 }] });
    const r = await api.get(`/api/invoices/${draft.id}/compose`).set(auth);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ to: 'accounts@beanthere.in', subject: `Invoice ${draft.invoiceNumber} from Stix N Vibes`, issued: false, fileName: `${draft.invoiceNumber}.pdf` });
    expect(r.body.data.text).toContain('Hi Bean There Café');
    expect(r.body.data.text).toContain('stixnvibes@okhdfc');
    // Indian digit grouping and a readable date: 2 × ₹450 + 18% = ₹1,062, due 15 days after 20 Oct.
    expect(r.body.data.text).toContain('Amount due: ₹1,062.00 by 04 Nov 2026.');
    expect(r.body.data.pdfLink).toMatch(/\/api\/portal\/[A-Za-z0-9_-]+\/invoices\/[0-9a-f-]+\/pdf$/);
    expect(r.body.data.text).toContain(r.body.data.pdfLink);
    expect((await fetchInvoice(draft.id)).status).toBe('DRAFT');
    inv.draft = draft;
  });

  it('opening it to send issues the draft and notes it on the customer', async () => {
    const r = await api.post(`/api/invoices/${inv.draft!.id}/compose`).set(auth);
    expect(r.body.data.issued).toBe(true);
    expect((await fetchInvoice(inv.draft!.id)).status).toBe('PENDING');
    const notes = await prisma.activity.findMany({ where: { referenceId: inv.draft!.id, eventType: 'INVOICE_SENT' } });
    expect(notes).toHaveLength(1);
  });

  it('the PDF link in the email opens for the customer without signing in', async () => {
    const { pdfLink } = (await api.get(`/api/invoices/${inv.draft!.id}/compose`).set(auth)).body.data;
    const r = await api.get(new URL(pdfLink).pathname);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
  });

  it('a customer without an email gets an empty "To" to fill in; cancelled invoices are refused', async () => {
    expect((await api.get(`/api/invoices/${inv.mixed.id}/compose`).set(auth)).body.data.to).toBe('');
    expect((await api.get(`/api/invoices/${inv.cancelled!.id}/compose`).set(auth)).status).toBe(400);
  });

  it('works for quotes too', async () => {
    const q = (await api.post('/api/quotes').set(auth).send({ customerId: c.mumbai, items: [{ name: 'Shelf talkers', quantity: 100, unitPrice: 20, taxRate: 12 }] })).body.data;
    const prev = (await api.get(`/api/quotes/${q.id}/compose`).set(auth)).body.data;
    expect(prev.subject).toBe(`Quotation ${q.quoteNumber} from Stix N Vibes`);
    expect(prev.pdfLink).toContain(`/quotes/${q.id}/pdf`);
    await api.post(`/api/quotes/${q.id}/compose`).set(auth).expect(200);
    expect((await api.get(`/api/quotes/${q.id}`).set(auth)).body.data.status).toBe('SENT');
  });
});
