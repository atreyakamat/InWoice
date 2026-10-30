import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { dayText, moneyText, round2 } from '../lib/util';
import { balanceOf, invoiceInclude, issueInvoice } from './invoice.service';
import { quoteInclude, setQuoteStatus } from './quote.service';
import { customerStatement } from './statement.service';
import { renderInvoicePdf, renderQuotePdf, renderStatementPdf } from './pdf.service';
import { isEmailConfigured, sendMail } from './email.service';
import { ensurePortalToken, portalUrl } from './portal.service';
import { payNowLink } from './youpi.service';
import { getSettings, publicBaseUrl } from './settings.service';
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
  /** Send from this user's connected Gmail instead of the business mail setup. */
  fromUserId?: string;
}

const lines = (...xs: (string | null | undefined | false)[]) => xs.filter((x) => x !== null && x !== undefined && x !== false).join('\n');

type Settings = Awaited<ReturnType<typeof getSettings>>;
type InvoiceDoc = NonNullable<Awaited<ReturnType<typeof loadInvoiceDoc>>>;
type QuoteDoc = NonNullable<Awaited<ReturnType<typeof loadQuoteDoc>>>;

const loadInvoiceDoc = (id: string) => prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
const loadQuoteDoc = (id: string) => prisma.quote.findUnique({ where: { id }, include: quoteInclude });

/** The standard invoice email. `pdfLink` is used when the PDF can't be attached (Gmail/Outlook compose). */
function invoiceEmail(inv: InvoiceDoc, settings: Settings, link: string | null, pdfLink?: string | null, payLink?: string | null) {
  const balance = balanceOf(inv);
  const amount = moneyText(settings.currencySymbol, balance);
  const due = `Amount due: ${amount}${inv.dueDate ? ` by ${dayText(inv.dueDate)}` : ''}.`;
  return {
    subject: `Invoice ${inv.invoiceNumber} from ${settings.businessName}`,
    text: lines(
      `Hi ${inv.customer.name},`,
      '',
      pdfLink ? `Here is invoice ${inv.invoiceNumber}. ${due}` : `Please find attached invoice ${inv.invoiceNumber}. ${due}`,
      pdfLink ? `Download the invoice (PDF): ${pdfLink}` : null,
      payLink && balance > 0 ? `Pay online now: ${payLink}` : null,
      settings.upiId && balance > 0 ? `You can pay by UPI to ${settings.upiId} (scan the QR code on the invoice).` : '',
      link ? `View all your invoices and pay online: ${link}` : null,
      '',
      settings.thankYouMessage || 'Thank you for your business!',
      settings.businessName,
    ),
  };
}

function quoteEmail(q: QuoteDoc, settings: Settings, link: string | null, pdfLink?: string | null) {
  const total = moneyText(settings.currencySymbol, q.grandTotal);
  const validity = q.validUntil ? `, valid until ${dayText(q.validUntil)}` : '';
  return {
    subject: `Quotation ${q.quoteNumber} from ${settings.businessName}`,
    text: lines(
      `Hi ${q.customer.name},`,
      '',
      pdfLink ? `Here is our quotation ${q.quoteNumber} for ${total}${validity}.` : `Please find attached our quotation ${q.quoteNumber} for ${total}${validity}.`,
      pdfLink ? `Download the quotation (PDF): ${pdfLink}` : null,
      link ? `You can accept it online here: ${link}` : 'Reply to this email to accept it, or if you have any questions.',
      '',
      settings.thankYouMessage || 'Thank you!',
      settings.businessName,
    ),
  };
}

/** Portal links for a customer, or nulls when this install has no known public address. */
async function portalLinks(customerId: string, requestOrigin: string | null | undefined, pdfPath: string) {
  const base = await publicBaseUrl(requestOrigin);
  if (!base) return { link: null, pdfLink: null };
  const token = await ensurePortalToken(customerId);
  return { link: `${base}/portal/${token}`, pdfLink: `${base}/api/portal/${token}/${pdfPath}` };
}

/**
 * Prepare an email for the user's own mail app (Gmail or Outlook in the browser, or any
 * mail app via mailto), so no SMTP setup is needed. Those can't take an attachment from a
 * link, so the message carries a private PDF link from the customer portal.
 * `commit` = the user is opening it to send: a draft invoice is issued (as sending would)
 * and it goes in the customer's activity. Without it, this is a side-effect-free preview.
 */
