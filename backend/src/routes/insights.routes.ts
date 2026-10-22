import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { config } from '../lib/config';
import { param, sendCsv, toCsv } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { can } from '../lib/permissions';
import { askBusiness, getDashboard, runAnalysis } from '../services/analytics.service';
import { getAiConfig, isAiEnabled } from '../services/ai.service';
import { balanceOf, displayStatus } from '../services/invoice.service';

export const dashboardRouter = Router();
export const executiveRouter = Router();
export const exportRouter = Router();
dashboardRouter.use(authenticate, authorize('insights'));
executiveRouter.use(authenticate, authorize('insights'));
exportRouter.use(authenticate, authorize('accounts'));

// AI calls cost money (Claude) or CPU (local): keep a lid on them.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many AI requests. Wait a minute and try again.' },
});

dashboardRouter.get('/', async (req, res) => {
  const d = await getDashboard();
  // Costs, profit and supplier balances are only for roles that work with the accounts.
  const role = req.user?.role ?? '';
  const showMoneyOut = can(role, 'payables', 'read') || can(role, 'accounts', 'read');
  if (!showMoneyOut) {
    Object.assign(d.kpis, { payables: null, payablesCount: null, payablesOverdue: null, payablesOverdueCount: null, spentThisMonth: null, profitThisMonth: null, tracksCosts: false });
  }
  res.json({ success: true, data: { ...d, kpis: { ...d.kpis, showMoneyOut } } });
});

executiveRouter.get('/', async (_req, res) => {
  const [healthScore, briefing, risks, opportunities, forecasts, aiEnabled, ai] = await Promise.all([
    prisma.businessHealthScore.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.executiveBriefing.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.businessRisk.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.businessOpportunity.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.forecast.findMany({ orderBy: { createdAt: 'desc' }, take: 4 }),
    isAiEnabled(),
    getAiConfig(),
  ]);
  res.json({
    success: true,
    data: { healthScore, briefing, risks, opportunities, forecasts, ai: { enabled: aiEnabled, provider: ai.provider, model: ai.model } },
  });
});

/** Recompute health, risks, opportunities and forecast; write a briefing (AI if enabled, rules otherwise). */
executiveRouter.post('/analyze', aiLimiter, async (_req, res) => {
  res.json({ success: true, data: await runAnalysis() });
});

executiveRouter.post('/ask', aiLimiter, async (req, res) => {
  const { question } = z.object({ question: z.string().trim().min(2).max(2000) }).parse(req.body);
  res.json({ success: true, data: await askBusiness(question) });
});

executiveRouter.patch('/opportunities/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(['APPROVED', 'REJECTED', 'SNOOZED', 'EXECUTED']) }).parse(req.body);
  const opp = await prisma.businessOpportunity.update({ where: { id: param(req.params.id) }, data: { status } });
  res.json({ success: true, data: opp });
});

executiveRouter.patch('/risks/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(['MITIGATED', 'IGNORED']) }).parse(req.body);
  const risk = await prisma.businessRisk.update({ where: { id: param(req.params.id) }, data: { status } });
  res.json({ success: true, data: risk });
});

// --- CSV exports (for your accountant / spreadsheets) -------------------------------

exportRouter.get('/invoices', async (_req, res) => {
  const rows = await prisma.invoice.findMany({ orderBy: { date: 'asc' }, include: { customer: true } });
  sendCsv(
    res,
    'invoices',
    toCsv(
      rows.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        date: i.date.toISOString().slice(0, 10),
        dueDate: i.dueDate?.toISOString().slice(0, 10),
        customer: i.customer.name,
        customerGstin: i.customer.gstin,
        placeOfSupply: i.placeOfSupply,
        status: displayStatus(i),
        subtotal: i.subtotal,
        discount: i.discount,
        cgst: i.cgst,
        sgst: i.sgst,
        igst: i.igst,
        shipping: i.shippingCost,
        total: i.grandTotal,
        credited: i.amountCredited,
        paid: i.amountPaid,
        balance: i.status === 'CANCELLED' ? 0 : balanceOf(i),
      })),
      ['invoiceNumber', 'date', 'dueDate', 'customer', 'customerGstin', 'placeOfSupply', 'status', 'subtotal', 'discount', 'cgst', 'sgst', 'igst', 'shipping', 'total', 'credited', 'paid', 'balance'],
    ),
  );
});

exportRouter.get('/payments', async (_req, res) => {
  const rows = await prisma.payment.findMany({ orderBy: { paymentDate: 'asc' }, include: { invoice: { include: { customer: true } } } });
  sendCsv(
    res,
    'payments',
    toCsv(
      rows.map((p) => ({
        date: p.paymentDate.toISOString().slice(0, 10),
        invoiceNumber: p.invoice.invoiceNumber,
        customer: p.invoice.customer.name,
        amount: p.amount,
        method: p.paymentMethod,
        reference: p.referenceId,
      })),
      ['date', 'invoiceNumber', 'customer', 'amount', 'method', 'reference'],
    ),
  );
});

exportRouter.get('/customers', async (_req, res) => {
  const rows = await prisma.customer.findMany({ orderBy: { name: 'asc' } });
  sendCsv(res, 'customers', toCsv(rows, ['name', 'email', 'phone', 'instagram', 'address', 'city', 'state', 'gstin', 'segment', 'notes', 'createdAt']));
});

exportRouter.get('/products', async (_req, res) => {
  const rows = await prisma.product.findMany({ orderBy: { name: 'asc' } });
  sendCsv(res, 'products', toCsv(rows, ['name', 'sku', 'category', 'price', 'costPrice', 'hsnCode', 'taxRate', 'stock', 'status']));
});

exportRouter.get('/inventory', async (_req, res) => {
  const rows = await prisma.inventoryItem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  sendCsv(res, 'inventory', toCsv(rows, ['name', 'sku', 'category', 'unit', 'currentStock', 'reorderLevel', 'costPerUnit', 'location']));
});
