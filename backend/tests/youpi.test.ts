import http from 'http';
import crypto from 'crypto';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { readChromiumProfiles } from '../src/services/browser.service';
import { verifyWebhookSignature } from '../src/services/youpi.service';

/**
 * YouPI-PG online payments against a fake gateway that speaks its API:
 * POST /api/v1/payments (create a checkout) and GET /api/v1/payments/:id (status).
 */

const SECRET = 'whsec_test_0123456789abcdef';
let auth: Record<string, string>;
let gateway: http.Server;
let gatewayUrl = '';
const created: { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
const statusOf = new Map<string, Record<string, unknown>>();
let customerId = '';

const sign = (raw: string) => `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`;
const webhook = (payload: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const raw = JSON.stringify(payload);
  return api
    .post('/api/payments/youpi/webhook')
    .set('Content-Type', 'application/json')
    .set({ 'X-Gateway-Signature': sign(raw), 'X-Gateway-Event': String(payload.event), 'X-Gateway-Delivery-Id': crypto.randomUUID(), ...headers })
    .send(raw);
};
const newInvoice = async (unitPrice: number) =>
  (await api.post('/api/invoices').set(auth).send({ customerId, issue: true, items: [{ name: 'Sticker pack', quantity: 1, unitPrice, taxRate: 0 }] })).body.data;

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  gateway = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && req.url === '/api/v1/payments') {
        const parsed = JSON.parse(body);
        created.push({ headers: req.headers, body: parsed });
        if (parsed.description?.includes('REFUSE')) return res.writeHead(403).end(JSON.stringify({ error: 'BLOCKED', message: 'Flagged' }));
        const paymentId = crypto.randomUUID();
        statusOf.set(paymentId, { paymentId, orderId: parsed.orderId, amount: parsed.amount, amountPaise: Math.round(Number(parsed.amount) * 100), status: 'ACTIVE' });
        return res.writeHead(201).end(JSON.stringify({ paymentId, orderId: parsed.orderId, amount: parsed.amount, status: 'ACTIVE', checkoutUrl: `/checkout/${paymentId}` }));
      }
      const m = req.url?.match(/^\/api\/v1\/payments\/([\w-]+)$/);
      if (req.method === 'GET' && m) {
        const s = statusOf.get(m[1]!);
        return s ? res.writeHead(200).end(JSON.stringify(s)) : res.writeHead(404).end(JSON.stringify({ error: 'NOT_FOUND' }));
      }
      res.writeHead(404).end('{}');
    });
  });
  await new Promise<void>((r) => gateway.listen(0, '127.0.0.1', r));
  gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
  await api.put('/api/settings').set(auth).send({ state: 'Goa', businessName: 'Stix N Vibes', upiId: 'stix@upi', invoicePrefix: 'P-' }).expect(200);
  customerId = (await api.post('/api/customers').set(auth).send({ name: 'Meera Kamat', email: 'meera@example.com', phone: '9822012345', state: 'Goa' })).body.data.id;
});
afterAll(async () => {
  await new Promise((r) => gateway.close(r));
  await prisma.$disconnect();
});

