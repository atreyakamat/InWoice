import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { notFound } from '../lib/errors';
import { pagination, param, qs, round2 } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { createExpense, deleteExpense, expenseCategories, expenseInput, updateExpense } from '../services/expense.service';

const router = Router();
router.use(authenticate, authorize('payables'));

router.get('/categories', async (_req, res) => {
  res.json({ success: true, data: await expenseCategories() });
});

router.get('/', async (req, res) => {
  const q = qs(req.query.q);
  const from = qs(req.query.from);
  const to = qs(req.query.to);
  const where: Prisma.ExpenseWhereInput = {
    ...(qs(req.query.category) ? { category: qs(req.query.category) } : {}),
    ...(q
      ? { OR: [{ description: { contains: q, mode: 'insensitive' } }, { vendor: { contains: q, mode: 'insensitive' } }, { referenceId: { contains: q, mode: 'insensitive' } }] }
      : {}),
    ...(from || to ? { date: { ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}), ...(to ? { lt: new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000) } : {}) } } : {}),
  };
  const [data, total, sums, byCategory] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], ...pagination(req.query) }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { total: true, taxAmount: true, amount: true } }),
    prisma.expense.groupBy({ by: ['category'], where, _sum: { total: true }, orderBy: { _sum: { total: 'desc' } } }),
  ]);
  res.json({
    success: true,
    data,
    total,
    summary: {
      total: round2(sums._sum.total ?? 0),
      gst: round2(sums._sum.taxAmount ?? 0),
      byCategory: byCategory.map((c) => ({ category: c.category, total: round2(c._sum.total ?? 0) })),
    },
  });
});

router.get('/:id', async (req, res) => {
  const e = await prisma.expense.findUnique({ where: { id: param(req.params.id) } });
  if (!e) throw notFound('Expense');
  res.json({ success: true, data: e });
});

router.post('/', async (req, res) => {
  res.status(201).json({ success: true, data: await createExpense(expenseInput.parse(req.body)) });
});

router.put('/:id', async (req, res) => {
  res.json({ success: true, data: await updateExpense(param(req.params.id), expenseInput.parse(req.body)) });
});

router.delete('/:id', async (req, res) => {
  await deleteExpense(param(req.params.id));
  res.json({ success: true, message: 'Expense deleted' });
});

export default router;
