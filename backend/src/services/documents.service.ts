import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { round2 } from '../lib/util';
import { balanceOf, invoiceInclude, issueInvoice } from './invoice.service';
import { quoteInclude, setQuoteStatus } from './quote.service';
import { customerStatement } from './statement.service';
import { renderInvoicePdf, renderQuotePdf, renderStatementPdf } from './pdf.service';
import { isEmailConfigured, sendMail } from './email.service';
import { portalUrl } from './portal.service';
import { getSettings } from './settings.service';
import type { Period } from './gst.service';

/**
 * Emailing documents to customers. Every email links to the customer's portal when this
 * install has a public address (Settings › Business, or APP_URL), so they can see all
 * their invoices and pay by UPI from one place.
 */

interface SendOpts {
  to?: string;
  subject?: string;
  message?: string;
  requestOrigin?: string | null;
}

const lines = (...xs: (string | null | undefined | false)[]) => xs.filter((x) => x !== null && x !== undefined && x !== false).join('\n');

export async function emailInvoice(id: string, opts: SendOpts = {}) {
  const [inv, settings] = await Promise.all([prisma.invoice.findUnique({ where: { id }, include: invoiceInclude }), getSettings()]);
  if (!inv) throw notFound('Invoice');
  const to = opts.to ?? inv.customer.email;
  if (!to) throw badRequest('Customer has no email address. Add one or enter a recipient.');
  if (inv.status === 'CANCELLED') throw badRequest('Cannot send a cancelled invoice');

  const link = await portalUrl(inv.customerId, opts.requestOrigin);
  const balance = balanceOf(inv);
  const amount = `${settings.currencySymbol}${balance.toFixed(2)}`;
  const text =
    opts.message ??
    lines(
      `Hi ${inv.customer.name},`,
      '',
      `Please find attached invoice ${inv.invoiceNumber}. Amount due: ${amount}${inv.dueDate ? ` by ${inv.dueDate.toDateString()}` : ''}.`,
      settings.upiId ? `You can pay by UPI to ${settings.upiId} (scan the QR code on the invoice).` : '',
      link ? `View all your invoices and pay online: ${link}` : null,
      '',
      settings.thankYouMessage || 'Thank you for your business!',
      settings.businessName,
    );

  // Sending a draft issues it: the customer now has it.
  const issued = inv.status === 'DRAFT' ? await issueInvoice(inv.id) : inv;
  const pdf = await renderInvoicePdf(issued, settings);
  await sendMail({
    to,
    subject: opts.subject ?? `Invoice ${inv.invoiceNumber} from ${settings.businessName}`,
    text,
    attachments: [{ filename: `${inv.invoiceNumber}.pdf`, content: pdf }],
    referenceType: 'INVOICE',
    referenceId: inv.id,
  });
  await prisma.activity.create({
    data: { customerId: inv.customerId, eventType: 'INVOICE_SENT', title: `Invoice ${inv.invoiceNumber} emailed to ${to}`, referenceType: 'INVOICE', referenceId: inv.id },
  });
  return { to };
}

export async function emailQuote(id: string, opts: SendOpts = {}) {
  const [q, settings] = await Promise.all([prisma.quote.findUnique({ where: { id }, include: quoteInclude }), getSettings()]);
  if (!q) throw notFound('Quote');
  const to = opts.to ?? q.customer.email;
  if (!to) throw badRequest('Customer has no email address. Add one or enter a recipient.');
  if (q.status === 'CONVERTED') throw badRequest('This quote has already been converted to an invoice');

  const link = await portalUrl(q.customerId, opts.requestOrigin);
  const total = `${settings.currencySymbol}${q.grandTotal.toFixed(2)}`;
  const text =
    opts.message ??
    lines(
      `Hi ${q.customer.name},`,
      '',
      `Please find attached our quotation ${q.quoteNumber} for ${total}${q.validUntil ? `, valid until ${q.validUntil.toDateString()}` : ''}.`,
      link ? `You can accept it online here: ${link}` : 'Reply to this email to accept it, or if you have any questions.',
      '',
      settings.thankYouMessage || 'Thank you!',
      settings.businessName,
    );
  const pdf = await renderQuotePdf(q, settings);
  await sendMail({
    to,
    subject: opts.subject ?? `Quotation ${q.quoteNumber} from ${settings.businessName}`,
    text,
    attachments: [{ filename: `${q.quoteNumber}.pdf`, content: pdf }],
    referenceType: 'QUOTE',
    referenceId: q.id,
  });
  if (q.status === 'DRAFT') await setQuoteStatus(q.id, 'SENT');
  await prisma.activity.create({
    data: { customerId: q.customerId, eventType: 'QUOTE_SENT', title: `Quote ${q.quoteNumber} emailed to ${to}`, referenceType: 'QUOTE', referenceId: q.id },
  });
  return { to };
}