describe('setting up YouPI', () => {
  it('starts off: no Pay now, and checkouts are refused', async () => {
    const inv = await newInvoice(100);
    expect((await api.post(`/api/invoices/${inv.id}/online-payments`).set(auth)).status).toBe(400);
    expect((await api.get(`/api/invoices/${inv.id}/compose`).set(auth)).body.data.text).not.toContain('Pay online now');
  });

  it('tests the connection, saves the details and never returns the secret', async () => {
    const t = await api.post('/api/settings/test-youpi').set(auth).send({ youpiApiUrl: gatewayUrl, youpiMerchantId: 'merchant-1' });
    expect(t.status).toBe(200);
    expect(t.body.data.ok).toBe(true);
    const bad = await api.post('/api/settings/test-youpi').set(auth).send({ youpiApiUrl: 'http://127.0.0.1:1', youpiMerchantId: 'merchant-1' });
    expect(bad.status).toBe(502);

    const r = await api.put('/api/settings').set(auth).send({ youpiEnabled: true, youpiApiUrl: `${gatewayUrl}/`, youpiMerchantId: 'merchant-1', youpiWebhookSecret: SECRET });
    expect(r.status).toBe(200);
    expect(r.body.data.youpiWebhookSecret).toBeUndefined();
    expect(r.body.data).toMatchObject({ youpiEnabled: true, youpiApiUrl: gatewayUrl, youpiWebhookSecretSet: true });
    const s = await api.get('/api/settings').set(auth);
    expect(s.body.meta.youpiWebhookUrl).toMatch(/\/api\/payments\/youpi\/webhook$/);
  });

  it('only admins can change it', async () => {
    await api.post('/api/auth/users').set(auth).send({ name: 'Sam', email: 'sam@test.local', password: 'password123', role: 'SALES' }).expect(201);
    const login = await api.post('/api/auth/login').send({ email: 'sam@test.local', password: 'password123' });
    const sales = { Authorization: `Bearer ${login.body.token}` };
    expect((await api.put('/api/settings').set(sales).send({ youpiEnabled: false })).status).toBe(403);
    expect((await api.post('/api/settings/test-youpi').set(sales).send({})).status).toBe(403);
  });
});

describe('paying an invoice online', () => {
  let inv: { id: string; invoiceNumber: string; customerId: string };
  let orderId = '';
  let paymentId = '';

  it('creates a checkout for the balance with the customer details', async () => {
    inv = await newInvoice(1499.5);
    const r = await api.post(`/api/invoices/${inv.id}/online-payments`).set(auth);
    expect(r.status).toBe(201);
    const req = created.at(-1)!;
    expect(req.headers['x-merchant-id']).toBe('merchant-1');
    expect(req.headers['idempotency-key']).toBe(req.body.orderId);
    expect(req.body).toMatchObject({
      amount: '1499.50',
      currency: 'INR',
      customer: { name: 'Meera Kamat', email: 'meera@example.com', phoneNumber: '9822012345' },
      description: `Invoice ${inv.invoiceNumber} from Stix N Vibes`,
      metadata: { source: 'inwoice', invoiceId: inv.id, invoiceNumber: inv.invoiceNumber },
    });
    expect(r.body.data.checkoutUrl).toBe(`${gatewayUrl}/checkout/${r.body.data.gatewayPaymentId}`);
    orderId = r.body.data.orderId;
    paymentId = r.body.data.gatewayPaymentId;
  });

  it('tapping Pay now again within a few minutes reuses the same checkout', async () => {
    const before = created.length;
    const r = await api.post(`/api/invoices/${inv.id}/online-payments`).set(auth);
    expect(r.body.data.orderId).toBe(orderId);
    expect(created.length).toBe(before);
  });

  it('the email and WhatsApp message carry a Pay now link that opens the checkout', async () => {
    const mail = (await api.get(`/api/invoices/${inv.id}/compose`).set(auth)).body.data.text as string;
    const link = mail.match(/Pay online now: (\S+)/)?.[1];
    expect(link).toMatch(/\/api\/portal\/[\w-]+\/invoices\/[0-9a-f-]+\/pay$/);
    const wa = (await api.get(`/api/invoices/${inv.id}/whatsapp`).set(auth)).body.data.message as string;
    // (each test request arrives on its own port, so compare the path)
    expect(wa).toContain(`/api/portal/${new URL(link!).pathname.split('/api/portal/')[1]}`);
    expect(wa).toContain('Pay online now: ');
    const r = await api.get(new URL(link!).pathname).redirects(0);
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe(`${gatewayUrl}/checkout/${paymentId}`);
    // The portal knows online payment is on.
    const token = link!.split('/portal/')[1]!.split('/')[0];
    expect((await api.get(`/api/portal/${token}`)).body.data.payOnline).toBe(true);
  });

  it('rejects a webhook with a wrong or missing signature', async () => {
    const raw = JSON.stringify({ event: 'SUCCESS', orderId, paymentId, amount: '1499.50', amountPaise: 149950, utr: '123456789012' });
    const forged = await api.post('/api/payments/youpi/webhook').set('Content-Type', 'application/json').set('X-Gateway-Signature', `sha256=${'0'.repeat(64)}`).send(raw);
    expect(forged.status).toBe(401);
    const unsigned = await api.post('/api/payments/youpi/webhook').set('Content-Type', 'application/json').send(raw);
    expect(unsigned.status).toBe(401);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('PENDING');
  });

  it('a signed SUCCESS webhook records the payment with the UTR, once', async () => {
    const payload = { event: 'SUCCESS', orderId, paymentId, amount: '1499.50', amountPaise: 149950, currency: 'INR', method: 'UPI', utr: '412345678901', verificationLevel: 2 };
    const r = await webhook(payload);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ received: true, changed: true, status: 'SUCCESS' });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
    expect(after.status).toBe('PAID');
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toMatchObject({ amount: 1499.5, paymentMethod: 'UPI', referenceId: '412345678901' });
    // Retries of the same webhook change nothing.
    expect((await webhook(payload)).body.changed).toBe(false);
    expect(await prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(1);
    const row = await prisma.onlinePayment.findUniqueOrThrow({ where: { orderId } });
    expect(row).toMatchObject({ status: 'SUCCESS', utr: '412345678901', paymentId: after.payments[0]!.id });
    // A clean payment needs no review.
    expect(row.note).toBeNull();
    expect(await prisma.activity.count({ where: { referenceId: inv.id, eventType: 'PAYMENT_REVIEW' } })).toBe(0);
    expect(after.payments[0]!.notes).toContain('verification level 2');
  });

  it('a paid invoice no longer offers Pay now: the link returns to the portal with a message', async () => {
    const mail = (await api.get(`/api/invoices/${inv.id}/compose`).set(auth)).body.data.text as string;
    expect(mail).not.toContain('Pay online now');
    const token = (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).portalToken;
    const r = await api.get(`/api/portal/${token}/invoices/${inv.id}/pay`).redirects(0);
    expect(r.status).toBe(303);
    expect(decodeURIComponent(r.headers.location)).toContain('payError=This invoice is already paid');
  });
});

