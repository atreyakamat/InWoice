import QRCode from 'qrcode';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { optStr, round2 } from '../lib/util';
import { addPayment, createInvoice, invoiceInclude, invoiceItemInput, withDerived } from './invoice.service';
import { upiLink } from './pdf.service';
import { createCheckout, youpiConfig } from './youpi.service';
import { getSettings } from './settings.service';

/**
 * Point of sale: quick counter billing for a stall, shop or pop-up event. A sale is an
 * ordinary issued invoice (source POS, due today), so stock, GST reports and accounts all
 * see it. Payment is taken in the same step: cash (with change), card, UPI to your own UPI ID
 * (the cashier confirms they saw it), online through YouPI, or "pay later" on account.
 */

export const WALK_IN = 'Walk-in customer';

export const saleInput = z.object({
  customerId: z.string().uuid().optional(),
  // A name/phone typed at the counter: an existing customer with that phone is reused.
  customerName: optStr,
  customerPhone: optStr,
  items: z.array(invoiceItemInput).min(1, 'Add at least one item'),
  discount: z.coerce.number().min(0).default(0),
  method: z.enum(['CASH', 'CARD', 'UPI', 'ONLINE', 'LATER']),
  tendered: z.coerce.number().min(0).optional(), // cash handed over, to work out the change
  reference: optStr, // card slip / UPI transaction number
  notes: optStr,
});

async function counterCustomer(input: z.infer<typeof saleInput>) {
  if (input.customerId) return input.customerId;
  const phone = input.customerPhone?.replace(/[^\d+]/g, '') || null;
  if (phone) {
    // Match on the last 10 digits, ignoring spaces, dashes and +91 however they were typed.
    const last10 = phone.replace(/\D/g, '').slice(-10);
    const [existing] = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Customer" WHERE right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${last10} ORDER BY "createdAt" LIMIT 1`;
    if (existing) return existing.id;
  }
  const settings = await getSettings();
  if (input.customerName || phone) {
    const c = await prisma.customer.create({ data: { name: input.customerName || `Customer ${phone}`, phone, state: settings.state, segment: 'POS' } });
    return c.id;
  }
  const walkIn = await prisma.customer.findFirst({ where: { name: WALK_IN, segment: 'WALK_IN' }, select: { id: true } });
  if (walkIn) return walkIn.id;
  return (await prisma.customer.create({ data: { name: WALK_IN, segment: 'WALK_IN', state: settings.state, notes: 'Counter sales without a named customer' } })).id;
}

export async function recordSale(input: z.infer<typeof saleInput>, requestOrigin?: string | null) {
  const settings = await getSettings();
  if (input.method === 'ONLINE' && !youpiConfig(settings)) throw badRequest('Online payment is not set up (Settings › Payments)');
  const customerId = await counterCustomer(input);
  if (input.method === 'LATER') {
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    if (c.segment === 'WALK_IN') throw badRequest('Pay later needs a named customer, so you know who owes it');
  }
  const today = new Date();
  const inv = await createInvoice(
    { customerId, items: input.items, discount: input.discount, shippingCost: 0, date: today, dueDate: today, placeOfSupply: undefined, notes: input.notes, issue: true },
    { source: 'POS' },
  );
  const total = inv.grandTotal;
  if (input.method === 'CASH' && input.tendered !== undefined && input.tendered + 0.005 < total) {
    // Too little cash: keep the sale but leave it unpaid, so nothing is lost.
    throw badRequest(`Cash given (${input.tendered.toFixed(2)}) is less than the total (${total.toFixed(2)}). Invoice ${inv.invoiceNumber} was saved unpaid.`);
  }
  let invoice = inv;
  let checkoutUrl: string | null = null;
  if (input.method === 'CASH' || input.method === 'CARD' || input.method === 'UPI') {
    invoice = await addPayment(inv.id, { amount: total, tdsAmount: 0, paymentMethod: input.method, paymentDate: today, referenceId: input.reference ?? undefined, notes: 'Counter sale' });
  } else if (input.method === 'ONLINE') {
    checkoutUrl = (await createCheckout(inv.id, { returnUrl: requestOrigin ? `${requestOrigin}/pos` : undefined })).checkoutUrl;
  }
  return {
    invoice: withDerived(invoice),
    change: input.method === 'CASH' && input.tendered !== undefined ? round2(input.tendered - total) : 0,
    checkoutUrl,
  };
}

/** A UPI QR for an amount, to your own UPI ID (shown on the till before you confirm). */
export async function upiQr(amount: number, note: string) {
  const link = upiLink(await getSettings(), round2(amount), note);
  if (!link) throw badRequest('Add your UPI ID in Settings › Payments to take UPI at the counter');
  return { link, dataUrl: await QRCode.toDataURL(link, { margin: 1, width: 280 }) };
}

/** Everything the till needs in one request: items with stock, packs, and how you can take payment. */
export async function catalog() {
  const [products, packs, settings] = await Promise.all([
    prisma.product.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, sku: true, category: true, price: true, unit: true, minCharge: true, taxRate: true, stock: true, imageUrl: true }, orderBy: { name: 'asc' }, take: 1000 }),
    prisma.pack.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, price: true, taxRate: true, imageUrl: true }, orderBy: { name: 'asc' }, take: 300 }),
    getSettings(),
  ]);
  return {
    products,
    packs,
    defaultTaxRate: settings.defaultTaxRate,
    upiId: settings.upiId,
    online: Boolean(youpiConfig(settings)),
  };
}

/** The day's counter takings, by payment method (for cashing up). */
export async function daySummary(day = new Date()) {
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  const [sales, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { source: 'POS', status: { not: 'CANCELLED' }, date: { gte: from, lt: to } }, select: { grandTotal: true, amountPaid: true, amountCredited: true } }),
    prisma.payment.findMany({ where: { paymentDate: { gte: from, lt: to }, invoice: { source: 'POS' } }, select: { amount: true, paymentMethod: true } }),
  ]);
  const byMethod: Record<string, number> = {};
  for (const p of payments) byMethod[p.paymentMethod] = round2((byMethod[p.paymentMethod] ?? 0) + p.amount);
  return {
    date: from,
    sales: sales.length,
    total: round2(sales.reduce((s, i) => s + i.grandTotal, 0)),
    unpaid: round2(sales.reduce((s, i) => s + Math.max(0, i.grandTotal - i.amountPaid - i.amountCredited), 0)),
    byMethod,
  };
}

export async function receipt(id: string) {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
  return withDerived(inv);
}
