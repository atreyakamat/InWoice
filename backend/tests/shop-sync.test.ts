import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { runShopSync } from '../src/services/shop-sync.service';

/** A stand-in for the shop's order feed: GET /api/integrations/orders?since=&limit= */
const TOKEN = 'test-sync-token-0123456789abcdefghij';
let orders: Record<string, unknown>[] = [];
const seenSince: string[] = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/api/integrations/orders') return void res.writeHead(404).end();
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return void res.writeHead(401).end();
  const since = url.searchParams.get('since') ?? '';
  seenSince.push(since);
  const limit = Number(url.searchParams.get('limit'));
  const page = orders.filter((o) => String(o.updatedAt) > since).sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt))).slice(0, limit);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ orders: page, next: page.length ? page[page.length - 1].updatedAt : since, hasMore: page.length === limit }));
});

const order = (number: string, over: Record<string, unknown> = {}) => ({
  id: number,
  number,
  status: 'confirmed',
  customerName: 'Asha Naik',
  customerPhone: '9876543210',
  fulfilment: 'delivery',
  address: { line: '12 Rua de Ourem, Fontainhas', city: 'Panaji', state: 'Goa', pincode: '403001' },
  customerNote: '',
  lines: [
    { name: 'Lo-fi 03', options: [], custom: [], unitPricePaise: 1000, qty: 5, lineTotalPaise: 5000 },
    { name: 'Poster', options: ['Size: A3'], custom: [], unitPricePaise: 10000, qty: 1, lineTotalPaise: 10000 },
  ],
  subtotalPaise: 15000,
  discountPaise: 1000,
  totalPaise: 14000,
  offers: [{ offerId: 'o1', name: 'Buy 4 stickers, get 1 free', freeUnits: 1, discountPaise: 1000 }],
  adminNote: '',
  pageUrl: `https://shop.example/order/${number}?k=abc`,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000000+00:00',
  ...over,
});

