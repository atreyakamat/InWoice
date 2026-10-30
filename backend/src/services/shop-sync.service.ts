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
 * - Invoice: made once the order is confirmed in the shop (shopOrderRef = SNV-…) and
 *   issued straight away; paid/shipped/done records the payment; cancelled
 *   cancels it while it has no payments. Cancelled after payment is flagged for you to
 *   refund and credit (Settings › Shop and the customer's activity). Issued invoices are
 *   never rewritten.
 * Shop prices are final prices. With a shop GST rate set, the tax is worked back out of
 * them, so the invoice still totals what the customer paid.
 */

const PAGE = 100;
const LOOK_BACK_MS = 5 * 60 * 1000;
const lookBack = (iso: string) => (Number.isNaN(Date.parse(iso)) ? iso : new Date(Date.parse(iso) - LOOK_BACK_MS).toISOString());
const MAX_FEED_CHARS = 5_000_000;
const MAX_PAGES = 20;

// Caps keep a broken or hostile feed from writing huge rows; real orders are far smaller.
const text = (max: number) => z.string().max(max);
const MAX_PAISE = 1_00_00_000_00; // ₹1 crore

const line = z.object({
  name: text(200),
  options: z.array(text(120)).max(20).default([]),
  unitPricePaise: z.number().int().min(0).max(MAX_PAISE),
  qty: z.number().int().positive().max(10_000),
});

export const shopOrder = z.object({
  number: z.string().regex(/^[A-Z]+-[A-Z0-9]+$/),
  status: z.enum(['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled']),
  customerName: text(120).default(''),
  customerPhone: text(30).default(''),
  fulfilment: z.enum(['delivery', 'pickup']).default('delivery'),
  address: z.object({ line: text(300), city: text(80), state: text(80), pincode: text(12) }).partial().default({}),
  customerNote: text(1000).default(''),
  lines: z.array(line).min(1).max(200),
  discountPaise: z.number().int().min(0).max(MAX_PAISE).default(0),
  totalPaise: z.number().int().min(0).max(MAX_PAISE),
  offers: z.array(z.object({ name: text(120) })).max(20).default([]),
  pageUrl: text(300).nullable().optional(),
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

export type ShopGst = { rate: number; hsnCode: string | null };
const NO_GST: ShopGst = { rate: 0, hsnCode: null };

export function invoiceLines(o: ShopOrder, gst: ShopGst = NO_GST) {
  return o.lines.map((l) => ({
    type: 'CUSTOM' as const,
    itemId: null,
    hsnCode: gst.hsnCode,
    name: l.options.length ? `${l.name} (${l.options.join(', ')})` : l.name,
    quantity: l.qty,
    unitPrice: gst.rate > 0 ? round2(rupees(l.unitPricePaise) / (1 + gst.rate / 100)) : rupees(l.unitPricePaise),
    taxRate: gst.rate,
  }));
}

/**
 * The (pre-tax) discount that makes the invoice total exactly what the shop charged.
 * Prices are rounded to paise once the GST is taken out, so the plain conversion can be a
 * few paise off; this tries the neighbouring values using the same sums as createInvoice.
 */
export function invoiceDiscount(o: ShopOrder, gst: ShopGst = NO_GST) {
  if (gst.rate <= 0) return rupees(o.discountPaise);
  const totals = invoiceLines(o, gst).map((l) => round2(l.quantity * l.unitPrice));
  const subtotal = round2(totals.reduce((a, t) => a + t, 0));
  const target = rupees(o.totalPaise);
  const guess = round2(subtotal - target / (1 + gst.rate / 100));
  const grand = (d: number) => {
    const ratio = subtotal > 0 ? (subtotal - d) / subtotal : 0;
    return round2(subtotal - d + round2(totals.reduce((a, t) => a + round2(t * ratio * (gst.rate / 100)), 0)));
  };
  for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
    const d = round2(guess + step / 100);
    if (d >= 0 && d <= subtotal && Math.abs(grand(d) - target) < 0.005) return d;
  }
  return Math.min(Math.max(guess, 0), subtotal);
}

export function invoiceNotes(o: ShopOrder, gst: ShopGst = NO_GST) {
  const where =
    o.fulfilment === 'pickup' ? 'Pickup at a stall' : `Deliver to: ${[o.address.line, o.address.city, o.address.state, o.address.pincode].filter(Boolean).join(', ')}`;
  return [
    `Shop order ${o.number}`,
    where,
    o.offers.length ? `Offers: ${o.offers.map((x) => x.name).join('; ')}` : '',
    o.customerNote ? `Customer note: ${o.customerNote}` : '',
    o.pageUrl ? `Order page: ${o.pageUrl}` : '',
    gst.rate > 0 ? `Shop prices include GST at ${gst.rate}%` : '',
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
export async function applyShopOrder(o: ShopOrder): Promise<'created' | 'updated' | 'unchanged' | 'skipped' | 'attention'> {
  let inv = await prisma.invoice.findUnique({ where: { shopOrderRef: o.number } });

  if (!inv) {
    // Anyone can place a shop order, so nothing is made until you confirm it in the shop:
    // spam never adds customers or uses up invoice numbers (GST needs an unbroken series).
    // A confirmed order shows up in the feed again because its updatedAt changes.
    if (o.status === 'new' || o.status === 'cancelled') return 'skipped';
    const customer = await upsertCustomer(o);
    const settings = await getSettings();
    const gst: ShopGst = { rate: settings.shopGstRate, hsnCode: settings.shopHsnCode };
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
        // GST place of supply: where it's delivered to, or your own state for a stall pickup.
        placeOfSupply: (o.fulfilment === 'pickup' ? settings.state : o.address.state) || null,
        discount: invoiceDiscount(o, gst),
        shippingCost: 0,
        notes: invoiceNotes(o, gst),
        items: invoiceLines(o, gst),
      },
      { source: 'SHOP', shopOrderRef: o.number },
    );
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: created.id } });
    await followStatus(inv.id, o);
    return 'created';
  }
  const r = await followStatus(inv.id, o);
  return r === true ? 'updated' : r === false ? 'unchanged' : r;
}