export async function emailStatement(customerId: string, period: Period, opts: SendOpts = {}) {
  const [st, settings] = await Promise.all([customerStatement(customerId, period), getSettings()]);
  const to = opts.to ?? st.customer.email;
  if (!to) throw badRequest('Customer has no email address. Add one or enter a recipient.');
  const link = await portalUrl(customerId, opts.requestOrigin);
  const cur = settings.currencySymbol;
  const text =
    opts.message ??
    lines(
      `Hi ${st.customer.name},`,
      '',
      `Please find attached your statement of account for ${period.label}.`,
      st.amountDue > 0
        ? `Amount due: ${cur}${st.amountDue.toFixed(2)}${st.overdue > 0 ? ` (of which ${cur}${st.overdue.toFixed(2)} is overdue)` : ''}.`
        : 'Nothing is due at the moment. Thank you!',
      st.amountDue > 0 && settings.upiId ? `You can pay by UPI to ${settings.upiId} or scan the QR code on the statement.` : null,
      link ? `See all your invoices and pay online: ${link}` : null,
      '',
      settings.businessName,
    );
  const pdf = await renderStatementPdf(st, settings);
  await sendMail({
    to,
    subject: opts.subject ?? `Statement of account from ${settings.businessName} (${period.label})`,
    text,
    attachments: [{ filename: `statement-${period.label.replace(/\s+/g, '')}.pdf`, content: pdf }],
    referenceType: 'STATEMENT',
    referenceId: customerId,
  });
  await prisma.activity.create({
    data: { customerId, eventType: 'STATEMENT_SENT', title: `Statement for ${period.label} emailed to ${to}`, referenceType: 'CUSTOMER', referenceId: customerId },
  });
  return { to, amountDue: st.amountDue };
}

/** Last calendar month (server time), e.g. on 1 Nov → 1–31 Oct. */
export function previousMonth(now = new Date()): Period {
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to, label: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}` };
}

/**
 * Monthly statements: once per calendar month, email last month's statement to every
 * customer who still owes money and has an email address. Idempotent per customer.
 */
export async function runMonthlyStatements(now = new Date(), limit = 50) {
  const settings = await getSettings();
  if (!settings.statementsEnabled) return { skipped: 'Monthly statements are switched off', sent: [] as string[], failed: [] as { customer: string; error: string }[] };
  if (!(await isEmailConfigured())) return { skipped: 'Email is not configured', sent: [], failed: [] };
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const owing = await prisma.$queryRaw<{ customerId: string; due: number }[]>`
    SELECT i."customerId", SUM(GREATEST(0, i."grandTotal" - i."amountPaid" - i."amountCredited"))::float AS due
    FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
    WHERE i.status IN ('PENDING','PARTIAL') AND c.email IS NOT NULL
      AND (c."lastStatementAt" IS NULL OR c."lastStatementAt" < ${monthStart})
    GROUP BY i."customerId" HAVING SUM(GREATEST(0, i."grandTotal" - i."amountPaid" - i."amountCredited")) > 0.005
    ORDER BY due DESC LIMIT ${limit}`;
  const period = previousMonth(now);
  const sent: string[] = [];
  const failed: { customer: string; error: string }[] = [];
  for (const o of owing) {
    // Mark first so a crash or slow SMTP never sends twice in a month; failures show in the email log.
    await prisma.customer.update({ where: { id: o.customerId }, data: { lastStatementAt: now } });
    try {
      await emailStatement(o.customerId, period);
      sent.push(o.customerId);
    } catch (err) {
      failed.push({ customer: o.customerId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { skipped: null, sent, failed, total: round2(owing.reduce((s, o) => s + o.due, 0)) };
}
