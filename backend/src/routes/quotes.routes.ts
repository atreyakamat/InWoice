import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { notFound } from '../lib/errors';
import { pagination, param, qs, requestOrigin } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import {
  convertQuote,
  createQuote,
  deleteQuote,
  duplicateQuote,
  quoteInclude,
  quoteInput,
  setQuoteStatus,
  updateQuote,
  withQuoteDerived,
} from '../services/quote.service';
import { withDerived } from '../services/invoice.service';
import { emailQuote } from '../services/documents.service';
import { renderQuotePdf } from '../services/pdf.service';
import { getSettings } from '../services/settings.service';

const router = Router();
router.use(authenticate, authorize('sales'));

async function loadQuote(id: string) {
  const q = await prisma.quote.findUnique({ where: { id }, include: quoteInclude });
  if (!q) throw notFound('Quote');
  return q;
}

router.get('/', async (req, res) => {
  const status = qs(req.query.status);
  const search = qs(req.query.search);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const where: Prisma.QuoteWhereInput = {
    ...(qs(req.query.customerId) ? { customerId: qs(req.query.customerId) } : {}),
    ...(status === 'EXPIRED'
      ? { status: { in: ['DRAFT', 'SENT'] }, validUntil: { lt: today } }
      : status === 'OPEN'
        ? { status: { in: ['DRAFT', 'SENT'] }, OR: [{ validUntil: null }, { validUntil: { gte: today } }] }
        : status
          ? { status }
          : {}),
    ...(search
      ? { AND: [{ OR: [{ quoteNumber: { contains: search, mode: 'insensitive' } }, { customer: { name: { contains: search, mode: 'insensitive' } } }] }] }
      : {}),
  };
  const [rows, total, open] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { customer: { select: { id: true, name: true } }, invoice: { select: { id: true, invoiceNumber: true } } },
      ...pagination(req.query),
    }),
    prisma.quote.count({ where }),
    prisma.quote.aggregate({ where: { status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] }, OR: [{ validUntil: null }, { validUntil: { gte: today } }] }, _sum: { grandTotal: true }, _count: true }),
  ]);
  res.json({ success: true, data: rows.map(withQuoteDerived), total, summary: { openQuotes: open._count, openValue: open._sum.grandTotal ?? 0 } });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: withQuoteDerived(await loadQuote(param(req.params.id))) });
});

router.post('/', async (req, res) => {
  res.status(201).json({ success: true, data: withQuoteDerived(await createQuote(quoteInput.parse(req.body))) });
});

router.put('/:id', async (req, res) => {
  res.json({ success: true, data: withQuoteDerived(await updateQuote(param(req.params.id), quoteInput.parse(req.body))) });
});

router.patch('/:id/status', async (req, res) => {
  const { status } = z.object({ status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED']) }).parse(req.body);
  res.json({ success: true, data: withQuoteDerived(await setQuoteStatus(param(req.params.id), status)) });
});

/** Create an invoice from the quote (draft by default; `issue: true` issues it straight away). */
router.post('/:id/convert', async (req, res) => {
  const { issue } = z.object({ issue: z.boolean().default(false) }).parse(req.body ?? {});
  const invoice = await convertQuote(param(req.params.id), { issue });
  res.status(201).json({ success: true, data: withDerived(invoice) });
});

router.post('/:id/duplicate', async (req, res) => {
  res.status(201).json({ success: true, data: withQuoteDerived(await duplicateQuote(param(req.params.id))) });
});

router.delete('/:id', async (req, res) => {
  await deleteQuote(param(req.params.id));
  res.json({ success: true, message: 'Quote deleted' });
});

router.get('/:id/pdf', async (req, res) => {
  const [q, settings] = await Promise.all([loadQuote(param(req.params.id)), getSettings()]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${q.quoteNumber}.pdf"`);
  res.send(await renderQuotePdf(q, settings));
});

router.post('/:id/send', async (req, res) => {
  const body = z.object({ to: z.string().trim().email().optional(), subject: z.string().optional(), message: z.string().optional() }).parse(req.body ?? {});
  const { to } = await emailQuote(param(req.params.id), { ...body, requestOrigin: requestOrigin(req) });
  res.json({ success: true, message: `Quote emailed to ${to}`, data: withQuoteDerived(await loadQuote(param(req.params.id))) });
});

export default router;
