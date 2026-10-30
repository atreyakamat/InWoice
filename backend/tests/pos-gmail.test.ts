import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { WALK_IN } from '../src/services/pos.service';

let auth: Record<string, string>;
let sticker: { id: string };

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  await api.put('/api/settings').set(auth).send({ state: 'Goa', gstNumber: '30ABCDE1234F1ZD', defaultTaxRate: 18, invoicePrefix: 'C-' }).expect(200);
  sticker = (await api.post('/api/products').set(auth).send({ name: 'Holo sticker', price: 50, stock: 40, taxRate: 12, hsnCode: '4911' })).body.data;
});
afterAll(() => prisma.$disconnect());

// --- Point of sale ------------------------------------------------------------------------

describe('point of sale', () => {
  const line = (quantity: number) => [{ type: 'PRODUCT', itemId: sticker.id, quantity }];

  it('loads the catalogue for the till', async () => {
    const r = await api.get('/api/pos/catalog').set(auth);
    expect(r.status).toBe(200);
    expect(r.body.data.products).toEqual([expect.objectContaining({ name: 'Holo sticker', price: 50, stock: 40 })]);
    expect(r.body.data).toMatchObject({ defaultTaxRate: 18, online: false, upiId: null });
  });

  it('cash sale: paid at once, change worked out, stock taken, walk-in customer', async () => {
    const r = await api.post('/api/pos/sale').set(auth).send({ items: line(3), method: 'CASH', tendered: 200 });
    expect(r.status).toBe(201);
    // 3 × 50 = 150 + 12% = 168; change from 200 is 32.
    expect(r.body.data.invoice).toMatchObject({ grandTotal: 168, status: 'PAID', source: 'POS', balanceDue: 0 });
    expect(r.body.data.change).toBe(32);
    expect(r.body.data.invoice.customer.name).toBe(WALK_IN);
    expect(r.body.data.invoice.dueDate.slice(0, 10)).toBe(r.body.data.invoice.date.slice(0, 10));
    expect((await prisma.product.findUniqueOrThrow({ where: { id: sticker.id } })).stock).toBe(37);
    expect(r.body.data.invoice.payments[0]).toMatchObject({ amount: 168, paymentMethod: 'CASH' });
  });

  it('the walk-in customer is reused, not duplicated', async () => {
    await api.post('/api/pos/sale').set(auth).send({ items: line(1), method: 'CARD', reference: 'SLIP-881' }).expect(201);
    expect(await prisma.customer.count({ where: { name: WALK_IN } })).toBe(1);
  });

  it('a phone number finds the existing customer', async () => {
    const meera = (await api.post('/api/customers').set(auth).send({ name: 'Meera', phone: '+91 98220 12345', state: 'Goa' })).body.data;
    const r = await api.post('/api/pos/sale').set(auth).send({ items: line(1), method: 'UPI', customerPhone: '9822012345', reference: 'UTR123' });
    expect(r.body.data.invoice.customerId).toBe(meera.id);
    // A new phone and name creates a customer for next time.
    const r2 = await api.post('/api/pos/sale').set(auth).send({ items: line(1), method: 'CASH', customerName: 'Rohit', customerPhone: '9000011111' });
    expect(r2.body.data.invoice.customer).toMatchObject({ name: 'Rohit', phone: '9000011111' });
  });

  it('pay later needs a named customer', async () => {
    expect((await api.post('/api/pos/sale').set(auth).send({ items: line(1), method: 'LATER' })).status).toBe(400);
    const r = await api.post('/api/pos/sale').set(auth).send({ items: line(2), method: 'LATER', customerName: 'Café Tab', customerPhone: '9111122222' });
    expect(r.body.data.invoice).toMatchObject({ status: 'PENDING', balanceDue: 112 });
  });

  it('too little cash: refused, and the sale is kept unpaid rather than lost', async () => {
    const before = await prisma.invoice.count();
    const r = await api.post('/api/pos/sale').set(auth).send({ items: line(1), method: 'CASH', tendered: 20 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/less than the total.*saved unpaid/);
    expect(await prisma.invoice.count()).toBe(before + 1);
  });

  it('UPI QR needs a UPI ID; online needs YouPI', async () => {
    expect((await api.post('/api/pos/upi-qr').set(auth).send({ amount: 56 })).status).toBe(400);
    await api.put('/api/settings').set(auth).send({ upiId: 'stall@upi' }).expect(200);
    const qr = (await api.post('/api/pos/upi-qr').set(auth).send({ amount: 56 })).body.data;
    expect(qr.link).toContain('pa=stall%40upi');
    expect(qr.link).toContain('am=56.00');
    expect(qr.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect((await api.post('/api/pos/sale').set(auth).send({ items: line(1), method: 'ONLINE' })).status).toBe(400);
  });

  it("the day's takings add up by method", async () => {
    const s = (await api.get('/api/pos/summary').set(auth)).body.data;
    // Sales: 168 cash, 56 card, 56 UPI, 56 cash (Rohit), 112 on account, 56 unpaid (short cash).
    expect(s).toMatchObject({ sales: 6, total: 504, unpaid: 168, byMethod: { CASH: 224, CARD: 56, UPI: 56 } });
  });

  it('counter sales are ordinary invoices: they show in GST reports', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const r = (await api.get(`/api/reports/gst?month=${month}`).set(auth)).body.data;
    expect(r.summary.invoices).toBe(6);
  });

  it('a Sales user can use the till', async () => {
    await api.post('/api/auth/users').set(auth).send({ name: 'Till', email: 'till@test.local', password: 'password123', role: 'SALES' }).expect(201);
    const t = (await api.post('/api/auth/login').send({ email: 'till@test.local', password: 'password123' })).body.token;
    expect((await api.get('/api/pos/catalog').set({ Authorization: `Bearer ${t}` })).status).toBe(200);
  });
});

// --- Connect Gmail ------------------------------------------------------------------------

describe('Connect Gmail', () => {
  let google: http.Server;
  const sent: { auth: string; raw: string }[] = [];
  const tokenCalls: Record<string, string>[] = [];
  let revoked = '';
  let refreshResult: 'ok' | 'invalid_grant' = 'ok';
  let gmail401Once = false;
  let grantedScope = 'openid email https://www.googleapis.com/auth/gmail.send';
  const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email, email_verified: true })).toString('base64url')}.sig`;

  beforeAll(async () => {
    google = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/token') {
          const p = Object.fromEntries(new URLSearchParams(body));
          tokenCalls.push(p);
          if (p.grant_type === 'authorization_code') {
            if (p.code !== 'good-code') return res.writeHead(400).end(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad code' }));
            return res.end(JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, scope: grantedScope, id_token: idToken('shop.owner@gmail.com') }));
          }
          if (refreshResult === 'invalid_grant') return res.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' }));
          return res.end(JSON.stringify({ access_token: 'at-2', expires_in: 3600 }));
        }
        if (req.url === '/gmail/v1/users/me/messages/send') {
          if (gmail401Once) {
            gmail401Once = false;
            return res.writeHead(401).end(JSON.stringify({ error: { message: 'expired' } }));
          }
          sent.push({ auth: String(req.headers.authorization), raw: Buffer.from(JSON.parse(body).raw, 'base64url').toString('utf8') });
          return res.end(JSON.stringify({ id: `m${sent.length}` }));
        }
        if (req.url?.startsWith('/revoke')) {
          revoked = new URL(req.url, 'http://x').searchParams.get('token') ?? '';
          return res.end('{}');
        }
        res.writeHead(404).end('{}');
      });
    });
    await new Promise<void>((r) => google.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;
    process.env.GOOGLE_AUTH_URL = `${base}/auth`;
    process.env.GOOGLE_TOKEN_URL = `${base}/token`;
    process.env.GOOGLE_REVOKE_URL = `${base}/revoke`;
    process.env.GMAIL_API_URL = base;
  });
  afterAll(async () => {
    for (const k of ['GOOGLE_AUTH_URL', 'GOOGLE_TOKEN_URL', 'GOOGLE_REVOKE_URL', 'GMAIL_API_URL']) delete process.env[k];
    await new Promise((r) => google.close(r));
  });

  let state = '';
  let invoiceId = '';

  it('needs a Google OAuth client first', async () => {
    const s = (await api.get('/api/google/status').set(auth)).body.data;
    expect(s).toMatchObject({ configured: false, connected: null });
    expect(s.redirectUri).toMatch(/\/api\/google\/callback$/);
    expect((await api.post('/api/google/connect').set(auth)).status).toBe(400);
  });

  it('builds the Google sign-in link with send-only permission', async () => {
    const saved = await api.put('/api/settings').set(auth).send({ googleClientId: 'client-123.apps.googleusercontent.com', googleClientSecret: 'shh' });
    expect(saved.body.data.googleClientSecret).toBeUndefined();
    expect(saved.body.data.googleClientSecretSet).toBe(true);
    const url = new URL((await api.post('/api/google/connect').set(auth)).body.data.url);
    expect(url.pathname).toBe('/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client-123.apps.googleusercontent.com',
      response_type: 'code',
      scope: 'openid email https://www.googleapis.com/auth/gmail.send',
      access_type: 'offline',
      prompt: 'consent',
    });
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/api\/google\/callback$/);
    state = url.searchParams.get('state')!;
  });

  it('a tampered or cancelled sign-in goes back to Settings with a message', async () => {
    const bad = await api.get(`/api/google/callback?code=good-code&state=${state}x`).redirects(0);
    expect(bad.status).toBe(303);
    expect(decodeURIComponent(bad.headers.location)).toContain('gmailError=This Google sign-in link has expired');
    const cancelled = await api.get('/api/google/callback?error=access_denied').redirects(0);
    expect(decodeURIComponent(cancelled.headers.location)).toContain('gmailError=Google sign-in was cancelled');
  });

  it('refuses a sign-in where the send permission was unticked', async () => {
    grantedScope = 'openid email';
    const r = await api.get(`/api/google/callback?code=good-code&state=${state}`).redirects(0);
    expect(decodeURIComponent(r.headers.location)).toContain('Send email on your behalf');
    grantedScope = 'openid email https://www.googleapis.com/auth/gmail.send';
  });

  it('Google sends the user back: the Gmail account is connected', async () => {
    const r = await api.get(`/api/google/callback?code=good-code&state=${state}`).redirects(0);
    expect(r.status).toBe(303);
    expect(r.headers.location).toMatch(/\/settings\?tab=Email&gmail=shop\.owner%40gmail\.com$/);
    const code = tokenCalls.find((t) => t.grant_type === 'authorization_code' && t.code === 'good-code')!;
    expect(code).toMatchObject({ client_id: 'client-123.apps.googleusercontent.com', client_secret: 'shh' });
    const s = (await api.get('/api/google/status').set(auth)).body.data;
    expect(s).toMatchObject({ configured: true, connected: 'shop.owner@gmail.com' });
    // The token never reaches the browser.
    expect(JSON.stringify(s)).not.toContain('rt-1');
    expect(JSON.stringify((await api.get('/api/auth/me').set(auth)).body)).not.toContain('rt-1');
  });

  it('sends the invoice from that Gmail with the PDF attached', async () => {
    const cust = (await api.post('/api/customers').set(auth).send({ name: 'Bean There', email: 'accounts@beanthere.in', state: 'Goa' })).body.data;
    const inv = (await api.post('/api/invoices').set(auth).send({ customerId: cust.id, issue: true, items: [{ name: 'Menu stickers', quantity: 4, unitPrice: 100, taxRate: 12 }] })).body.data;
    invoiceId = inv.id;
    const r = await api.post(`/api/invoices/${inv.id}/send`).set(auth).send({ via: 'gmail', subject: 'Your invoice', message: 'Hi! Invoice attached.' });
    expect(r.status).toBe(200);
    const m = sent.at(-1)!;
    expect(m.auth).toBe('Bearer at-1');
    expect(m.raw).toMatch(/^From: Test Biz <shop\.owner@gmail\.com>/m);
    expect(m.raw).toMatch(/^To: accounts@beanthere\.in/m);
    expect(m.raw).toMatch(/^Subject: Your invoice/m);
    expect(m.raw).toContain('Hi! Invoice attached.');
    expect(m.raw).toMatch(new RegExp(`filename=${inv.invoiceNumber}\\.pdf`));
    expect(m.raw).toContain('Content-Type: application/pdf');
    expect(await prisma.emailLog.count({ where: { referenceId: inv.id, status: 'SENT' } })).toBe(1);
  });

  it('automatic emails can go out through a connected Gmail, with no SMTP set up', async () => {
    const me = (await api.get('/api/auth/me').set(auth)).body.user;
    expect((await api.put('/api/settings').set(auth).send({ autoMailUserId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    await api.put('/api/settings').set(auth).send({ autoMailUserId: me.id }).expect(200);
    expect((await api.get('/api/settings').set(auth)).body.meta.emailConfigured).toBe(true);
    const before = sent.length;
    const r = await api.post(`/api/invoices/${invoiceId}/remind`).set(auth).send({});
    expect(r.status).toBe(200);
    expect(sent.length).toBe(before + 1);
    // The subject has ₹ in it, so it is MIME-encoded; the plain body names the invoice.
    expect(sent.at(-1)!.raw).toMatch(/^Subject: =\?UTF-8\?/m);
    expect(sent.at(-1)!.raw).toContain('Bean There');
  });

  it('an expired access token is renewed once, silently', async () => {
    gmail401Once = true;
    const r = await api.post(`/api/invoices/${invoiceId}/send`).set(auth).send({ via: 'gmail' });
    expect(r.status).toBe(200);
    expect(sent.at(-1)!.auth).toBe('Bearer at-2');
  });

  it('if Google access was removed, it says to connect again', async () => {
    gmail401Once = true;
    refreshResult = 'invalid_grant';
    const r = await api.post(`/api/invoices/${invoiceId}/send`).set(auth).send({ via: 'gmail' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('Connect Gmail again');
    expect((await api.get('/api/google/status').set(auth)).body.data).toMatchObject({ connected: null, expired: true });
    refreshResult = 'ok';
  });

  it('disconnect revokes at Google and stops automatic emails using it', async () => {
    // Reconnect first.
    const url = new URL((await api.post('/api/google/connect').set(auth)).body.data.url);
    await api.get(`/api/google/callback?code=good-code&state=${url.searchParams.get('state')}`).redirects(0);
    const me = (await api.get('/api/auth/me').set(auth)).body.user;
    await api.put('/api/settings').set(auth).send({ autoMailUserId: me.id }).expect(200);
    await api.post('/api/google/disconnect').set(auth).expect(200);
    expect(revoked).toBe('rt-1');
    const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(u).toMatchObject({ gmailAddress: null, gmailRefreshToken: null });
    expect((await api.get('/api/settings').set(auth)).body.data.autoMailUserId).toBeNull();
    expect((await api.post(`/api/invoices/${invoiceId}/send`).set(auth).send({ via: 'gmail' })).status).toBe(400);
  });
});
