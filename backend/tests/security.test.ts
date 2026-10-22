import http from 'http';
import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { totp } from '../src/lib/totp';
import { signV4 } from '../src/lib/s3';
import { uploadOffsite } from '../src/services/backup.service';

/**
 * v3.6: staff roles, sessions that end on password change/disable, two-factor sign-in,
 * the audit log, the period lock and off-site backups to S3-compatible storage.
 */

let owner: Record<string, string>;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const users: Record<string, { id: string; auth: Record<string, string> }> = {};
let customer: string;

async function addUser(role: string, email: string) {
  const created = await api.post('/api/auth/users').set(owner).send({ name: `${role} person`, email, password: 'password123', role });
  expect(created.status).toBe(201);
  const login = await api.post('/api/auth/login').send({ email, password: 'password123' });
  return { id: created.body.data.id as string, auth: bearer(login.body.token) };
}

beforeAll(async () => {
  await resetDb();
  owner = await setupOwner();
  await api.put('/api/settings').set(owner).send({ state: 'Goa' });
  customer = (await api.post('/api/customers').set(owner).send({ name: 'Walk-in', state: 'Goa' })).body.data.id;
  users.sales = await addUser('SALES', 'sales@test.local');
  users.stores = await addUser('STORES', 'stores@test.local');
  users.accountant = await addUser('ACCOUNTANT', 'acct@test.local');
});
afterAll(() => prisma.$disconnect());

describe('staff roles', () => {
  it('tells the browser what each role can do', async () => {
    const me = (await api.get('/api/auth/me').set(users.sales!.auth)).body.user;
    expect(me.role).toBe('SALES');
    expect(me.permissions).toMatchObject({ sales: 'write', catalog: 'read', payables: 'none' });
  });

  it('lets sales sell, and nothing more', async () => {
    const a = users.sales!.auth;
    const inv = await api.post('/api/invoices').set(a).send({ customerId: customer, issue: true, items: [{ type: 'CUSTOM', name: 'Work', unitPrice: 100, quantity: 1 }] });
    expect(inv.status).toBe(201);
    expect((await api.get('/api/products').set(a)).status).toBe(200);
    const prod = await api.post('/api/products').set(a).send({ name: 'X', price: 1 });
    expect(prod.status).toBe(403);
    expect(prod.body.error).toMatch(/can view this but not change it/);
    const bills = await api.get('/api/bills').set(a);
    expect(bills.status).toBe(403);
    expect(bills.body.error).toMatch(/does not have access/);
    expect((await api.get('/api/reports/pnl').set(a)).status).toBe(403);
    expect((await api.put('/api/settings').set(a).send({ businessName: 'Hacked' })).status).toBe(403);
    expect((await api.get('/api/audit').set(a)).status).toBe(403);
    const dash = (await api.get('/api/dashboard').set(a)).body.data.kpis;
    expect(dash).toMatchObject({ showMoneyOut: false, profitThisMonth: null, payables: null });
    expect((await api.get('/api/dashboard').set(owner)).body.data.kpis.showMoneyOut).toBe(true);
  });

  it('lets stores run stock, purchases and production but not money', async () => {
    const a = users.stores!.auth;
    expect((await api.post('/api/inventory').set(a).send({ name: 'Vinyl', unit: 'm' })).status).toBe(201);
    expect((await api.post('/api/suppliers').set(a).send({ name: 'PrintPro' })).status).toBe(201);
    expect((await api.get('/api/invoices').set(a)).status).toBe(200);
    expect((await api.post('/api/invoices').set(a).send({ customerId: customer, items: [{ type: 'CUSTOM', name: 'x', unitPrice: 1, quantity: 1 }] })).status).toBe(403);
    expect((await api.get('/api/expenses').set(a)).status).toBe(403);
  });

  it('lets the accountant enter bills and expenses and read everything', async () => {
    const a = users.accountant!.auth;
    expect((await api.post('/api/expenses').set(a).send({ category: 'Rent', description: 'Shop', amount: 5000 })).status).toBe(201);
    expect((await api.get('/api/reports/gstr3b').set(a)).status).toBe(200);
    expect((await api.get('/api/export/invoices').set(a)).status).toBe(200);
    expect((await api.get('/api/audit').set(a)).status).toBe(200);
    expect((await api.post('/api/customers').set(a).send({ name: 'Nope' })).status).toBe(403);
    expect((await api.post('/api/inventory').set(a).send({ name: 'Nope' })).status).toBe(403);
  });

  it('applies role changes and deactivation immediately', async () => {
    const a = users.stores!.auth;
    await api.patch(`/api/auth/users/${users.stores!.id}`).set(owner).send({ role: 'SALES' });
    expect((await api.post('/api/inventory').set(a).send({ name: 'Ink' })).status).toBe(403);
    await api.patch(`/api/auth/users/${users.stores!.id}`).set(owner).send({ isActive: false });
    const gone = await api.get('/api/customers').set(a);
    expect(gone.status).toBe(401);
    expect(gone.body.error).toMatch(/session has ended/);
  });

  it('signs a user out everywhere when an admin sets a new password', async () => {
    const before = users.accountant!.auth;
    await api.patch(`/api/auth/users/${users.accountant!.id}`).set(owner).send({ password: 'brand-new-123' });
    expect((await api.get('/api/auth/me').set(before)).status).toBe(401);
    const again = await api.post('/api/auth/login').send({ email: 'acct@test.local', password: 'brand-new-123' });
    users.accountant!.auth = bearer(again.body.token);
    expect((await api.get('/api/auth/me').set(users.accountant!.auth)).status).toBe(200);
  });

  it('never lets an admin lock themselves out', async () => {
    const me = (await api.get('/api/auth/me').set(owner)).body.user.id;
    expect((await api.patch(`/api/auth/users/${me}`).set(owner).send({ role: 'ACCOUNTANT' })).status).toBe(400);
    expect((await api.patch(`/api/auth/users/${me}`).set(owner).send({ isActive: false })).status).toBe(400);
  });
});

