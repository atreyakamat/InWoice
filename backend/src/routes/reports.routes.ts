import { Router } from 'express';
import { param, qs, sendCsv, toCsv } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { buildGstReport, gstCsv, parsePeriod, salesRegister } from '../services/gst.service';
import { ageing, cashSummary, gstr3b, pnlCsv, profitAndLoss, purchaseRegister, stockValueNow, takeStockSnapshot, tdsSummary } from '../services/accounts.service';
import { buildGstr1Json, matchGstr2b } from '../services/gstn.service';
import { badRequest } from '../lib/errors';
import express from 'express';
import prisma from '../lib/prisma';

const router = Router();
router.use(authenticate, authorize('accounts'));

const periodOf = (q: Record<string, unknown>) => parsePeriod({ month: qs(q.month), from: qs(q.from), to: qs(q.to) });

/** GSTR-1 style report: ?month=2026-04, or ?from=2026-04-01&to=2026-06-30 */
router.get('/gst', async (req, res) => {
  res.json({ success: true, data: await buildGstReport(periodOf(req.query)) });
});

/** One GSTR-1 section as CSV in the GST offline tool layout. */
router.get('/gst/csv/:section', async (req, res) => {
  const period = periodOf(req.query);
  const section = param(req.params.section).toLowerCase();
  const { columns, rows } = gstCsv(await buildGstReport(period), section);
  sendCsv(res, `gstr1-${section}-${period.label.replace(/\s+/g, '')}`, toCsv(rows, columns));
});

router.get('/sales-register', async (req, res) => {
  const period = periodOf(req.query);
  const { columns, rows } = await salesRegister(period);
  sendCsv(res, `sales-register-${period.label.replace(/\s+/g, '')}`, toCsv(rows, columns));
});

/** Profit & loss for the period (purchases basis, GST you can claim excluded). */
router.get('/pnl', async (req, res) => {
  res.json({ success: true, data: await profitAndLoss(periodOf(req.query)) });
});

router.get('/pnl/csv', async (req, res) => {
  const period = periodOf(req.query);
  const { columns, rows } = pnlCsv(await profitAndLoss(period));
  sendCsv(res, `profit-and-loss-${period.label.replace(/\s+/g, '')}`, toCsv(rows, columns));
});

/** GSTR-3B summary: output tax, input tax credit and cash payable after set-off. */
router.get('/gstr3b', async (req, res) => {
  res.json({ success: true, data: await gstr3b(periodOf(req.query)) });
});

/** Receivables and payables by age (as of now). */
router.get('/ageing', async (_req, res) => {
  res.json({ success: true, data: await ageing() });
});

/** Money in and out for the period, plus what falls due soon. */
router.get('/cash', async (req, res) => {
  res.json({ success: true, data: await cashSummary(periodOf(req.query)) });
});

router.get('/purchase-register', async (req, res) => {
  const period = periodOf(req.query);
  const { columns, rows } = await purchaseRegister(period);
  sendCsv(res, `purchase-register-${period.label.replace(/\s+/g, '')}`, toCsv(rows, columns));
});

/** GSTR-1 as JSON for the GST offline tool (one month: ?month=2026-09). */
router.get('/gst/json', async (req, res) => {
  const month = qs(req.query.month);
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw badRequest('Choose a month: GSTR-1 is filed monthly (or for each month of a quarter)');
  const json = await buildGstr1Json(periodOf(req.query), month);
  res.setHeader('Content-Disposition', `attachment; filename="GSTR1_${json.gstin}_${json.fp}.json"`);
  res.json(json);
});

/** Match a GSTR-2B JSON (downloaded from the GST portal) against your bills. ?month= for bills not yet reported. */
router.post('/gstr2b/match', express.json({ limit: '25mb' }), async (req, res) => {
  res.json({ success: true, data: await matchGstr2b(req.body, periodOf(req.query)) });
});

router.get('/tds', async (req, res) => {
  res.json({ success: true, data: await tdsSummary(periodOf(req.query)) });
});

/** Stock value at cost now, and recorded snapshots (used for the P&L stock change). */
router.get('/stock', async (_req, res) => {
  const snapshots = await prisma.stockSnapshot.findMany({ orderBy: { date: 'desc' }, take: 24 });
  res.json({ success: true, data: { now: await stockValueNow(), snapshots } });
});

router.post('/stock/snapshot', async (_req, res) => {
  res.status(201).json({ success: true, data: await takeStockSnapshot() });
});

export default router;
