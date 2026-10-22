import zlib from 'zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { config } from '../src/lib/config';
import { baseClient } from '../src/lib/prisma';
import { disconnectTenants } from '../src/lib/tenancy';
import { adoptPublicSchema, createPlatformAdmin, forgetTenants } from '../src/services/platform.service';
import { tick } from '../src/services/scheduler';

/**
 * v3.7 multi-business mode: many businesses on one server, each in its own PostgreSQL
 * schema, reached by sub-domain or custom domain.
 */

const BASE = 'inwoice.test';
const saved = { ...config };
let publicOwner: Record<string, string>;
const host = (slug: string) => `${slug}.${BASE}`;
const tokens: Record<string, Record<string, string>> = {};
let platformToken = '';

async function dropAll() {
  const schemas = await baseClient.$queryRaw<{ s: string }[]>`SELECT nspname AS s FROM pg_namespace WHERE nspname LIKE 't\\_%' OR nspname = 'control'`;
  for (const { s } of schemas) await baseClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${s}" CASCADE`);
}

async function login(slug: string, email: string, password: string) {
  const res = await api.post('/api/auth/login').set('Host', host(slug)).send({ email, password });
  expect(res.status).toBe(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

beforeAll(async () => {
  await resetDb();
  publicOwner = await setupOwner(); // the existing single-business data
  await api.post('/api/customers').set(publicOwner).send({ name: 'Legacy Customer' });
  await dropAll();
  Object.assign(config, { multiTenant: true, baseDomain: BASE, signupEnabled: false, allowTenantHeader: true, trialDays: 14 });
  forgetTenants();
});

afterAll(async () => {
  Object.assign(config, saved);
  forgetTenants();
  await disconnectTenants();
  await dropAll();
  await prisma.$disconnect();
});

describe('sign-up', () => {
  it('tells the browser it is on the platform site', async () => {
    const info = (await api.get('/api/platform/info').set('Host', BASE)).body.data;
    expect(info).toMatchObject({ multiTenant: true, root: true, tenant: null, signupEnabled: false });
    expect(info.plans.map((p: { key: string }) => p.key)).toEqual(['TRIAL', 'STARTER', 'GROWTH', 'BUSINESS']);
    // Business APIs don't exist on the platform address.
    expect((await api.get('/api/customers').set('Host', BASE)).status).toBe(404);
  });

  it('is closed unless switched on', async () => {
    const res = await api.post('/api/platform/signup').set('Host', BASE).send({ businessName: 'Acme', slug: 'acme', name: 'Asha', email: 'asha@acme.test', password: 'password123' });
    expect(res.status).toBe(403);
    config.signupEnabled = true;
  });

  it('creates each business in its own schema with an owner and a trial', async () => {
    const a = await api.post('/api/platform/signup').set('Host', BASE).send({ businessName: 'Acme Stickers', slug: 'acme', name: 'Asha', email: 'asha@acme.test', password: 'password123' });
    expect(a.status).toBe(201);
    expect(a.body.data.url).toMatch(/^http:\/\/acme\.inwoice\.test/);
    expect(new Date(a.body.data.trialEndsAt).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    const b = await api.post('/api/platform/signup').set('Host', BASE).send({ businessName: 'Bolt Prints', slug: 'bolt', name: 'Bala', email: 'bala@bolt.test', password: 'password123' });
    expect(b.status).toBe(201);
    const schemas = (await baseClient.$queryRaw<{ s: string }[]>`SELECT nspname AS s FROM pg_namespace WHERE nspname IN ('t_acme', 't_bolt') ORDER BY 1`).map((r) => r.s);
    expect(schemas).toEqual(['t_acme', 't_bolt']);
  });

  it('refuses taken, reserved and badly formed addresses', async () => {
    const dup = await api.post('/api/platform/signup').set('Host', BASE).send({ businessName: 'Acme 2', slug: 'acme', name: 'X Y', email: 'x@y.test', password: 'password123' });
    expect(dup.status).toBe(409);
    expect((await api.post('/api/platform/signup').set('Host', BASE).send({ businessName: 'Adm', slug: 'admin', name: 'X Y', email: 'x@y.test', password: 'password123' })).status).toBe(400);
    expect((await api.post('/api/platform/signup').set('Host', BASE).send({ businessName: 'Bad', slug: 'Bad Name!', name: 'X Y', email: 'x@y.test', password: 'password123' })).status).toBe(400);
    expect((await api.get('/api/platform/check-slug?slug=bolt').set('Host', BASE)).body.data).toMatchObject({ available: false });
    expect((await api.get('/api/platform/check-slug?slug=fresh-shop').set('Host', BASE)).body.data).toMatchObject({ available: true });
  });
});

describe('isolation between businesses', () => {
  beforeAll(async () => {
    tokens.acme = await login('acme', 'asha@acme.test', 'password123');
    tokens.bolt = await login('bolt', 'bala@bolt.test', 'password123');
  });

  it('keeps settings, customers and invoice numbers separate', async () => {
    expect((await api.get('/api/settings').set('Host', host('acme')).set(tokens.acme!)).body.data.businessName).toBe('Acme Stickers');
    expect((await api.get('/api/settings').set('Host', host('bolt')).set(tokens.bolt!)).body.data.businessName).toBe('Bolt Prints');

    const c = (await api.post('/api/customers').set('Host', host('acme')).set(tokens.acme!).send({ name: 'Acme Buyer' })).body.data;
    const inv = await api.post('/api/invoices').set('Host', host('acme')).set(tokens.acme!).send({ customerId: c.id, issue: true, items: [{ type: 'CUSTOM', name: 'Stickers', unitPrice: 100, quantity: 2 }] });
    expect(inv.body.data.invoiceNumber).toBe('INV-0001');

    const boltCustomers = (await api.get('/api/customers').set('Host', host('bolt')).set(tokens.bolt!)).body.data;
    expect(boltCustomers).toEqual([]);
    const bc = (await api.post('/api/customers').set('Host', host('bolt')).set(tokens.bolt!).send({ name: 'Bolt Buyer' })).body.data;
    const binv = await api.post('/api/invoices').set('Host', host('bolt')).set(tokens.bolt!).send({ customerId: bc.id, issue: true, items: [{ type: 'CUSTOM', name: 'Prints', unitPrice: 50, quantity: 1 }] });
    expect(binv.body.data.invoiceNumber).toBe('INV-0001');
    // Another business's record isn't even visible by id.
    expect((await api.get(`/api/invoices/${inv.body.data.id}`).set('Host', host('bolt')).set(tokens.bolt!)).status).toBe(404);
  });

  it('keeps raw SQL reports separate too', async () => {
    const dash = (await api.get('/api/dashboard').set('Host', host('bolt')).set(tokens.bolt!)).body.data;
    expect(dash.topCustomers.map((c: { name: string }) => c.name)).toEqual(['Bolt Buyer']);
    expect(dash.kpis.customers).toBe(1);
  });

  it('only accepts a token at the business that issued it', async () => {
    const res = await api.get('/api/customers').set('Host', host('bolt')).set(tokens.acme!);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sign in to this business/);
    expect((await api.get('/api/customers').set('Host', BASE).set(tokens.acme!)).status).toBe(404);
  });

  it('leaves the original single-business data alone', async () => {
    const legacy = await prisma.customer.findMany();
    expect(legacy.map((c) => c.name)).toEqual(['Legacy Customer']);
  });

  it('backs up only the business that asks', async () => {
    const res = await api.get('/api/backups/export').set('Host', host('acme')).set(tokens.acme!).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const backup = JSON.parse(zlib.gunzipSync(res.body as Buffer).toString());
    expect(backup.tables.Customer.map((c: { name: string }) => c.name)).toEqual(['Acme Buyer']);
    expect(backup.migration).toMatch(/^\d{14}_/);
    expect(backup.tables._inwoice_migrations).toBeUndefined();
  });

  it('finds the business by X-Tenant in development, and 404s unknown addresses', async () => {
    expect((await api.get('/api/customers').set('X-Tenant', 'acme').set(tokens.acme!)).status).toBe(200);
    const unknown = await api.get('/api/customers').set('Host', host('nobody'));
    expect(unknown.status).toBe(404);
    expect((await api.get('/api/platform/info').set('Host', host('nobody'))).body.data.notFound).toBe(true);
  });
});

describe('plans, suspension and the platform admin', () => {
  let acmeId = '';
  let boltId = '';
  const admin = () => ({ Host: BASE, Authorization: `Bearer ${platformToken}` });

  it('signs the platform admin in and lists businesses with usage', async () => {
    await createPlatformAdmin('owner@platform.test', 'platform-pass-1');
    expect((await api.post('/api/platform/admin/login').set('Host', BASE).send({ email: 'owner@platform.test', password: 'nope' })).status).toBe(401);
    platformToken = (await api.post('/api/platform/admin/login').set('Host', BASE).send({ email: 'owner@platform.test', password: 'platform-pass-1' })).body.token;
    const list = (await api.get('/api/platform/admin/tenants').set(admin())).body.data as { id: string; slug: string; usage: { users: number; invoicesThisMonth: number } }[];
    const acme = list.find((t) => t.slug === 'acme')!;
    acmeId = acme.id;
    boltId = list.find((t) => t.slug === 'bolt')!.id;
    expect(acme.usage).toMatchObject({ users: 1, invoicesThisMonth: 1 });
    // Platform tokens don't work inside a business, and business tokens can't use the platform tools.
    expect((await api.get('/api/customers').set('Host', host('acme')).set('Authorization', `Bearer ${platformToken}`)).status).toBe(401);
    expect((await api.get('/api/platform/admin/tenants').set('Host', BASE).set(tokens.acme!)).status).toBe(401);
    expect((await api.get('/api/platform/admin/tenants').set('Host', host('acme')).set('Authorization', `Bearer ${platformToken}`)).status).toBe(404);
  });

  it('enforces the plan user limit', async () => {
    const add = (n: number) =>
      api.post('/api/auth/users').set('Host', host('acme')).set(tokens.acme!).send({ name: `User ${n}`, email: `u${n}@acme.test`, password: 'password123', role: 'SALES' });
    expect((await add(1)).status).toBe(201);
    expect((await add(2)).status).toBe(201);
    const over = await add(3);
    expect(over.status).toBe(402);
    expect(over.body.error).toMatch(/allows 3 active users/);
    await api.patch(`/api/platform/admin/tenants/${acmeId}`).set(admin()).send({ plan: 'GROWTH' });
    forgetTenants();
    expect((await add(3)).status).toBe(201);
  });

  it('makes a suspended business read-only, but sign-in and viewing still work', async () => {
    await api.patch(`/api/platform/admin/tenants/${boltId}`).set(admin()).send({ status: 'SUSPENDED' });
    forgetTenants();
    const write = await api.post('/api/customers').set('Host', host('bolt')).set(tokens.bolt!).send({ name: 'Blocked' });
    expect(write.status).toBe(402);
    expect(write.body.error).toMatch(/suspended/);
    expect((await api.get('/api/customers').set('Host', host('bolt')).set(tokens.bolt!)).status).toBe(200);
    expect((await api.post('/api/auth/login').set('Host', host('bolt')).send({ email: 'bala@bolt.test', password: 'password123' })).status).toBe(200);
    const info = (await api.get('/api/platform/info').set('Host', host('bolt'))).body.data.tenant;
    expect(info).toMatchObject({ state: 'suspended', planLabel: 'Free trial' });
  });

  it('turns read-only when the trial ends, and back when it is paid', async () => {
    await api.patch(`/api/platform/admin/tenants/${boltId}`).set(admin()).send({ status: 'ACTIVE', trialEndsAt: '2020-01-01' });
    forgetTenants();
    const res = await api.post('/api/customers').set('Host', host('bolt')).set(tokens.bolt!).send({ name: 'Blocked' });
    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/free trial has ended/);
    const paid = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await api.patch(`/api/platform/admin/tenants/${boltId}`).set(admin()).send({ plan: 'STARTER', paidUntil: paid });
    forgetTenants();
    expect((await api.post('/api/customers').set('Host', host('bolt')).set(tokens.bolt!).send({ name: 'Paid up' })).status).toBe(201);
  });

  it('serves a business on its own custom domain', async () => {
    await api.patch(`/api/platform/admin/tenants/${acmeId}`).set(admin()).send({ customDomain: 'billing.acme.in' });
    forgetTenants();
    const me = await api.post('/api/auth/login').set('Host', 'billing.acme.in').send({ email: 'asha@acme.test', password: 'password123' });
    expect(me.status).toBe(200);
    expect((await api.patch(`/api/platform/admin/tenants/${boltId}`).set(admin()).send({ customDomain: 'billing.acme.in' })).status).toBe(409);
  });
});

describe('background jobs and existing installs', () => {
  it('runs scheduled work inside each business', async () => {
    const c = (await api.post('/api/customers').set('Host', host('acme')).set(tokens.acme!).send({ name: 'Retainer client' })).body.data;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await api.post('/api/recurring').set('Host', host('acme')).set(tokens.acme!).send({ name: 'Monthly', customerId: c.id, frequency: 'MONTHLY', startDate: iso, items: [{ type: 'CUSTOM', name: 'Retainer', unitPrice: 1000, quantity: 1 }] });
    await tick();
    const acmeInvoices = (await api.get('/api/invoices').set('Host', host('acme')).set(tokens.acme!)).body.data.map((i: { invoiceNumber: string }) => i.invoiceNumber);
    expect(acmeInvoices).toContain('INV-0002');
    const boltInvoices = (await api.get('/api/invoices').set('Host', host('bolt')).set(tokens.bolt!)).body.total;
    expect(boltInvoices).toBe(1);
    expect(await prisma.invoice.count()).toBe(0); // nothing leaked into the original data
  });

  it('adopts the original single-business data as a business, keeping its logins', async () => {
    await adoptPublicSchema('legacy', 'Legacy Shop');
    forgetTenants();
    const t = await login('legacy', 'owner@test.local', 'password123');
    const customers = (await api.get('/api/customers').set('Host', host('legacy')).set(t)).body.data;
    expect(customers.map((c: { name: string }) => c.name)).toEqual(['Legacy Customer']);
    await expect(adoptPublicSchema('legacy2', 'Again')).rejects.toThrow(/already been adopted/);
  });
});