describe('two-factor sign-in', () => {
  let secret = '';
  let recovery: string[] = [];
  let a: Record<string, string>;

  it('sets up with a QR code and only turns on after a correct code', async () => {
    a = users.sales!.auth;
    const setup = await api.post('/api/auth/2fa/setup').set(a);
    expect(setup.body.data.qr).toMatch(/^data:image\/png;base64,/);
    expect(setup.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\/InWoice/);
    secret = setup.body.data.secret;
    expect((await api.post('/api/auth/2fa/enable').set(a).send({ code: '000000' })).status).toBe(400);
    const on = await api.post('/api/auth/2fa/enable').set(a).send({ code: totp(secret) });
    expect(on.status).toBe(200);
    recovery = on.body.data.recoveryCodes;
    expect(recovery).toHaveLength(8);
    const me = (await api.get('/api/auth/me').set(a)).body.user;
    expect(me).toMatchObject({ totpEnabled: true, recoveryCodesLeft: 8 });
    expect(JSON.stringify(me)).not.toContain(secret);
  });

  it('asks for a code after the password, and the half-way ticket is not a session', async () => {
    const step1 = await api.post('/api/auth/login').send({ email: 'sales@test.local', password: 'password123' });
    expect(step1.body).toMatchObject({ twoFactorRequired: true });
    expect(step1.body.token).toBeUndefined();
    expect((await api.get('/api/customers').set(bearer(step1.body.ticket))).status).toBe(401);
    const wrong = await api.post('/api/auth/login/2fa').send({ ticket: step1.body.ticket, code: '123456' });
    expect(wrong.status).toBe(401);
    const ok = await api.post('/api/auth/login/2fa').send({ ticket: step1.body.ticket, code: totp(secret) });
    expect(ok.status).toBe(200);
    expect((await api.get('/api/customers').set(bearer(ok.body.token))).status).toBe(200);
  });

  it('accepts each recovery code once', async () => {
    const t = (await api.post('/api/auth/login').send({ email: 'sales@test.local', password: 'password123' })).body.ticket;
    expect((await api.post('/api/auth/login/2fa').send({ ticket: t, code: recovery[0]!.toUpperCase() })).status).toBe(200);
    const t2 = (await api.post('/api/auth/login').send({ email: 'sales@test.local', password: 'password123' })).body.ticket;
    expect((await api.post('/api/auth/login/2fa').send({ ticket: t2, code: recovery[0] })).status).toBe(401);
    expect((await api.get('/api/auth/me').set(a)).body.user.recoveryCodesLeft).toBe(7);
  });

  it('turns off with the password, and admins can reset it for a lost phone', async () => {
    expect((await api.post('/api/auth/2fa/disable').set(a).send({ password: 'wrong' })).status).toBe(400);
    expect((await api.post('/api/auth/2fa/disable').set(a).send({ password: 'password123' })).status).toBe(200);
    expect((await api.post('/api/auth/login').send({ email: 'sales@test.local', password: 'password123' })).body.token).toBeTruthy();

    const s2 = (await api.post('/api/auth/2fa/setup').set(a)).body.data.secret;
    await api.post('/api/auth/2fa/enable').set(a).send({ code: totp(s2) });
    await api.patch(`/api/auth/users/${users.sales!.id}`).set(owner).send({ resetTwoFactor: true });
    expect((await api.post('/api/auth/login').send({ email: 'sales@test.local', password: 'password123' })).body.token).toBeTruthy();
  });
});

