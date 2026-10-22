import express, { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { pagination, param, qs, round2 } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import {
  autoMatch,
  expenseFromBankInput,
  expenseFromTransaction,
  importStatement,
  mappingInput,
  matchTransaction,
  previewStatement,
  setIgnored,
  suggestionsFor,
  unmatch,
} from '../services/bank.service';

/** Bank statement import and reconciliation (owners, staff and accountants). */
const router = Router();
router.use(authenticate, authorize('payables'));

const csvBody = express.text({ type: () => true, limit: '10mb' });
const csvFrom = (body: unknown) => {
  const text = typeof body === 'string' ? body : typeof (body as { csv?: unknown })?.csv === 'string' ? (body as { csv: string }).csv : '';
  if (!text.trim()) throw badRequest('Upload the statement as a CSV file');
  return text;
};

/** Look at a statement before importing: columns found and the first lines as read. */
router.post('/preview', csvBody, async (req, res) => {
  res.json({ success: true, data: previewStatement(csvFrom(req.body)) });
});

/** ?account=Main&mapping=<JSON> with the CSV as the body. */
router.post('/import', csvBody, async (req, res) => {
  let raw: unknown;
  try {
    raw = JSON.parse(String(req.query.mapping ?? ''));
  } catch {
    throw badRequest('Choose which columns hold the date, description and amounts');
  }
  const mapping = mappingInput.parse(raw);
  if ((mapping.amount === null || mapping.amount === undefined) && (mapping.debit === null || mapping.debit === undefined) && (mapping.credit === null || mapping.credit === undefined)) {
    throw badRequest('Choose the amount column, or the debit and credit columns');
  }
  const account = (qs(req.query.account) ?? 'Main').slice(0, 40);
  res.status(201).json({ success: true, data: await importStatement(csvFrom(req.body), mapping, account) });
});

router.get('/', async (req, res) => {
  const status = qs(req.query.status);
  const where: Prisma.BankTransactionWhereInput = {
    ...(status ? { status } : {}),
    ...(qs(req.query.account) ? { account: qs(req.query.account) } : {}),
  };
  const [rows, total, counts, accounts] = await Promise.all([
    prisma.bankTransaction.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], ...pagination(req.query) }),
    prisma.bankTransaction.count({ where }),
    prisma.bankTransaction.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } }),
    prisma.bankTransaction.findMany({ distinct: ['account'], select: { account: true } }),
  ]);
  // Suggestions only for lines still waiting to be matched (kept to the page shown).
  const data = await Promise.all(rows.map(async (r) => ({ ...r, suggestions: r.status === 'UNMATCHED' ? await suggestionsFor(r) : [] })));
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, { count: c._count._all, amount: round2(c._sum.amount ?? 0) }]));
  res.json({ success: true, data, total, summary: { byStatus, accounts: accounts.map((a) => a.account) } });
});

router.post('/auto-match', async (_req, res) => {
  res.json({ success: true, data: { matched: await autoMatch() } });
});

router.post('/:id/match', async (req, res) => {
  const target = z.object({ type: z.enum(['PAYMENT', 'BILL_PAYMENT', 'EXPENSE', 'INVOICE', 'BILL']), id: z.string().uuid() }).parse(req.body);
  res.json({ success: true, data: await matchTransaction(param(req.params.id), target) });
});

router.post('/:id/expense', async (req, res) => {
  const e = await expenseFromTransaction(param(req.params.id), expenseFromBankInput.parse(req.body));
  res.status(201).json({ success: true, data: e });
});

router.post('/:id/ignore', async (req, res) => {
  res.json({ success: true, data: await setIgnored(param(req.params.id), true) });
});

router.post('/:id/restore', async (req, res) => {
  res.json({ success: true, data: await setIgnored(param(req.params.id), false) });
});

router.post('/:id/unmatch', async (req, res) => {
  res.json({ success: true, data: await unmatch(param(req.params.id)) });
});

export default router;
