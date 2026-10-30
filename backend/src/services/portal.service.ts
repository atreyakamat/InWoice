import crypto from 'crypto';
import prisma from '../lib/prisma';
import { notFound } from '../lib/errors';
import { round2 } from '../lib/util';
import { balanceOf, displayStatus } from './invoice.service';
import { quoteDisplayStatus } from './quote.service';
import { getSettings, publicBaseUrl } from './settings.service';
import { upiLink } from './pdf.service';

/**
 * Customer portal: one secret link per customer that shows their invoices, quotes and
 * balance, with PDFs and a UPI pay link. No login. The link can be revoked or replaced
 * at any time from the customer page.
 */

export const newPortalToken = () => crypto.randomBytes(24).toString('base64url');

/** The customer's portal token, created on first use. */
export async function ensurePortalToken(customerId: string) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { portalToken: true } });
  if (!c) throw notFound('Customer');
  if (c.portalToken) return c.portalToken;
  const token = newPortalToken();
  await prisma.customer.updateMany({ where: { id: customerId, portalToken: null }, data: { portalToken: token } });
  return (await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { portalToken: true } })).portalToken!;
}

/** Full portal URL for a customer, or null when this install has no known public address. */
export async function portalUrl(customerId: string, requestOrigin?: string | null) {
  const base = await publicBaseUrl(requestOrigin);
  if (!base) return null;
  return `${base}/portal/${await ensurePortalToken(customerId)}`;
}

export async function customerByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw notFound('Portal link');
  const c = await prisma.customer.findUnique({ where: { portalToken: token } });
  if (!c) throw notFound('Portal link');
  return c;
}

const ISSUED = ['PENDING', 'PARTIAL', 'PAID'];

/** Everything the portal page shows. Only issued documents; drafts and cancelled ones stay private. */
export async function portalData(token: string) {
  const customer = await customerByToken(token);
  const [settings, invoices, quotes] = await Promise.all([
    getSettings(),
    prisma.invoice.findMany({
      where: { customerId: customer.id, status: { in: ISSUED } },
      orderBy: [{ date: 'desc' }, { invoiceNumber: 'desc' }],
      take: 100,
      select: { id: true, invoiceNumber: true, date: true, dueDate: true, grandTotal: true, amountPaid: true, amountCredited: true, status: true },
    }),
    prisma.quote.findMany({
      where: { customerId: customer.id, status: { in: ['SENT', 'ACCEPTED', 'DECLINED', 'CONVERTED'] } },
      orderBy: [{ date: 'desc' }, { quoteNumber: 'desc' }],
      take: 50,
      select: { id: true, quoteNumber: true, date: true, validUntil: true, grandTotal: true, status: true },
    }),
  ]);
  const rows = invoices.map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, date: i.date, dueDate: i.dueDate, grandTotal: i.grandTotal, balance: balanceOf(i), status: displayStatus(i) }));
  const outstanding = round2(rows.reduce((s, r) => s + r.balance, 0));
  const overdue = round2(rows.filter((r) => r.status === 'OVERDUE').reduce((s, r) => s + r.balance, 0));
  return {
    business: {
      name: settings.businessName,
      logoUrl: settings.logoUrl,
      address: settings.address,
      email: settings.email,
      phone: settings.phone,
      gstNumber: settings.gstNumber,
      currency: settings.currency,
      currencySymbol: settings.currencySymbol,
      upiId: settings.upiId,
      bankName: settings.bankName,
      accountNumber: settings.accountNumber,
      ifscCode: settings.ifscCode,
    },
    customer: { name: customer.name },
    outstanding,
    overdue,
    payAllLink: upiLink(settings, outstanding, `${customer.name} account`),
    // Online checkout (YouPI-PG) is set up: the portal shows a "Pay now" button per invoice.
    payOnline: Boolean(settings.youpiEnabled && settings.youpiApiUrl && settings.youpiMerchantId),
    invoices: rows.map((r) => ({ ...r, payLink: r.balance > 0 ? upiLink(settings, r.balance, `Invoice ${r.invoiceNumber}`) : null })),
    quotes: quotes.map((q) => ({ ...q, status: quoteDisplayStatus(q) })),
  };
}