export async function composeInvoice(id: string, requestOrigin?: string | null, commit = false) {
  const [inv, settings] = await Promise.all([loadInvoiceDoc(id), getSettings()]);
  if (!inv) throw notFound('Invoice');
  if (inv.status === 'CANCELLED') throw badRequest('Cannot send a cancelled invoice');
  const issued = commit && inv.status === 'DRAFT' ? await issueInvoice(inv.id) : inv;
  const { link, pdfLink } = await portalLinks(inv.customerId, requestOrigin, `invoices/${inv.id}/pdf`);
  const payLink = await payNowLink(inv.customerId, inv.id, requestOrigin);
  if (commit) await prisma.activity.create({
    data: { customerId: inv.customerId, eventType: 'INVOICE_SENT', title: `Invoice ${issued.invoiceNumber} prepared in your mail app`, referenceType: 'INVOICE', referenceId: inv.id },
  });
  return { to: inv.customer.email ?? '', ...invoiceEmail(issued, settings, link, pdfLink, payLink), pdfLink, fileName: `${issued.invoiceNumber}.pdf`, issued: commit && inv.status === 'DRAFT' };
}

export async function composeQuote(id: string, requestOrigin?: string | null, commit = false) {
  const [q, settings] = await Promise.all([loadQuoteDoc(id), getSettings()]);
  if (!q) throw notFound('Quote');
  if (q.status === 'CONVERTED') throw badRequest('This quote has already been converted to an invoice');
  if (commit && q.status === 'DRAFT') await setQuoteStatus(q.id, 'SENT');
  const { link, pdfLink } = await portalLinks(q.customerId, requestOrigin, `quotes/${q.id}/pdf`);
  if (commit) await prisma.activity.create({
    data: { customerId: q.customerId, eventType: 'QUOTE_SENT', title: `Quote ${q.quoteNumber} prepared in your mail app`, referenceType: 'QUOTE', referenceId: q.id },
  });
  return { to: q.customer.email ?? '', ...quoteEmail(q, settings, link, pdfLink), pdfLink, fileName: `${q.quoteNumber}.pdf`, issued: false };
}

export async function emailInvoice(id: string, opts: SendOpts = {}) {
  const [inv, settings] = await Promise.all([loadInvoiceDoc(id), getSettings()]);
  if (!inv) throw notFound('Invoice');
  const to = opts.to ?? inv.customer.email;
  if (!to) throw badRequest('Customer has no email address. Add one or enter a recipient.');
  if (inv.status === 'CANCELLED') throw badRequest('Cannot send a cancelled invoice');

  const link = await portalUrl(inv.customerId, opts.requestOrigin);
  const mail = invoiceEmail(inv, settings, link, null, await payNowLink(inv.customerId, inv.id, opts.requestOrigin));
  const text = opts.message ?? mail.text;

  // Sending a draft issues it: the customer now has it.
  const issued = inv.status === 'DRAFT' ? await issueInvoice(inv.id) : inv;
  const pdf = await renderInvoicePdf(issued, settings);
  await sendMail({
    to,
    subject: opts.subject ?? mail.subject,
    text,
    attachments: [{ filename: `${inv.invoiceNumber}.pdf`, content: pdf }],
    referenceType: 'INVOICE',
    referenceId: inv.id,
    fromUserId: opts.fromUserId,
  });
  await prisma.activity.create({
    data: { customerId: inv.customerId, eventType: 'INVOICE_SENT', title: `Invoice ${inv.invoiceNumber} emailed to ${to}`, referenceType: 'INVOICE', referenceId: inv.id },
  });
  return { to };
}

export async function emailQuote(id: string, opts: SendOpts = {}) {
  const [q, settings] = await Promise.all([loadQuoteDoc(id), getSettings()]);
  if (!q) throw notFound('Quote');
  const to = opts.to ?? q.customer.email;
  if (!to) throw badRequest('Customer has no email address. Add one or enter a recipient.');
  if (q.status === 'CONVERTED') throw badRequest('This quote has already been converted to an invoice');

  const link = await portalUrl(q.customerId, opts.requestOrigin);
  const mail = quoteEmail(q, settings, link);
  const text = opts.message ?? mail.text;
  const pdf = await renderQuotePdf(q, settings);
  await sendMail({
    to,
    subject: opts.subject ?? mail.subject,
    text,
    attachments: [{ filename: `${q.quoteNumber}.pdf`, content: pdf }],
    referenceType: 'QUOTE',
    referenceId: q.id,
    fromUserId: opts.fromUserId,
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
        ? `Amount due: ${moneyText(cur, st.amountDue)}${st.overdue > 0 ? ` (of which ${moneyText(cur, st.overdue)} is overdue)` : ''}.`
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
