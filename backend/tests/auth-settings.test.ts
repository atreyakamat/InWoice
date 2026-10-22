import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb } from './helpers';

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

describe('auth & first-run setup', () => {
  let auth: Record<string, string>;

  it('reports setup required on an empty database', async () => {
    const res = await api.get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.data.setupRequired).toBe(true);
  });

  it('rejects weak setup passwords', async () => {
    const res = await api.post('/api/auth/setup').send({ name: 'Owner', email: 'o@test.local', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('creates the owner once, then locks setup', async () => {
    const res = await api
      .post('/api/auth/setup')
      .send({ name: 'Owner', email: 'Owner@Test.local', password: 'password123', businessName: 'Acme Stickers' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('owner@test.local');
    auth = { Authorization: `Bearer ${res.body.token}` };

    const again = await api.post('/api/auth/setup').send({ name: 'X', email: 'x@test.local', password: 'password123' });
    expect(again.status).toBe(403);
    expect((await api.get('/api/auth/status')).body.data.setupRequired).toBe(false);
  });

  it('logs in with correct credentials only', async () => {
    expect((await api.post('/api/auth/login').send({ email: 'owner@test.local', password: 'wrong-pass' })).status).toBe(401);
    expect((await api.post('/api/auth/login').send({ email: 'nobody@test.local', password: 'password123' })).status).toBe(401);
    const ok = await api.post('/api/auth/login').send({ email: 'OWNER@test.local', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('ADMIN');
  });

  it('protects API routes', async () => {
    expect((await api.get('/api/customers')).status).toBe(401);
    expect((await api.get('/api/customers').set('Authorization', 'Bearer not-a-token')).status).toBe(401);
    expect((await api.get('/api/auth/me').set(auth)).body.user.name).toBe('Owner');
  });

  it('changes password', async () => {
    const bad = await api.post('/api/auth/change-password').set(auth).send({ currentPassword: 'nope', newPassword: 'newpassword1' });
    expect(bad.status).toBe(400);
    const ok = await api.post('/api/auth/change-password').set(auth).send({ currentPassword: 'password123', newPassword: 'newpassword1' });
    expect(ok.status).toBe(200);
    expect((await api.post('/api/auth/login').send({ email: 'owner@test.local', password: 'newpassword1' })).status).toBe(200);
    // Other sessions end; this device carries on with the fresh token it was given.
    expect((await api.get('/api/auth/me').set(auth)).status).toBe(401);
    auth = { Authorization: `Bearer ${ok.body.token}` };
    expect((await api.get('/api/auth/me').set(auth)).status).toBe(200);
  });

  it('lets admins add staff, and staff cannot change settings', async () => {
    const created = await api
      .post('/api/auth/users')
      .set(auth)
      .send({ name: 'Staff One', email: 'staff@test.local', password: 'staffpass1', role: 'STAFF' });
    expect(created.status).toBe(201);
    const login = await api.post('/api/auth/login').send({ email: 'staff@test.local', password: 'staffpass1' });
    const staff = { Authorization: `Bearer ${login.body.token}` };
    expect((await api.get('/api/settings').set(staff)).status).toBe(200);
    expect((await api.put('/api/settings').set(staff).send({ businessName: 'Hacked' })).status).toBe(403);
    expect((await api.get('/api/auth/users').set(staff)).status).toBe(403);

    // Disabled accounts cannot log in.
    await api.patch(`/api/auth/users/${created.body.data.id}`).set(auth).send({ isActive: false });
    expect((await api.post('/api/auth/login').send({ email: 'staff@test.local', password: 'staffpass1' })).status).toBe(401);
  });

  it('saves settings and never returns secrets', async () => {
    const res = await api
      .put('/api/settings')
      .set(auth)
      .send({ state: 'Goa', defaultTaxRate: 12, smtpPassword: 'super-secret', aiApiKey: 'sk-ant-test', aiProvider: 'NONE', email: '' });
    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('Goa');
    expect(res.body.data.defaultTaxRate).toBe(12);
    expect(res.body.data.smtpPassword).toBeUndefined();
    expect(res.body.data.aiApiKey).toBeUndefined();
    expect(res.body.data.smtpPasswordSet).toBe(true);
    expect(res.body.data.aiApiKeySet).toBe(true);
    expect(res.body.data.email).toBeNull();

    // Omitting a secret keeps it; empty string clears it.
    await api.put('/api/settings').set(auth).send({ businessName: 'Acme 2' });
    expect((await api.get('/api/settings').set(auth)).body.data.aiApiKeySet).toBe(true);
    await api.put('/api/settings').set(auth).send({ aiApiKey: '' });
    expect((await api.get('/api/settings').set(auth)).body.data.aiApiKeySet).toBe(false);
  });

  it('saving one settings tab never clears fields from another', async () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    await api.put('/api/settings').set(auth).send({ address: '1 Main St', gstNumber: '30abcde1234f1zd', logoUrl: logo, upiId: 'shop@upi' });
    await api.put('/api/settings').set(auth).send({ invoicePrefix: 'AC-', paymentTermsDays: 30 });
    const s = (await api.get('/api/settings').set(auth)).body.data;
    expect(s).toMatchObject({ address: '1 Main St', gstNumber: '30ABCDE1234F1ZD', logoUrl: logo, upiId: 'shop@upi', invoicePrefix: 'AC-', paymentTermsDays: 30 });
    // An explicit empty string still clears a field.
    await api.put('/api/settings').set(auth).send({ upiId: '' });
    expect((await api.get('/api/settings').set(auth)).body.data.upiId).toBeNull();
  });

  it('rejects invalid settings', async () => {
    expect((await api.put('/api/settings').set(auth).send({ defaultTaxRate: 150 })).status).toBe(400);
    expect((await api.put('/api/settings').set(auth).send({ logoUrl: 'data:text/html;base64,AAA' })).status).toBe(400);
    const bad = await api.put('/api/settings').set(auth).send({ gstNumber: '30ABCDE1234F1ZX' });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/check digit/);
  });

  it('returns JSON 404 for unknown API routes and reports health', async () => {
    const res = await api.get('/api/does-not-exist').set(auth);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect((await api.get('/health')).body.database).toBe('ok');
  });
});
