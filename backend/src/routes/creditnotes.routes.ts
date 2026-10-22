import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { notFound } from '../lib/errors';
import { pagination, param, qs } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { cancelCreditNote, creditNoteInclude } from '../services/creditnote.service';
import { renderCreditNotePdf } from '../services/pdf.service';
import { getSettings } from '../services/settings.service';

const router = Router();
router.use(authenticate, authorize('sales'));

async function loadCreditNote(id: string) {
  const cn = await prisma.creditNote.findUnique({ where: { id }, include: creditNoteInclude });
  if (!cn) throw notFound('Credit note');
  return cn;
}

router.get('/', async (req, res) => {
  const where: Prisma.CreditNoteWhereInput = {
    ...(qs(req.query.customerId) ? { customerId: qs(req.query.customerId) } : {}),
    ...(qs(req.query.invoiceId) ? { invoiceId: qs(req.query.invoiceId) } : {}),
    ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.creditNote.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: creditNoteInclude, ...pagination(req.query) }),
    prisma.creditNote.count({ where }),
  ]);
  res.json({ success: true, data, total });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await loadCreditNote(param(req.params.id)) });
});

router.post('/:id/cancel', async (req, res) => {
  res.json({ success: true, data: await cancelCreditNote(param(req.params.id)) });
});

router.get('/:id/pdf', async (req, res) => {
  const [cn, settings] = await Promise.all([loadCreditNote(param(req.params.id)), getSettings()]);
  const pdf = await renderCreditNotePdf(cn, settings);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${cn.creditNoteNumber}.pdf"`);
  res.send(pdf);
});

export default router;
