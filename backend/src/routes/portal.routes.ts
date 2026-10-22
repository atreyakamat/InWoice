import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import prisma from '../lib/prisma';
import { config } from '../lib/config';
import { notFound } from '../lib/errors';
import { param } from '../lib/util';
import { balanceOf, invoiceInclude } from '../services/invoice.service';
import { quoteInclude, setQuoteStatus } from '../services/quote.service';
import { customerByToken, portalData } from '../services/portal.service';
import { customerStatement } from '../services/statement.service';
import { renderInvoicePdf, renderQuotePdf, renderStatementPdf, upiLink } from '../services/pdf.service';
import { getSettings } from '../services/settings.service';

/**
 * Public customer portal API: no login, the secret token in the URL is the key. It only
 * ever exposes that one customer's issued documents.
 */
const router = Router();

router.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: config.isTest ? 1000 : 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please wait a minute.' },
  }),
);

// Portal pages must never be cached by shared proxies or indexed.
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

const sendPdf = (res: Response, name: string, pdf: Buffer, download: boolean) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${name}.pdf"`);
  res.send(pdf);
};

router.get('/:token', async (req, res) => {
  res.json({ success: true, data: await portalData(param(req.params.token)) });
});

router.get('/:token/invoices/:id/pdf', async (req, res) => {
  const customer = await customerByToken(param(req.params.token));
  const inv = await prisma.invoice.findFirst({
    where: { id: param(req.params.id), customerId: customer.id, status: { in: ['PENDING', 'PARTIAL', 'PAID'] } },
    include: invoiceInclude,
  });
  if (!inv) throw notFound('Invoice');
  sendPdf(res, inv.invoiceNumber, await renderInvoicePdf(inv, await getSettings()), req.query.download === '1');
});

router.get('/:token/quotes/:id/pdf', async (req, res) => {
  const customer = await customerByToken(param(req.params.token));
  const q = await prisma.quote.findFirst({ where: { id: param(req.params.id), customerId: customer.id, status: { not: 'DRAFT' } }, include: quoteInclude });
  if (!q) throw notFound('Quote');
  sendPdf(res, q.quoteNumber, await renderQuotePdf(q, await getSettings()), req.query.download === '1');
});

/** Statement for the last 12 months up to today. */
router.get('/:token/statement/pdf', async (req, res) => {
  const customer = await customerByToken(param(req.params.token));
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const st = await customerStatement(customer.id, { from, to, label: 'last 12 months' });
  sendPdf(res, 'statement', await renderStatementPdf(st, await getSettings()), req.query.download === '1');
});

/** UPI QR (PNG) for one invoice's balance, or everything outstanding when no invoice is given. */
router.get('/:token/qr.png', async (req, res) => {
  const customer = await customerByToken(param(req.params.token));
  const settings = await getSettings();
  const invoiceId = typeof req.query.invoice === 'string' ? req.query.invoice : null;
  let link: string | null;
  if (invoiceId) {
    const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, customerId: customer.id, status: { in: ['PENDING', 'PARTIAL'] } } });
    if (!inv) throw notFound('Invoice');
    link = upiLink(settings, balanceOf(inv), `Invoice ${inv.invoiceNumber}`);
  } else {
    link = (await portalData(customer.portalToken!)).payAllLink;
  }
  if (!link) throw notFound('Nothing to pay');
  res.setHeader('Content-Type', 'image/png');
  res.send(await QRCode.toBuffer(link, { margin: 1, width: 240 }));
});

async function respond(token: string, quoteId: string, status: 'ACCEPTED' | 'DECLINED') {
  const customer = await customerByToken(token);
  const q = await prisma.quote.findFirst({ where: { id: quoteId, customerId: customer.id } });
  if (!q) throw notFound('Quote');
  await setQuoteStatus(q.id, status, 'CUSTOMER');
}

router.post('/:token/quotes/:id/accept', async (req, res) => {
  await respond(param(req.params.token), param(req.params.id), 'ACCEPTED');
  res.json({ success: true, message: 'Thank you! We have received your acceptance.' });
});

router.post('/:token/quotes/:id/decline', async (req, res) => {
  await respond(param(req.params.token), param(req.params.id), 'DECLINED');
  res.json({ success: true, message: 'Thanks for letting us know.' });
});

export default router;
