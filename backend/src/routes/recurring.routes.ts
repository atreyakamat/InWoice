import { Router } from 'express';
import prisma from '../lib/prisma';
import { notFound } from '../lib/errors';
import { param, qs } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { withDerived } from '../services/invoice.service';
import {
  createRecurring,
  pauseRecurring,
  recurringInclude,
  recurringInput,
  resumeRecurring,
  runRecurringNow,
  updateRecurring,
} from '../services/recurring.service';

const router = Router();
router.use(authenticate, authorize('sales'));

router.get('/', async (req, res) => {
  const rows = await prisma.recurringInvoice.findMany({
    where: {
      ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}),
      ...(qs(req.query.customerId) ? { customerId: qs(req.query.customerId) } : {}),
    },
    orderBy: [{ status: 'asc' }, { nextRunDate: 'asc' }],
    include: { customer: { select: { id: true, name: true } }, items: { orderBy: { sortOrder: 'asc' } }, _count: { select: { invoices: true } } },
  });
  res.json({ success: true, data: rows });
});

router.get('/:id', async (req, res) => {
  const r = await prisma.recurringInvoice.findUnique({ where: { id: param(req.params.id) }, include: recurringInclude });
  if (!r) throw notFound('Recurring invoice');
  res.json({ success: true, data: { ...r, invoices: r.invoices.map(withDerived) } });
});

router.post('/', async (req, res) => {
  res.status(201).json({ success: true, data: await createRecurring(recurringInput.parse(req.body)) });
});

router.put('/:id', async (req, res) => {
  res.json({ success: true, data: await updateRecurring(param(req.params.id), recurringInput.parse(req.body)) });
});

router.post('/:id/pause', async (req, res) => {
  res.json({ success: true, data: await pauseRecurring(param(req.params.id)) });
});

router.post('/:id/resume', async (req, res) => {
  res.json({ success: true, data: await resumeRecurring(param(req.params.id)) });
});

/** Create the next invoice right now (e.g. the customer asked early). */
router.post('/:id/run', async (req, res) => {
  const invoice = await runRecurringNow(param(req.params.id));
  res.status(201).json({ success: true, data: withDerived(invoice), message: `Invoice ${invoice.invoiceNumber} created` });
});

router.delete('/:id', async (req, res) => {
  const id = param(req.params.id);
  if (!(await prisma.recurringInvoice.count({ where: { id } }))) throw notFound('Recurring invoice');
  // Invoices already created are kept; they just lose the link to the schedule.
  await prisma.recurringInvoice.delete({ where: { id } });
  res.json({ success: true, message: 'Schedule deleted. Invoices it already created are kept.' });
});

export default router;
