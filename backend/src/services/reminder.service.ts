import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { balanceOf, invoiceInclude } from './invoice.service';
import { renderInvoicePdf } from './pdf.service';
import { isEmailConfigured, sendMail } from './email.service';
import { getSettings } from './settings.service';
import { portalUrl } from './portal.service';

const DAY = 86_400_000;

/** "-1,3,7,15" => [-1, 3, 7, 15]. Negative = days before the due date. */
export function parseReminderDays(raw: string): number[] {
  const days = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < -30 || d > 365)) {
    throw badRequest('Reminder days must be whole numbers between -30 and 365, separated by commas');
  }
  const unique = [...new Set(days)].sort((a, b) => a - b);
  if (unique.length > 6) throw badRequest('Use at most 6 reminder days');
  return unique;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Whole days from the due date to `now` (negative before it). */
export const daysFromDue = (dueDate: Date, now: Date) => Math.round((startOfDay(now).getTime() - startOfDay(dueDate).getTime()) / DAY);

/**
 * Invoices that should get a reminder now. Each invoice walks through the configured
 * steps once; if several steps have passed (e.g. reminders were just switched on) it
 * gets a single reminder and skips ahead, so nobody is emailed every day.
 */
export async function dueReminders(now = new Date()) {
  const settings = await getSettings();
  const steps = parseReminderDays(settings.reminderDays);
  if (!steps.length) return [];
  const today = startOfDay(now);
  const candidates = await prisma.invoice.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { not: null }, customer: { email: { not: null } } },
    include: { customer: { select: { id: true, name: true, email: true } } },
    orderBy: { dueDate: 'asc' },
  });
  return candidates.flatMap((inv) => {
    const balance = balanceOf(inv);
    if (balance <= 0 || inv.remindersSent >= steps.length) return [];
    if (inv.lastReminderAt && inv.lastReminderAt >= today) return [];
    const days = daysFromDue(inv.dueDate!, now);
    if (days < steps[inv.remindersSent]!) return [];
    const reached = steps.filter((s) => s <= days).length;
    return [{ id: inv.id, invoiceNumber: inv.invoiceNumber, customer: inv.customer.name, email: inv.customer.email!, balance, daysFromDue: days, step: reached }];
  });
}

function reminderText(opts: { name: string; number: string; amount: string; due: Date; days: number; upi: string | null; portal: string | null; business: string; thanks: string | null }) {
  const when =
    opts.days < 0
      ? `is due on ${opts.due.toDateString()}`
      : opts.days === 0
        ? 'is due today'
        : `was due on ${opts.due.toDateString()} (${opts.days} day${opts.days === 1 ? '' : 's'} ago)`;
  return [
    `Hi ${opts.name},`,
    '',
    `A friendly reminder that invoice ${opts.number} for ${opts.amount} ${when}.`,
    opts.upi ? `You can pay by UPI to ${opts.upi} or scan the QR code on the attached invoice.` : 'The invoice is attached for reference.',
    ...(opts.portal ? [`View your invoices and pay online: ${opts.portal}`] : []),
    'If you have already paid, please ignore this message, and thank you!',
    '',
    opts.thanks || 'Thank you for your business!',
    opts.business,
  ].join('\n');
}

/** Email one reminder with the invoice PDF attached. `step` advances the automatic schedule. */
export async function sendReminder(invoiceId: string, opts: { to?: string; step?: number; requestOrigin?: string | null; message?: string } = {}) {
  const [inv, settings] = await Promise.all([prisma.invoice.findUnique({ where: { id: invoiceId }, include: invoiceInclude }), getSettings()]);
  if (!inv) throw notFound('Invoice');
  if (inv.status !== 'PENDING' && inv.status !== 'PARTIAL') throw badRequest('Only issued invoices with a balance due can be reminded');
  const balance = balanceOf(inv);
  if (balance <= 0) throw badRequest('Nothing is due on this invoice');
  const to = opts.to ?? inv.customer.email;
  if (!to) throw badRequest('Customer has no email address. Add one or enter a recipient.');

  const days = inv.dueDate ? daysFromDue(inv.dueDate, new Date()) : 0;
  const amount = `${settings.currencySymbol}${balance.toFixed(2)}`;
  const pdf = await renderInvoicePdf(inv, settings);
  await sendMail({
    to,
    subject: `${days > 0 ? 'Payment reminder' : 'Upcoming payment'}: invoice ${inv.invoiceNumber} (${amount})`,
    text: opts.message?.trim() || reminderText({
      name: inv.customer.name,
      number: inv.invoiceNumber,
      amount,
      due: inv.dueDate ?? new Date(),
      days,
      upi: settings.upiId,
      portal: await portalUrl(inv.customerId, opts.requestOrigin),
      business: settings.businessName,
      thanks: settings.thankYouMessage,
    }),
    attachments: [{ filename: `${inv.invoiceNumber}.pdf`, content: pdf }],
    referenceType: 'INVOICE_REMINDER',
    referenceId: inv.id,
  });
  await prisma.invoice.update({
    where: { id: inv.id },
    data: { lastReminderAt: new Date(), ...(opts.step !== undefined ? { remindersSent: Math.max(inv.remindersSent, opts.step) } : {}) },
  });
  await prisma.activity.create({
    data: {
      customerId: inv.customerId,
      eventType: 'REMINDER_SENT',
      title: `Payment reminder for ${inv.invoiceNumber} emailed to ${to}`,
      referenceType: 'INVOICE',
      referenceId: inv.id,
    },
  });
  return { to, amount };
}

/** Send every reminder that is due now. Safe to call repeatedly (at most one per invoice per day). */
export async function runReminders(now = new Date()) {
  const settings = await getSettings();
  if (!settings.remindersEnabled) return { skipped: 'Automatic reminders are switched off', sent: [], failed: [] };
  if (!(await isEmailConfigured())) return { skipped: 'Email is not configured', sent: [], failed: [] };
  const due = await dueReminders(now);
  const sent: string[] = [];
  const failed: { invoiceNumber: string; error: string }[] = [];
  for (const r of due) {
    try {
      await sendReminder(r.id, { step: r.step });
      sent.push(r.invoiceNumber);
    } catch (err) {
      failed.push({ invoiceNumber: r.invoiceNumber, error: err instanceof Error ? err.message : String(err) });
      // Try again tomorrow rather than on every scheduler tick (the failure is in the email log).
      await prisma.invoice.update({ where: { id: r.id }, data: { lastReminderAt: new Date() } });
    }
  }
  return { skipped: null, sent, failed };
}