export const CANCELLED_AFTER_PAYMENT = 'SHOP_CANCELLED_PAID';

/** Move the invoice along with the order's status. Returns true if anything changed. */
async function followStatus(invoiceId: string, o: ShopOrder): Promise<boolean | 'attention'> {
  let inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status === 'CANCELLED') return false;
  if (o.status === 'cancelled') {
    if (inv.amountPaid <= 0) {
      await cancelInvoice(inv.id);
      return true;
    }
    // Money was taken, so the invoice can't just be cancelled: flag it (once) for a refund
    // and a credit note. It stays listed in Settings › Shop until that's done.
    const seen = await prisma.activity.findFirst({ where: { eventType: CANCELLED_AFTER_PAYMENT, referenceId: o.number }, select: { id: true } });
    if (seen) return false;
    await prisma.activity.create({
      data: {
        customerId: inv.customerId,
        eventType: CANCELLED_AFTER_PAYMENT,
        title: `Shop order ${o.number} was cancelled after payment`,
        description: `Invoice ${inv.invoiceNumber} still shows ₹${inv.amountPaid.toFixed(2)} paid. Refund the customer and issue a credit note.`,
        referenceType: 'SHOP_ORDER',
        referenceId: o.number,
      },
    });
    return 'attention';
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

export type ShopSyncResult = {
  skipped: string | null;
  created: string[];
  updated: string[];
  /** Orders cancelled in the shop after they were paid: refund and credit them. */
  attention: string[];
  failed: { order: string; error: string }[];
};

/** A failed run in words the owner can act on (fetch's own errors are just "fetch failed"). */
function why(err: unknown, shopUrl: string) {
  if (!(err instanceof Error)) return String(err);
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return `The shop at ${shopUrl} took too long to answer. Try again in a few minutes.`;
  if (err instanceof SyntaxError || err instanceof z.ZodError) return `The address ${shopUrl} didn't answer with an order feed. Check the shop address.`;
  if (err instanceof TypeError && err.message === 'fetch failed') {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    if (/redirect/i.test(cause?.message ?? '')) return `The shop address ${shopUrl} redirects somewhere else. Enter the final address (as it shows in the browser).`;
    return `Couldn't reach the shop at ${shopUrl}${cause?.code ? ` (${cause.code})` : ''}. Check the address and that the shop is online.`;
  }
  return err.message;
}

/** Shop orders cancelled after payment whose money hasn't been credited back yet. */
export async function shopOrdersNeedingAttention() {
  const flagged = await prisma.activity.findMany({ where: { eventType: CANCELLED_AFTER_PAYMENT }, select: { referenceId: true } });
  const refs = flagged.map((f) => f.referenceId).filter((r): r is string => Boolean(r));
  if (!refs.length) return [];
  const invoices = await prisma.invoice.findMany({
    where: { shopOrderRef: { in: refs }, status: { not: 'CANCELLED' } },
    select: { id: true, invoiceNumber: true, shopOrderRef: true, amountPaid: true, amountCredited: true, customer: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return invoices
    .filter((i) => round2(i.amountPaid - i.amountCredited) > 0.005)
    .map((i) => ({ order: i.shopOrderRef!, invoiceId: i.id, invoiceNumber: i.invoiceNumber, customer: i.customer.name, toRefund: round2(i.amountPaid - i.amountCredited) }));
}

/**
 * One sync run. Orders are read oldest change first; the cursor only moves past an order
 * once it's in, so a failure is retried next run (and shown in Settings) instead of lost.
 */
export async function runShopSync(opts: { force?: boolean; fetchImpl?: typeof fetch } = {}): Promise<ShopSyncResult> {
  const out: ShopSyncResult = { skipped: null, created: [], updated: [], attention: [], failed: [] };
  const s = await getSettings();
  if (!s.shopSyncEnabled && !opts.force) return { ...out, skipped: 'Shop sync is switched off' };
  if (!s.shopUrl || !s.shopSyncToken) return { ...out, skipped: 'Add the shop address and sync token first' };

  const doFetch = opts.fetchImpl ?? fetch;
  let cursor = s.shopSyncCursor ?? '';
  let error: string | null = null;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL('/api/integrations/orders', s.shopUrl);
      // The first page looks back a few minutes: the shop stamps updatedAt from its own
      // servers, so a change saved a moment late could carry a time just before the
      // cursor. Orders seen twice are harmless (applyShopOrder is idempotent).
      const since = page === 0 && cursor ? lookBack(cursor) : cursor;
      if (since) url.searchParams.set('since', since);
      url.searchParams.set('limit', String(PAGE));
      // redirect: 'error' so the token is never sent on to another address.
      const res = await doFetch(url, {
        headers: { Authorization: `Bearer ${s.shopSyncToken}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 401) throw new Error('The shop rejected the sync token. Check it matches INWOICE_SYNC_TOKEN on the shop.');
      if (res.status === 404) throw new Error('The shop has no order feed at that address (is INWOICE_SYNC_TOKEN set on the shop?)');
      if (!res.ok) throw new Error(`The shop answered ${res.status}`);
      const raw = await res.text();
      if (raw.length > MAX_FEED_CHARS) throw new Error('The shop sent more data than expected');
      const body = feed.parse(JSON.parse(raw));

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
        if (result === 'attention') out.attention.push(o.number);
        cursor = o.updatedAt;
        await prisma.businessSettings.update({ where: { id: s.id }, data: { shopSyncCursor: cursor } });
      }
      if (!body.hasMore) break;
      cursor = body.next;
    }
  } catch (err) {
    error = why(err, s.shopUrl);
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