describe('audit log', () => {
  it('records who changed what, with readable references and no secrets', async () => {
    const a = users.sales!.auth;
    const inv = (await api.post('/api/invoices').set(a).send({ customerId: customer, issue: true, items: [{ type: 'CUSTOM', name: 'Audit me', unitPrice: 500, quantity: 1 }] })).body.data;
    await api.post(`/api/invoices/${inv.id}/payments`).set(a).send({ amount: 100 });
    await api.put('/api/settings').set(owner).send({ smtpPassword: 'super-secret-pass' });
    await api.post('/api/auth/login').send({ email: 'sales@test.local', password: 'nope' });

    const log = (await api.get('/api/audit').set(owner)).body.data as { action: string; entity: string; label: string | null; userName: string | null; entityId: string | null; path: string }[];
    expect(log.find((l) => l.entity === 'invoices' && l.action === 'CREATE' && l.label === inv.invoiceNumber)).toMatchObject({ userName: 'SALES person', entityId: inv.id });
    expect(log.find((l) => l.action === 'PAYMENT' && l.entityId === inv.id)).toBeTruthy();
    expect(log.find((l) => l.entity === 'settings' && l.action === 'UPDATE')).toBeTruthy();
    expect(log.find((l) => l.action === 'LOGIN_FAILED' && l.label === 'sales@test.local')).toBeTruthy();
    expect(log.some((l) => l.action === 'LOGIN')).toBe(true);
    expect(JSON.stringify(log)).not.toContain('super-secret-pass');

    const forInvoice = await api.get(`/api/audit?entityId=${inv.id}`).set(owner);
    expect(forInvoice.body.total).toBe(2);
  });

  it('records customer portal actions without the secret link', async () => {
    const q = (await api.post('/api/quotes').set(owner).send({ customerId: customer, items: [{ type: 'CUSTOM', name: 'Q', unitPrice: 10, quantity: 1 }] })).body.data;
    await api.patch(`/api/quotes/${q.id}/status`).set(owner).send({ status: 'SENT' });
    const url = (await api.post(`/api/customers/${customer}/portal`).set(owner)).body.data.url as string;
    const token = url.split('/portal/')[1]!;
    await api.post(`/api/portal/${token}/quotes/${q.id}/accept`);
    const log = (await api.get('/api/audit?entity=portal').set(owner)).body.data;
    expect(log[0]).toMatchObject({ userName: 'Customer (portal)', action: 'ACCEPT', entityId: q.id });
    expect(JSON.stringify(log)).not.toContain(token);
  });
});