let auth: Record<string, string>;

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('shop sync', () => {
  it('is off until set up, and keeps the token secret', async () => {
    expect((await runShopSync()).skipped).toBe('Shop sync is switched off');
    const bad = await api.put('/api/settings').set(auth).send({ shopUrl: 'http://shop.example' });
    expect(bad.status).toBe(400);
    const { port } = server.address() as AddressInfo;
    const res = await api.put('/api/settings').set(auth).send({ shopSyncEnabled: true, shopUrl: `http://127.0.0.1:${port}/admin`, shopSyncToken: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.data.shopUrl).toBe(`http://127.0.0.1:${port}`);
    expect(res.body.data.shopSyncTokenSet).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it('ignores orders until they are confirmed, so spam uses no invoice numbers', async () => {
    orders = [order('SNV-SPAM01', { status: 'new', customerPhone: '9111111111' }), order('SNV-SPAM02', { status: 'new' })];
    const before = (await prisma.businessSettings.findFirstOrThrow()).nextInvoiceNumber;
    const r = await runShopSync();
    expect(r).toMatchObject({ created: [], updated: [], failed: [] });
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.customer.count()).toBe(0);
    expect((await prisma.businessSettings.findFirstOrThrow()).nextInvoiceNumber).toBe(before);
  });

  it('turns a confirmed order into a customer and an issued invoice', async () => {
    orders = [order('SNV-AAAAA1', { status: 'new' })];
    await runShopSync();
    orders = [order('SNV-AAAAA1', { updatedAt: '2026-10-20T11:00:00.000000+00:00' })];
    const r = (await api.post('/api/settings/shop-sync/run').set(auth)).body.data;
    expect(r).toMatchObject({ skipped: null, created: ['SNV-AAAAA1'], failed: [] });

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { shopOrderRef: 'SNV-AAAAA1' }, include: { items: true, customer: true } });
    expect(inv.status).toBe('PENDING');
    expect(inv.subtotal).toBe(150);
    expect(inv.discount).toBe(10);
    expect(inv.taxAmount).toBe(0);
    expect(inv.grandTotal).toBe(140);
    expect(inv.items.map((i) => i.name)).toEqual(['Lo-fi 03', 'Poster (Size: A3)']);
    expect(inv.notes).toContain('Deliver to: 12 Rua de Ourem, Fontainhas, Panaji, Goa, 403001');
    expect(inv.notes).toContain('Offers: Buy 4 stickers, get 1 free');
    expect(inv.customer).toMatchObject({ name: 'Asha Naik', phone: '9876543210', city: 'Panaji', state: 'Goa' });
    expect(await prisma.activity.count({ where: { customerId: inv.customerId, eventType: 'SHOP_ORDER' } })).toBe(1);

    // Running again with nothing new changes nothing, and asks from the cursor...
    const again = await runShopSync();
    expect(again).toMatchObject({ created: [], updated: [] });
    // ...looking back 5 minutes in case a late write carries an earlier time.
    expect(seenSince.at(-1)).toBe('2026-10-20T10:55:00.000Z');
  });

  it('matches returning customers by phone however it was typed', async () => {
    const existing = (await api.post('/api/customers').set(auth).send({ name: 'Rohan', phone: '+91 91234 56780', city: 'Margao' })).body.data;
    orders.push(order('SNV-BBBBB2', { customerName: 'Rohan D', customerPhone: '9123456780', fulfilment: 'pickup', address: {}, updatedAt: '2026-10-21T09:00:00.000Z' }));
    const r = await runShopSync();
    expect(r.created).toEqual(['SNV-BBBBB2']);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { shopOrderRef: 'SNV-BBBBB2' }, include: { customer: true } });
    expect(inv.customerId).toBe(existing.id);
    expect(inv.customer.name).toBe('Rohan'); // edits in InWoice win
    expect(inv.customer.city).toBe('Margao');
    expect(inv.notes).toContain('Pickup at a stall');
  });

  it('follows the order: paid records the payment, cancelled cancels', async () => {
    let inv = await prisma.invoice.findUniqueOrThrow({ where: { shopOrderRef: 'SNV-AAAAA1' } });
    expect(inv.status).toBe('PENDING');

    orders[0] = { ...orders[0], status: 'paid', updatedAt: '2026-10-22T09:00:00.000Z' };
    expect((await runShopSync()).updated).toEqual(['SNV-AAAAA1']);
    inv = await prisma.invoice.findUniqueOrThrow({ where: { shopOrderRef: 'SNV-AAAAA1' }, include: { payments: true } });
    expect(inv.status).toBe('PAID');
    expect(inv.payments).toMatchObject([{ amount: 140, paymentMethod: 'UPI', referenceId: 'SNV-AAAAA1' }]);

    // Shipped after paid: nothing more to do.
    orders[0] = { ...orders[0], status: 'shipped', updatedAt: '2026-10-22T10:00:00.000Z' };
    expect((await runShopSync()).updated).toEqual([]);

    // Cancelled while unpaid: the invoice is cancelled. Cancelled before InWoice saw it: no invoice.
    orders[1] = { ...orders[1], status: 'cancelled', updatedAt: '2026-10-22T11:00:00.000Z' };
    orders.push(order('SNV-CCCCC3', { status: 'cancelled', updatedAt: '2026-10-22T12:00:00.000Z' }));
    const r = await runShopSync();
    expect(r.updated).toEqual(['SNV-BBBBB2']);
    expect(r.created).toEqual([]);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { shopOrderRef: 'SNV-BBBBB2' } })).status).toBe('CANCELLED');
    expect(await prisma.invoice.count({ where: { shopOrderRef: 'SNV-CCCCC3' } })).toBe(0);
  });

  it('reads many orders across pages', async () => {
    for (let i = 0; i < 105; i++) {
      orders.push(order(`SNV-P${String(i).padStart(5, '0')}`, { customerPhone: '9000000001', updatedAt: `2026-10-23T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z` }));
    }
    const r = await runShopSync();
    expect(r.created).toHaveLength(105);
    expect(await prisma.customer.count({ where: { phone: '9000000001' } })).toBe(1);
  });

  it('still picks up a change saved a little late with an earlier time', async () => {
    orders.push(order('SNV-LATE01', { updatedAt: '2026-10-23T09:59:00.000Z' })); // cursor is 10:01:44
    expect((await runShopSync()).created).toEqual(['SNV-LATE01']);
  });

  it('rejects oversized or hostile orders and never follows redirects', async () => {
    const huge = order('SNV-HUGE01', { customerName: 'x'.repeat(5000), updatedAt: '2026-10-24T00:00:00.000Z' });
    orders.push(huge);
    const r = await runShopSync();
    expect(r.created).toEqual([]);
    expect(r.failed).toEqual([{ order: 'SNV-HUGE01', error: 'Unexpected order format' }]);

    // A redirect could hand the token to another server: refuse to follow it.
    const seen: RequestInit[] = [];
    const fake = (async (_url: URL, init: RequestInit) => {
      seen.push(init);
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    await runShopSync({ fetchImpl: fake });
    expect(seen[0].redirect).toBe('error');
  });

  it('reports a wrong token and keeps its place', async () => {
    const before = (await prisma.businessSettings.findFirstOrThrow()).shopSyncCursor;
    await api.put('/api/settings').set(auth).send({ shopSyncToken: 'wrong-token' });
    const r = await runShopSync();
    expect(r.failed[0].error).toContain('rejected the sync token');
    const s = await prisma.businessSettings.findFirstOrThrow();
    expect(s.shopSyncCursor).toBe(before);
    expect(s.shopSyncLastError).toContain('rejected the sync token');
  });
});
