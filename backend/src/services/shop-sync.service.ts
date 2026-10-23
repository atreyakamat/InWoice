import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { round2 } from '../lib/util';
import { getSettings } from './settings.service';
import { addPayment, cancelInvoice, createInvoice, issueInvoice } from './invoice.service';

/**
 * Pulls orders from the online shop (Stix N Vibes shop: GET /api/integrations/orders) and
 * turns them into customers and invoices. The shop never calls in, so InWoice can live on
 * a home server that goes off now and then: each run carries on from the last order read.
 *
 * - Customer: matched by mobile number (last 10 digits), created if new. Only blank
 *   fields are filled in, so edits made in InWoice are kept.
 * - Invoice: a draft per order (shopOrderRef = SNV-…). When the shop marks the order
 *   confirmed/shipped it's issued; paid/shipped/done records the payment; cancelled
 *   cancels it while it has no payments. Issued invoices are never rewritten.
 * Shop prices are final prices, so lines carry no GST.
 */

const PAGE = 100;
const MAX_PAGES = 20;

const line = z.object({
  name: z.string(),
  options: z.array(z.string()).default([]),
  unitPricePaise: z.number().int().min(0),
  qty: z.number().int().positive(),
});

export const shopOrder = z.object({
  number: z.string().regex(/^[A-Z]+-[A-Z0-9]+$/),
  status: z.enum(['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled']),
  customerName: z.string().default(''),
  customerPhone: z.string().default(''),
  fulfilment: z.enum(['delivery', 'pickup']).default('delivery'),
  address: z.object({ line: z.string(), city: z.string(), state: z.string(), pincode: z.string() }).partial().default({}),
  customerNote: z.string().default(''),
  lines: z.array(line).min(1),
  discountPaise: z.number().int().min(0).default(0),
  totalPaise: z.number().int().min(0),
  offers: z.array(z.object({ name: z.string() })).default([]),
  pageUrl: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ShopOrder = z.infer<typeof shopOrder>;

const feed = z.object({ orders: z.array(z.unknown()), next: z.string(), hasMore: z.boolean() });

const ISSUED_FROM = new Set(['confirmed', 'paid', 'shipped', 'done']);
const PAID_FROM = new Set(['paid', 'shipped', 'done']);

/** Indian mobile number as 10 digits, or null. */
export function mobile10(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

const rupees = (paise: number) => round2(paise / 100);

export function invoiceLines(o: ShopOrder) {
  return o.lines.map((l) => ({
    type: 'CUSTOM' as const,
    itemId: null,
    hsnCode: null,
    name: l.options.length ? `${l.name} (${l.options.join(', ')})` : l.name,
    quantity: l.qty,
    unitPrice: rupees(l.unitPricePaise),
    taxRate: 0,
  }));
}

export function invoiceNotes(o: ShopOrder) {
  const where =
    o.fulfilment === 'pickup' ? 'Pickup at a stall' : `Deliver to: ${[o.address.line, o.address.city, o.address.state, o.address.pincode].filter(Boolean).join(', ')}`;
  return [
    `Shop order ${o.number}`,
    where,
    o.offers.length ? `Offers: ${o.offers.map((x) => x.name).join('; ')}` : '',
    o.customerNote ? `Customer note: ${o.customerNote}` : '',
    o.pageUrl ? `Order page: ${o.pageUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function upsertCustomer(o: ShopOrder) {
  const phone = mobile10(o.customerPhone);
  const name = o.customerName.trim() || (phone ? `Shop customer ${phone}` : `Shop customer ${o.number}`);
  const delivery = o.fulfilment === 'delivery';
  const addr = delivery ? [o.address.line, o.address.pincode].filter(Boolean).join(', ') || null : null;
  const city = delivery ? o.address.city || null : null;
  const state = delivery ? o.address.state || null : null;

  if (phone) {
    // Phones are free text in InWoice ("+91 98765 43210", "919876543210"...), so narrow
    // by the last four digits in SQL and compare the normalised number here.
    const candidates = await prisma.customer.findMany({ where: { phone: { contains: phone.slice(-4) } }, orderBy: { createdAt: 'asc' } });
    const found = candidates.find((c) => mobile10(c.phone) === phone);
    if (found) {
      const fill: Record<string, string> = {};
      if (!found.address && addr) fill.address = addr;
      if (!found.city && city) fill.city = city;
      if (!found.state && state) fill.state = state;
      return Object.keys(fill).length ? prisma.customer.update({ where: { id: found.id }, data: fill }) : found;
    }
  }
  return prisma.customer.create({
    data: { name, phone, address: addr, city, state, notes: 'Added from the online shop', segment: 'New' },
  });
}

/** Bring one order into InWoice. Safe to run again for the same order. */
export async function applyShopOrder(o: ShopOrder): Promise<'created' | 'updated' | 'unchanged' | 'skipped'> {
  let inv = await prisma.invoice.findUnique({ where: { shopOrderRef: o.number } });

  if (!inv) {
    // An order cancelled before InWoice saw it needs no invoice.
    if (o.status === 'cancelled') return 'skipped';
    const customer = await upsertCustomer(o);
    await prisma.activity.create({
      data: {
        customerId: customer.id,
        eventType: 'SHOP_ORDER',
        title: `Shop order ${o.number} (₹${rupees(o.totalPaise).toFixed(2)})`,
        description: o.fulfilment === 'pickup' ? 'Pickup at a stall' : 'Delivery',
        referenceType: 'SHOP_ORDER',
        referenceId: o.number,
      },
    });
    const created = await createInvoice(
      {
        customerId: customer.id,
        date: new Date(o.createdAt),
        dueDate: new Date(o.createdAt), // shop orders are paid before they're sent
        placeOfSupply: null,
        discount: rupees(o.discountPaise),
        shippingCost: 0,
        notes: invoiceNotes(o),
        items: invoiceLines(o),
      },
      { shopOrderRef: o.number },
    );
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: created.id } });
    await followStatus(inv.id, o);
    return 'created';
  }
  return (await followStatus(inv.id, o)) ? 'updated' : 'unchanged';
}

/** Move the invoice along with the order's status. Returns true if anything changed. */
async function followStatus(invoiceId: string, o: ShopOrder): Promise<boolean> {
  let inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status === 'CANCELLED') return false;
  if (o.status === 'cancelled') {
    if (inv.amountPaid > 0) return false; // money was taken: sort it out by hand (credit note)
    await cancelInvoice(inv.id);
    return true;
  }
  let changed = false;
  if (inv.status === 'DRAFT' && ISSUED_FROM.has(o.status)) {
    inv = await issueInvoice(inv.id);
    changed = true;
  }
  const due = round2(inv.grandTotal - inv.amountPaid - inv.amountCredited);
  if (PAID_FROM.has(o.status) && due > 0.005) {
    await addPayment(inv.id, {
      amount: due,
      tdsAmount: 0,
      paymentMethod: 'UPI',
      paymentDate: new Date(o.updatedAt),
      referenceId: o.number,
      notes: 'Marked paid in the online shop',
    });
    changed = true;
  }
  return changed;
}

export type ShopSyncResult = { skipped: string | null; created: string[]; updated: string[]; failed: { order: string; error: string }[] };

const why = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * One sync run. Orders are read oldest change first; the cursor only moves past an order
 * once it's in, so a failure is retried next run (and shown in Settings) instead of lost.
 */
export async function runShopSync(opts: { force?: boolean; fetchImpl?: typeof fetch } = {}): Promise<ShopSyncResult> {
  const out: ShopSyncResult = { skipped: null, created: [], updated: [], failed: [] };
  const s = await getSettings();
  if (!s.shopSyncEnabled && !opts.force) return { ...out, skipped: 'Shop sync is switched off' };
  if (!s.shopUrl || !s.shopSyncToken) return { ...out, skipped: 'Add the shop address and sync token first' };

  const doFetch = opts.fetchImpl ?? fetch;
  let cursor = s.shopSyncCursor ?? '';
  let error: string | null = null;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL('/api/integrations/orders', s.shopUrl);
      if (cursor) url.searchParams.set('since', cursor);
      url.searchParams.set('limit', String(PAGE));
      const res = await doFetch(url, { headers: { Authorization: `Bearer ${s.shopSyncToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 401) throw new Error('The shop rejected the sync token. Check it matches INWOICE_SYNC_TOKEN on the shop.');
      if (res.status === 404) throw new Error('The shop has no order feed at that address (is INWOICE_SYNC_TOKEN set on the shop?)');
      if (!res.ok) throw new Error(`The shop answered ${res.status}`);
      const body = feed.parse(await res.json());

      for (const raw of body.orders) {
        const parsed = shopOrder.safeParse(raw);
        const ref = (raw as { number?: unknown })?.number;
        if (!parsed.success) {
          // A malformed order can't be fixed by retrying; note it and move on.
          out.failed.push({ order: typeof ref === 'string' ? ref : '?', error: 'Unexpected order format' });
          const at = (raw as { updatedAt?: unknown })?.updatedAt;
          if (typeof at === 'string') cursor = at;
          continue;
        }
        const o = parsed.data;
        const result = await applyShopOrder(o);
        if (result === 'created') out.created.push(o.number);
        if (result === 'updated') out.updated.push(o.number);
        cursor = o.updatedAt;
        await prisma.businessSettings.update({ where: { id: s.id }, data: { shopSyncCursor: cursor } });
      }
      if (!body.hasMore) break;
      cursor = body.next;
    }
  } catch (err) {
    error = why(err);
    out.failed.push({ order: '', error });
  }
  await prisma.businessSettings.update({
    where: { id: s.id },
    data: { shopSyncCursor: cursor || null, shopSyncLastAt: new Date(), shopSyncLastError: error ?? (out.failed.length ? out.failed.map((f) => `${f.order}: ${f.error}`).join('; ') : null) },
  });
  return out;
}

/** Validate the shop address typed into Settings. */
export function shopUrlOrNull(v: string | null | undefined) {
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    throw badRequest('Enter the shop address, e.g. https://shop.stixnvibes.com');
  }
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw badRequest('The shop address must start with https://');
  return u.origin;
}