describe('period lock', () => {
  const day = (offset: number) => {
    const d = new Date(Date.now() + offset * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  let oldInvoice: { id: string };

  it('blocks changes dated on or before the lock date, everywhere', async () => {
    oldInvoice = (await api.post('/api/invoices').set(owner).send({ customerId: customer, issue: true, date: day(-10), items: [{ type: 'CUSTOM', name: 'Old', unitPrice: 100, quantity: 1 }] })).body.data;
    await api.put('/api/settings').set(owner).send({ lockedUntil: day(-5) });

    const create = await api.post('/api/invoices').set(owner).send({ customerId: customer, date: day(-6), items: [{ type: 'CUSTOM', name: 'Backdated', unitPrice: 1, quantity: 1 }] });
    expect(create.status).toBe(409);
    expect(create.body.error).toMatch(/locked period/);
    expect((await api.post(`/api/invoices/${oldInvoice.id}/cancel`).set(owner)).status).toBe(409);
    expect((await api.post(`/api/invoices/${oldInvoice.id}/payments`).set(owner).send({ amount: 10, paymentDate: day(-7) })).status).toBe(409);
    expect((await api.post('/api/expenses').set(owner).send({ category: 'Rent', description: 'Old rent', amount: 100, date: day(-30) })).status).toBe(409);
    const sup = (await api.post('/api/suppliers').set(owner).send({ name: 'Old supplier' })).body.data.id;
    expect((await api.post('/api/bills').set(owner).send({ supplierId: sup, billNumber: 'OLD-1', date: day(-8), items: [{ description: 'x', quantity: 1, unitPrice: 1 }] })).status).toBe(409);
    const items = (await api.get(`/api/invoices/${oldInvoice.id}`).set(owner)).body.data.items;
    expect((await api.post(`/api/invoices/${oldInvoice.id}/credit-notes`).set(owner).send({ reason: 'DISCOUNT', date: day(-6), items: [{ invoiceItemId: items[0].id, amount: 10 }] })).status).toBe(409);
  });

  it('still allows anything dated after the lock (e.g. a payment today on an old invoice)', async () => {
    expect((await api.post(`/api/invoices/${oldInvoice.id}/payments`).set(owner).send({ amount: 10 })).status).toBe(201);
    expect((await api.post('/api/invoices').set(owner).send({ customerId: customer, date: day(-4), items: [{ type: 'CUSTOM', name: 'Fine', unitPrice: 1, quantity: 1 }] })).status).toBe(201);
  });

  it('can be unlocked by an admin only', async () => {
    expect((await api.put('/api/settings').set(users.sales!.auth).send({ lockedUntil: '' })).status).toBe(403);
    await api.put('/api/settings').set(owner).send({ lockedUntil: '' });
    expect((await api.post('/api/expenses').set(owner).send({ category: 'Rent', description: 'Old rent', amount: 100, date: day(-30) })).status).toBe(201);
  });
});

describe('off-site backups (S3-compatible)', () => {
  let server: http.Server;
  let port = 0;
  const received: { method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer; validSignature: boolean }[] = [];
  let refuse = false;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        // Recompute the signature like S3 would, from the request as received.
        const amz = String(req.headers['x-amz-date']);
        const expected = signV4({
          method: req.method!,
          url: new URL(`http://${req.headers.host}${req.url}`),
          region: 'auto',
          service: 's3',
          accessKey: 'AKTEST',
          secretKey: 'secret-test-key',
          headers: { 'content-type': String(req.headers['content-type']), 'x-amz-content-sha256': String(req.headers['x-amz-content-sha256']) },
          payloadHash: crypto.createHash('sha256').update(body).digest('hex'),
          now: new Date(`${amz.slice(0, 4)}-${amz.slice(4, 6)}-${amz.slice(6, 8)}T${amz.slice(9, 11)}:${amz.slice(11, 13)}:${amz.slice(13, 15)}Z`),
        }).authorization;
        received.push({ method: req.method!, url: req.url!, headers: req.headers, body, validSignature: expected === req.headers.authorization });
        if (refuse) {
          res.writeHead(403, { 'content-type': 'application/xml' });
          res.end('<Error><Code>SignatureDoesNotMatch</Code><Message>The signature does not match</Message></Error>');
        } else {
          res.writeHead(200, { etag: '"abc"' });
          res.end();
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('stores the secret key without ever returning it', async () => {
    const res = await api.put('/api/settings').set(owner).send({ s3Endpoint: `http://127.0.0.1:${port}`, s3Region: 'auto', s3Bucket: 'shop-backups', s3AccessKey: 'AKTEST', s3SecretKey: 'secret-test-key' });
    expect(res.status).toBe(200);
    expect(res.body.data.s3SecretKey).toBeUndefined();
    expect(res.body.data.s3SecretKeySet).toBe(true);
    expect((await api.put('/api/settings').set(owner).send({ s3Endpoint: 'not a url' })).status).toBe(400);
  });

  it('tests the connection with a correctly signed upload', async () => {
    const res = await api.post('/api/backups/offsite/test').set(owner);
    expect(res.status).toBe(200);
    const put = received.at(-1)!;
    expect(put.method).toBe('PUT');
    expect(put.url).toBe('/shop-backups/inwoice-backups/inwoice-connection-test.txt');
    expect(put.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKTEST\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(put.validSignature).toBe(true);
  });

  it('uploads a backup and remembers when, or why it failed', async () => {
    await uploadOffsite('inwoice-20261022-010000.json.gz', Buffer.from('fake backup'));
    expect(received.at(-1)!.body.toString()).toBe('fake backup');
    let status = (await api.get('/api/backups').set(owner)).body.data.offsite;
    expect(status).toMatchObject({ configured: true, lastError: null });
    expect(status.lastAt).toBeTruthy();

    refuse = true;
    await expect(uploadOffsite('inwoice-20261022-020000.json.gz', Buffer.from('x'))).rejects.toThrow(/SignatureDoesNotMatch/);
    status = (await api.get('/api/backups').set(owner)).body.data.offsite;
    expect(status.lastError).toMatch(/SignatureDoesNotMatch/);
    refuse = false;
  });
});