describe('edge cases', () => {
  it('accepts the V2 signature (timestamp + body)', async () => {
    const inv = await newInvoice(250);
    const s = (await api.post(`/api/invoices/${inv.id}/online-payments`).set(auth)).body.data;
    const raw = JSON.stringify({ event: 'FAILED', orderId: s.orderId, paymentId: s.gatewayPaymentId });
    const ts = String(Date.now());
    const v2 = crypto.createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex');
    const r = await api.post('/api/payments/youpi/webhook').set('Content-Type', 'application/json').set({ 'X-Gateway-Signature-V2': `sha256=${v2}`, 'X-Gateway-Timestamp': ts }).send(raw);
    expect(r.status).toBe(200);
    expect((await prisma.onlinePayment.findUniqueOrThrow({ where: { orderId: s.orderId } })).status).toBe('FAILED');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('PENDING');
  });

  it('a webhook for an order we never made, or with a mismatched payment id, is ignored', async () => {
    expect((await webhook({ event: 'SUCCESS', orderId: 'IW-NOT-OURS', amountPaise: 100 })).body.ignored).toBe('unknown order');
    const inv = await newInvoice(300);
    const s = (await api.post(`/api/invoices/${inv.id}/online-payments`).set(auth)).body.data;
    const r = await webhook({ event: 'SUCCESS', orderId: s.orderId, paymentId: crypto.randomUUID(), amountPaise: 30000 });
    expect(r.body.ignored).toBe('payment id does not match');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('PENDING');
  });

  it('a missed webhook is picked up by asking the gateway', async () => {
    const inv = await newInvoice(800);
    const s = (await api.post(`/api/invoices/${inv.id}/online-payments`).set(auth)).body.data;
    statusOf.set(s.gatewayPaymentId, { ...statusOf.get(s.gatewayPaymentId), status: 'SUCCESS', utr: '998877665544' });
    const r = await api.post(`/api/invoices/${inv.id}/online-payments/sync`).set(auth);
    expect(r.body.data).toMatchObject({ checked: 1, updated: 1 });
    expect(r.body.data.invoice.status).toBe('PAID');
    expect(r.body.data.sessions[0]).toMatchObject({ status: 'SUCCESS', utr: '998877665544' });
  });

  it('paid by cash meanwhile: the late online payment is flagged for a refund, not double-counted', async () => {
    const inv = await newInvoice(500);
    const s = (await api.post(`/api/invoices/${inv.id}/online-payments`).set(auth)).body.data;
    await api.post(`/api/invoices/${inv.id}/payments`).set(auth).send({ amount: 500, paymentMethod: 'CASH' }).expect(201);
    await webhook({ event: 'SUCCESS', orderId: s.orderId, paymentId: s.gatewayPaymentId, amountPaise: 50000, utr: '111122223333' }).expect(200);
    expect(await prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(1);
    const row = await prisma.onlinePayment.findUniqueOrThrow({ where: { orderId: s.orderId } });
    expect(row.note).toContain('already settled');
    expect(await prisma.activity.count({ where: { referenceId: inv.id, eventType: 'PAYMENT_REVIEW' } })).toBe(1);
  });

  it('the gateway refusing a payment gives a clear message', async () => {
    await api.put('/api/settings').set(auth).send({ businessName: 'REFUSE Co' }).expect(200);
    const inv = await newInvoice(120);
    const r = await api.post(`/api/invoices/${inv.id}/online-payments`).set(auth);
    expect(r.status).toBe(403);
    expect(r.body.error).toContain('refused');
    await api.put('/api/settings').set(auth).send({ businessName: 'Stix N Vibes' }).expect(200);
  });

  it('signature check works on the exact bytes', () => {
    const raw = Buffer.from('{"a":1}');
    const good = { 'x-gateway-signature': `sha256=${crypto.createHmac('sha256', 'k').update(raw).digest('hex')}` };
    expect(verifyWebhookSignature(raw, good, 'k')).toBe(true);
    expect(verifyWebhookSignature(Buffer.from('{"a": 1}'), good, 'k')).toBe(false);
    expect(verifyWebhookSignature(raw, good, '')).toBe(false);
  });
});

describe('opening Gmail in a chosen browser', () => {
  it("reads Chrome profiles and the Google account each one uses", () => {
    const localState = JSON.stringify({
      profile: { info_cache: { 'Profile 2': { name: 'Shop', user_name: 'shop@gmail.com' }, Default: { name: 'Personal', user_name: 'me@gmail.com' }, 'Profile 10': { name: 'Test' } } },
    });
    expect(readChromiumProfiles(localState)).toEqual([
      { dir: 'Default', name: 'Personal', email: 'me@gmail.com' },
      { dir: 'Profile 2', name: 'Shop', email: 'shop@gmail.com' },
      { dir: 'Profile 10', name: 'Test', email: null },
    ]);
    expect(readChromiumProfiles('not json')).toEqual([]);
  });

  it('only opens Gmail/Outlook addresses, only once a browser is chosen, and never through a proxy', async () => {
    const gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.com';
    expect((await api.post('/api/mail/open').set(auth).send({ url: 'https://evil.example.com/x' })).status).toBe(400);
    expect((await api.post('/api/mail/open').set(auth).send({ url: 'file:///C:/Windows/System32/calc.exe' })).status).toBe(400);
    const none = await api.post('/api/mail/open').set(auth).send({ url: gmail });
    expect(none.status).toBe(400);
    expect(none.body.error).toContain('Choose a browser');
    expect((await api.post('/api/mail/open').set(auth).set('X-Forwarded-For', '203.0.113.9').send({ url: gmail })).status).toBe(403);
    const list = await api.get('/api/mail/browsers').set(auth).set('X-Forwarded-For', '203.0.113.9');
    expect(list.body.data).toEqual({ available: false, browsers: [] });
  });

  it('a browser that is not installed cannot be used', async () => {
    await api.put('/api/settings').set(auth).send({ mailBrowser: 'not-a-browser' }).expect(200);
    const r = await api.post('/api/mail/open').set(auth).send({ url: 'https://mail.google.com/mail/?view=cm' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('no longer installed');
    await api.put('/api/settings').set(auth).send({ mailBrowser: '' }).expect(200);
  });
});
