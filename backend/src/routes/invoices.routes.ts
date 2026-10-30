import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { notFound } from '../lib/errors';
import { dayText, moneyText, pagination, param, qs, requestOrigin } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import {
  addPayment,
  balanceOf,
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  deletePayment,
  duplicateInvoice,
  invoiceInclude,
  invoiceInput,
  issueInvoice,
  paymentInput,
  updateInvoice,
  displayStatus,
  withDerived,
} from '../services/invoice.service';
import { renderInvoicePdf } from '../services/pdf.service';
import { createCreditNote, creditNoteInput } from '../services/creditnote.service';
import { sendReminder } from '../services/reminder.service';
import { composeInvoice, emailInvoice } from '../services/documents.service';
import { portalUrl } from '../services/portal.service';
import { createCheckout, listOnlinePayments, payNowLink, syncPending } from '../services/youpi.service';
import { getSettings } from '../services/settings.service';

const router = Router();
router.use(authenticate, authorize('sales'));

async function loadInvoice(id: string) {
  const inv = await prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!inv) throw notFound('Invoice');
  return inv;
}

router.get('/', async (req, res) => {
  const status = qs(req.query.status);
  const search = qs(req.query.search);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const where: Prisma.InvoiceWhereInput = {
    ...(qs(req.query.customerId) ? { customerId: qs(req.query.customerId) } : {}),
    ...(status === 'OVERDUE'
      ? { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: today } }
      : status === 'UNPAID'
        ? { status: { in: ['PENDING', 'PARTIAL'] } }
        : status
          ? { status }
          : {}),
    ...(search
      ? {
          OR: [
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
      ...pagination(req.query),
    }),
    prisma.invoice.count({ where }),
  ]);
  res.json({ success: true, data: invoices.map(withDerived), total });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: withDerived(await loadInvoice(param(req.params.id))) });
});

router.post('/', async (req, res) => {
  const invoice = await createInvoice(invoiceInput.parse(req.body));
  res.status(201).json({ success: true, data: withDerived(invoice) });
});

router.put('/:id', async (req, res) => {
  const invoice = await updateInvoice(param(req.params.id), invoiceInput.parse(req.body));
  res.json({ success: true, data: withDerived(invoice) });
});

router.delete('/:id', async (req, res) => {
  await deleteInvoice(param(req.params.id));
  res.json({ success: true, message: 'Draft deleted' });
});

router.post('/:id/issue', async (req, res) => {
  res.json({ success: true, data: withDerived(await issueInvoice(param(req.params.id))) });
});

router.post('/:id/cancel', async (req, res) => {
  res.json({ success: true, data: withDerived(await cancelInvoice(param(req.params.id))) });
});

router.post('/:id/duplicate', async (req, res) => {
  res.status(201).json({ success: true, data: withDerived(await duplicateInvoice(param(req.params.id))) });
});

router.post('/:id/payments', async (req, res) => {
  const invoice = await addPayment(param(req.params.id), paymentInput.parse(req.body));
  res.status(201).json({ success: true, data: withDerived(invoice) });
});

router.delete('/:id/payments/:paymentId', async (req, res) => {
  const invoice = await deletePayment(param(req.params.id), param(req.params.paymentId));
  res.json({ success: true, data: withDerived(invoice) });
});

router.post('/:id/credit-notes', async (req, res) => {
  const cn = await createCreditNote(param(req.params.id), creditNoteInput.parse(req.body));
  res.status(201).json({ success: true, data: cn });
});

router.get('/:id/pdf', async (req, res) => {
  const [inv, settings] = await Promise.all([loadInvoice(param(req.params.id)), getSettings()]);
  const pdf = await renderInvoicePdf(inv, settings);
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${inv.invoiceNumber}.pdf"`);
  res.send(pdf);
});

router.post('/:id/send', async (req, res) => {
  const body = z
    .object({ to: z.string().trim().email().optional(), subject: z.string().optional(), message: z.string().optional(), via: z.enum(['default', 'gmail']).default('default') })
    .parse(req.body ?? {});
  const { to } = await emailInvoice(param(req.params.id), { ...body, requestOrigin: requestOrigin(req), fromUserId: body.via === 'gmail' ? req.user!.id : undefined });
  res.json({ success: true, message: `Invoice emailed to ${to}` });
});

/** Prepare the invoice email for the user's own Gmail/Outlook (no SMTP needed). */
router.get('/:id/compose', async (req, res) => {
  res.json({ success: true, data: await composeInvoice(param(req.params.id), requestOrigin(req)) });
});
/** The user is opening it in their mail app: issue a draft and note it on the customer. */
router.post('/:id/compose', async (req, res) => {
  res.json({ success: true, data: await composeInvoice(param(req.params.id), requestOrigin(req), true) });
});

// --- Online payments (YouPI-PG) -----------------------------------------------------------

router.get('/:id/online-payments', async (req, res) => {
  const inv = await loadInvoice(param(req.params.id));
  res.json({ success: true, data: { link: await payNowLink(inv.customerId, inv.id, requestOrigin(req)), sessions: await listOnlinePayments(inv.id) } });
});

/** Start a checkout now (e.g. to show the QR to a customer at the counter). */
router.post('/:id/online-payments', async (req, res) => {
  res.status(201).json({ success: true, data: await createCheckout(param(req.params.id)) });
});

/** Ask the gateway about open checkouts for this invoice (in case a webhook was missed). */
router.post('/:id/online-payments/sync', async (req, res) => {
  const id = param(req.params.id);
  const r = await syncPending(id);
  res.json({ success: true, data: { ...r, sessions: await listOnlinePayments(id), invoice: withDerived(await loadInvoice(id)) } });
});

/** Email a payment reminder now (with the PDF). Does not change the automatic schedule. */
router.post('/:id/remind', async (req, res) => {
  const { to } = z.object({ to: z.string().trim().email().optional() }).parse(req.body ?? {});
  const result = await sendReminder(param(req.params.id), { to, requestOrigin: requestOrigin(req) });
  res.json({ success: true, message: `Reminder for ${result.amount} emailed to ${result.to}` });
});

/** Prefilled WhatsApp share link (no API needed - opens WhatsApp with the message). */
router.get('/:id/whatsapp', async (req, res) => {
  const [inv, settings] = await Promise.all([loadInvoice(param(req.params.id)), getSettings()]);
  const portal = await portalUrl(inv.customerId, requestOrigin(req));
  const balance = balanceOf(inv);
  const overdue = displayStatus(inv) === 'OVERDUE';
  const msg = [
    `Hi ${inv.customer.name}, this is ${settings.businessName}.`,
    overdue ? `A friendly reminder: invoice ${inv.invoiceNumber} was due on ${dayText(inv.dueDate!)}.` : '',
    `Invoice ${inv.invoiceNumber}: ${moneyText(settings.currencySymbol, inv.grandTotal)}${balance > 0 && balance < inv.grandTotal ? ` (balance ${moneyText(settings.currencySymbol, balance)})` : ''}.`,
    balance > 0 && settings.upiId ? `Pay via UPI: ${settings.upiId}` : balance <= 0 ? 'Paid in full - thank you!' : '',
    balance > 0 ? await payNowLink(inv.customerId, inv.id, requestOrigin(req)).then((l) => (l ? `Pay online now: ${l}` : '')) : '',
    portal ? `View and pay online: ${portal}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const phone = (inv.customer.phone ?? '').replace(/[^\d]/g, '');
  res.json({ success: true, data: { url: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, message: msg } });
});

export default router;
