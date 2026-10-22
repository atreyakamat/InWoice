import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../lib/config';
import { readBill } from '../services/bill-reader.service';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { pagination, param, qs, round2 } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import {
  addBillPayment,
  billInclude,
  billInput,
  billPaymentInput,
  cancelBill,
  createBill,
  deleteBillPayment,
  updateBill,
  withBillDerived,
} from '../services/bill.service';
import { cancelDebitNote, createDebitNote, debitNoteInclude, debitNoteInput } from '../services/debitnote.service';

const router = Router();
router.use(authenticate, authorize('payables'));

const today0 = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// AI calls cost money (Claude) or CPU (local): keep a lid on them.
const readLimiter = rateLimit({ windowMs: 60_000, limit: config.isTest ? 1000 : 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: 'Too many bills read in a minute. Wait a moment.' } });

/** Read a bill from a photo or PDF (raw upload) and return a draft for the bill form. Saves nothing. */
router.post('/read', readLimiter, express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Upload a photo or PDF of the bill');
  const mimeType = (req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  res.json({ success: true, data: await readBill({ mimeType, data: req.body }) });
});

router.get('/', async (req, res) => {
  const status = qs(req.query.status);
  const q = qs(req.query.q);
  const from = qs(req.query.from);
  const to = qs(req.query.to);
  const where: Prisma.BillWhereInput = {
    ...(status === 'OVERDUE'
      ? { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: today0() } }
      : status === 'OPEN'
        ? { status: { in: ['PENDING', 'PARTIAL'] } }
        : status
          ? { status }
          : {}),
    ...(qs(req.query.supplierId) ? { supplierId: qs(req.query.supplierId) } : {}),
    ...(qs(req.query.purchaseOrderId) ? { purchaseOrderId: qs(req.query.purchaseOrderId) } : {}),
    ...(q ? { OR: [{ billNumber: { contains: q, mode: 'insensitive' } }, { supplier: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
    ...(from || to ? { date: { ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}), ...(to ? { lt: new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000) } : {}) } } : {}),
  };
  const [rows, total, open] = await Promise.all([
    prisma.bill.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { supplier: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, poNumber: true } } },
      ...pagination(req.query),
    }),
    prisma.bill.count({ where }),
    prisma.bill.aggregate({ where: { status: { in: ['PENDING', 'PARTIAL'] } }, _sum: { grandTotal: true, amountPaid: true, amountDebited: true }, _count: true }),
  ]);
  res.json({
    success: true,
    data: rows.map(withBillDerived),
    total,
    summary: { openBills: open._count, owed: round2((open._sum.grandTotal ?? 0) - (open._sum.amountPaid ?? 0) - (open._sum.amountDebited ?? 0)) },
  });
});

router.get('/:id', async (req, res) => {
  const bill = await prisma.bill.findUnique({ where: { id: param(req.params.id) }, include: billInclude });
  if (!bill) throw notFound('Bill');
  res.json({ success: true, data: withBillDerived(bill) });
});

router.post('/', async (req, res) => {
  res.status(201).json({ success: true, data: withBillDerived(await createBill(billInput.parse(req.body))) });
});

router.put('/:id', async (req, res) => {
  res.json({ success: true, data: withBillDerived(await updateBill(param(req.params.id), billInput.parse(req.body))) });
});

router.post('/:id/cancel', async (req, res) => {
  res.json({ success: true, data: withBillDerived(await cancelBill(param(req.params.id))) });
});

router.post('/:id/payments', async (req, res) => {
  const bill = await addBillPayment(param(req.params.id), billPaymentInput.parse(req.body));
  res.status(201).json({ success: true, data: withBillDerived(bill) });
});

router.delete('/:id/payments/:paymentId', async (req, res) => {
  res.json({ success: true, data: withBillDerived(await deleteBillPayment(param(req.params.id), param(req.params.paymentId))) });
});

/** Debit note (purchase return or price reduction) against this bill. */
router.post('/:id/debit-notes', async (req, res) => {
  res.status(201).json({ success: true, data: await createDebitNote(param(req.params.id), debitNoteInput.parse(req.body)) });
});

router.get('/debit-notes/all', async (req, res) => {
  const rows = await prisma.debitNote.findMany({
    where: qs(req.query.supplierId) ? { supplierId: qs(req.query.supplierId) } : {},
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    include: debitNoteInclude,
    ...pagination(req.query),
  });
  res.json({ success: true, data: rows });
});

router.post('/debit-notes/:dnId/cancel', async (req, res) => {
  res.json({ success: true, data: await cancelDebitNote(param(req.params.dnId)) });
});

export default router;
