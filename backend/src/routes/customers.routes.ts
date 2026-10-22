import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { conflict, notFound } from '../lib/errors';
import { optEmail, optGstin, optStr, pagination, param, qs, requestOrigin, round2 } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { balanceOf, withDerived } from '../services/invoice.service';
import { parsePeriod } from '../services/gst.service';
import { customerStatement } from '../services/statement.service';
import { renderStatementPdf } from '../services/pdf.service';
import { emailStatement } from '../services/documents.service';
import { newPortalToken, portalUrl } from '../services/portal.service';
import { getSettings, publicBaseUrl } from '../services/settings.service';

const router = Router();
router.use(authenticate, authorize('sales'));

const customerInput = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: optEmail,
  phone: optStr,
  instagram: optStr,
  address: optStr,
  city: optStr,
  state: optStr,
  gstin: optGstin,
  notes: optStr,
  segment: optStr,
});

router.get('/', async (req, res) => {
  const search = qs(req.query.search);
  const where: Prisma.CustomerWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      }
    : {};
  const customers = await prisma.customer.findMany({ where, orderBy: { name: 'asc' }, ...pagination(req.query) });

  // Per-customer totals in one grouped query rather than loading every invoice.
  // Spend is net of credit notes; outstanding never goes negative on refunded invoices.
  const ids = customers.map((c) => c.id);
  const stats = ids.length
    ? await prisma.$queryRaw<{ customerId: string; spent: number; outstanding: number; count: bigint; lastOrder: Date | null }[]>`
        SELECT "customerId",
          SUM("grandTotal" - "amountCredited")::float AS spent,
          SUM(GREATEST(0, "grandTotal" - "amountPaid" - "amountCredited"))::float AS outstanding,
          COUNT(*) AS count, MAX(date) AS "lastOrder"
        FROM "Invoice"
        WHERE "customerId" = ANY(${ids}::text[]) AND status IN ('PENDING','PARTIAL','PAID')
        GROUP BY "customerId"`
    : [];
  const byId = new Map(stats.map((s) => [s.customerId, s]));
  res.json({
    success: true,
    data: customers.map((c) => {
      const s = byId.get(c.id);
      return {
        ...c,
        totalSpent: round2(s?.spent ?? 0),
        outstanding: round2(s?.outstanding ?? 0),
        invoiceCount: Number(s?.count ?? 0),
        lastOrder: s?.lastOrder ?? null,
      };
    }),
  });
});

router.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: param(req.params.id) },
    include: {
      invoices: { orderBy: { date: 'desc' }, take: 50 },
      activities: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });
  if (!customer) throw notFound('Customer');
  const issued = customer.invoices.filter((i) => ['PENDING', 'PARTIAL', 'PAID'].includes(i.status));
  res.json({
    success: true,
    data: {
      ...customer,
      invoices: customer.invoices.map(withDerived),
      stats: {
        totalSpent: round2(issued.reduce((s, i) => s + i.grandTotal - i.amountCredited, 0)),
        totalPaid: round2(issued.reduce((s, i) => s + i.amountPaid, 0)),
        outstanding: round2(issued.reduce((s, i) => s + balanceOf(i), 0)),
        invoiceCount: issued.length,
        averageOrder: issued.length ? round2(issued.reduce((s, i) => s + i.grandTotal - i.amountCredited, 0) / issued.length) : 0,
      },
    },
  });
});

router.post('/', async (req, res) => {
  const customer = await prisma.customer.create({ data: customerInput.parse(req.body) });
  await prisma.activity.create({ data: { customerId: customer.id, eventType: 'CUSTOMER_CREATED', title: 'Customer added' } });
  res.status(201).json({ success: true, data: customer });
});

router.put('/:id', async (req, res) => {
  const customer = await prisma.customer.update({
    where: { id: param(req.params.id) },
    data: customerInput.partial().parse(req.body),
  });
  res.json({ success: true, data: customer });
});

router.post('/:id/notes', async (req, res) => {
  const { note } = z.object({ note: z.string().trim().min(1) }).parse(req.body);
  const id = param(req.params.id);
  if (!(await prisma.customer.count({ where: { id } }))) throw notFound('Customer');
  const activity = await prisma.activity.create({ data: { customerId: id, eventType: 'NOTE', title: 'Note', description: note } });
  res.status(201).json({ success: true, data: activity });
});

// --- Statement of account ---------------------------------------------------------

/** ?month=2026-09 or ?from=2026-04-01&to=2026-09-30 (default: the last 12 months). */
const statementPeriod = (q: Record<string, unknown>) => {
  if (qs(q.month) || (qs(q.from) && qs(q.to))) return parsePeriod({ month: qs(q.month), from: qs(q.from), to: qs(q.to) });
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  return { from, to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), label: 'last 12 months' };
};

router.get('/:id/statement', async (req, res) => {
  res.json({ success: true, data: await customerStatement(param(req.params.id), statementPeriod(req.query)) });
});

router.get('/:id/statement/pdf', async (req, res) => {
  const [st, settings] = await Promise.all([customerStatement(param(req.params.id), statementPeriod(req.query)), getSettings()]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="statement-${st.customer.name.replace(/[^\w-]+/g, '-')}.pdf"`);
  res.send(await renderStatementPdf(st, settings));
});

router.post('/:id/statement/send', async (req, res) => {
  const body = z.object({ to: z.string().trim().email().optional() }).parse(req.body ?? {});
  const { to } = await emailStatement(param(req.params.id), statementPeriod(req.query), { ...body, requestOrigin: requestOrigin(req) });
  res.json({ success: true, message: `Statement emailed to ${to}` });
});

// --- Customer portal link -----------------------------------------------------------

router.get('/:id/portal', async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: param(req.params.id) }, select: { portalToken: true } });
  if (!c) throw notFound('Customer');
  const base = await publicBaseUrl(requestOrigin(req));
  res.json({ success: true, data: { enabled: Boolean(c.portalToken), url: c.portalToken && base ? `${base}/portal/${c.portalToken}` : null } });
});

/** Turn the portal on (or keep the current link). */
router.post('/:id/portal', async (req, res) => {
  res.json({ success: true, data: { enabled: true, url: await portalUrl(param(req.params.id), requestOrigin(req)) } });
});

/** Replace the link: the old one stops working immediately. */
router.post('/:id/portal/regenerate', async (req, res) => {
  const id = param(req.params.id);
  if (!(await prisma.customer.count({ where: { id } }))) throw notFound('Customer');
  await prisma.customer.update({ where: { id }, data: { portalToken: newPortalToken() } });
  res.json({ success: true, data: { enabled: true, url: await portalUrl(id, requestOrigin(req)) } });
});

router.delete('/:id/portal', async (req, res) => {
  const id = param(req.params.id);
  if (!(await prisma.customer.count({ where: { id } }))) throw notFound('Customer');
  await prisma.customer.update({ where: { id }, data: { portalToken: null } });
  res.json({ success: true, data: { enabled: false, url: null } });
});

router.delete('/:id', async (req, res) => {
  const id = param(req.params.id);
  const invoices = await prisma.invoice.count({ where: { customerId: id } });
  if (invoices > 0) throw conflict(`This customer has ${invoices} invoice(s) and cannot be deleted`);
  const quotes = await prisma.quote.count({ where: { customerId: id } });
  if (quotes > 0) throw conflict(`This customer has ${quotes} quote(s). Delete them first.`);
  await prisma.customer.delete({ where: { id } });
  res.json({ success: true, message: 'Customer deleted' });
});

export default router;
