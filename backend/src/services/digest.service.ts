import prisma from '../lib/prisma';
import { ageing, cashSummary, gstr3b, profitAndLoss } from './accounts.service';
import { previousMonth } from './documents.service';
import { isEmailConfigured, sendMail } from './email.service';
import { generate, isAiEnabled } from './ai.service';
import { getSettings, publicBaseUrl } from './settings.service';
import type { Period } from './gst.service';

/**
 * Monthly summary for the owners: last month's sales, profit, cash, GST to pay and who to
 * chase, emailed to every active admin on the 1st. Plain numbers from the reports, plus a
 * short AI commentary when AI is on.
 */

export async function buildOwnerDigest(period: Period) {
  const [settings, pnl, cash, age, gst, lowStock] = await Promise.all([
    getSettings(),
    profitAndLoss(period),
    cashSummary(period),
    ageing(),
    gstr3b(period),
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "InventoryItem" WHERE "isActive" = true AND "reorderLevel" > 0 AND "currentStock" <= "reorderLevel"`,
  ]);
  const cur = settings.currencySymbol;
  const m = (n: number) => `${n < 0 ? '-' : ''}${cur}${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const facts = {
    month: period.label,
    netSales: pnl.income.net,
    purchases: pnl.purchases.total,
    expenses: pnl.expenses.total,
    netProfit: pnl.netProfit,
    netMarginPct: pnl.netMarginPct,
    moneyIn: cash.moneyIn,
    moneyOut: cash.moneyOut.total,
    customersOwe: age.receivables.total,
    overdueFromCustomers: age.receivables.overdue,
    youOweSuppliers: age.payables.total,
    gstPayableInCash: gst.cashPayable.total,
    materialsToReorder: Number(lowStock[0]?.n ?? 0),
    chaseFirst: age.receivables.oldest.slice(0, 5).map((o) => ({ invoice: o.number, customer: o.party, amount: o.balance, daysOverdue: o.daysOverdue })),
  };

  let commentary: string | null = null;
  if (await isAiEnabled()) {
    try {
      commentary = (
        await generate({
          system: `You are the bookkeeper for ${settings.businessName}. In 2-3 plain sentences, tell the owner the most important thing about last month and one thing to do this month. Use only the numbers given. Currency ${cur}. No headings or lists.`,
          prompt: JSON.stringify(facts),
          maxTokens: 400,
        })
      ).text.trim();
    } catch {
      commentary = null; // the numbers go out regardless
    }
  }

  const link = await publicBaseUrl();
  const lines = [
    `Your ${period.label} summary for ${settings.businessName}`,
    '',
    ...(commentary ? [commentary, ''] : []),
    `Sales (before GST):   ${m(facts.netSales)}`,
    `Purchases:            ${m(facts.purchases)}`,
    `Expenses:             ${m(facts.expenses)}`,
    `Net profit:           ${m(facts.netProfit)}${facts.netMarginPct !== null ? ` (${facts.netMarginPct}% margin)` : ''}`,
    '',
    `Money in:             ${m(facts.moneyIn)}`,
    `Money out:            ${m(facts.moneyOut)}`,
    `GST to pay in cash:   ${m(facts.gstPayableInCash)} (check before filing GSTR-3B)`,
    '',
    `Customers owe you:    ${m(facts.customersOwe)} (overdue ${m(facts.overdueFromCustomers)})`,
    `You owe suppliers:    ${m(facts.youOweSuppliers)}`,
    ...(facts.materialsToReorder ? [`Materials to reorder: ${facts.materialsToReorder}`] : []),
    ...(facts.chaseFirst.length ? ['', 'Chase first:', ...facts.chaseFirst.map((c) => `  ${c.invoice} · ${c.customer} · ${m(c.amount)} · ${c.daysOverdue} days overdue`)] : []),
    ...(link ? ['', `Open InWoice: ${link}/accounts`] : []),
  ];
  return { facts, commentary, text: lines.join('\n'), subject: `${settings.businessName}: your ${period.label} summary (profit ${m(facts.netProfit)})` };
}

/** Once a month (on or after the 1st), email last month's summary to every active admin. */
export async function runOwnerDigest(now = new Date(), force = false) {
  const settings = await getSettings();
  if (!settings.ownerDigestEnabled && !force) return { skipped: 'The monthly summary is switched off', sent: [] as string[] };
  if (!(await isEmailConfigured())) return { skipped: 'Email is not configured', sent: [] };
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!force && settings.lastOwnerDigestAt && settings.lastOwnerDigestAt >= monthStart) return { skipped: 'Already sent this month', sent: [] };
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { email: true } });
  if (!admins.length) return { skipped: 'No admins to send to', sent: [] };
  // Mark first so a slow mail server or a restart never sends it twice.
  await prisma.businessSettings.update({ where: { id: settings.id }, data: { lastOwnerDigestAt: now } });
  const digest = await buildOwnerDigest(previousMonth(now));
  const sent: string[] = [];
  for (const a of admins) {
    try {
      await sendMail({ to: a.email, subject: digest.subject, text: digest.text, referenceType: 'OWNER_DIGEST' });
      sent.push(a.email);
    } catch {
      // In the email log.
    }
  }
  return { skipped: null, sent };
}
