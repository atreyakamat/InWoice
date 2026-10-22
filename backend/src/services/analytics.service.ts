import prisma from '../lib/prisma';
import { round2 } from '../lib/util';
import { generate, getAiConfig, isAiEnabled } from './ai.service';
import { getSettings } from './settings.service';
import { periodFor, profitAndLoss, thisMonthPeriod } from './accounts.service';

const DAY = 86_400_000;
const ISSUED = ['PENDING', 'PARTIAL', 'PAID'];
const OPEN = ['PENDING', 'PARTIAL'];

const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const today0 = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const n = (v: unknown) => Number(v ?? 0);

// -------------------------------------------------------------------------
// Dashboard
// -------------------------------------------------------------------------

export async function getDashboard() {
  const monthStart = startOfMonth();
  const yearAgo = new Date(monthStart.getFullYear(), monthStart.getMonth() - 11, 1);

  const [
    collectedMonth,
    invoicedMonth,
    outstanding,
    overdue,
    monthly,
    topCustomers,
    topProducts,
    recentInvoices,
    lowStockProducts,
    lowStockMaterials,
    customerCount,
    productCount,
    pendingFulfillments,
  ] = await Promise.all([
    prisma.payment.aggregate({ where: { paymentDate: { gte: monthStart }, invoice: { status: { not: 'CANCELLED' } } }, _sum: { amount: true, tdsAmount: true } }),
    prisma.invoice.aggregate({ where: { status: { in: ISSUED }, date: { gte: monthStart } }, _sum: { grandTotal: true, amountCredited: true }, _count: true }),
    prisma.invoice.aggregate({ where: { status: { in: OPEN } }, _sum: { grandTotal: true, amountPaid: true, amountCredited: true }, _count: true }),
    prisma.invoice.aggregate({ where: { status: { in: OPEN }, dueDate: { lt: today0() } }, _sum: { grandTotal: true, amountPaid: true, amountCredited: true }, _count: true }),
    prisma.$queryRaw<{ month: Date; invoiced: number; collected: number }[]>`
      WITH months AS (
        SELECT generate_series(date_trunc('month', ${yearAgo}::timestamp), date_trunc('month', now()), interval '1 month') AS month
      )
      SELECT m.month,
        COALESCE((SELECT SUM(i."grandTotal" - i."amountCredited") FROM "Invoice" i
                  WHERE i.status IN ('PENDING','PARTIAL','PAID') AND date_trunc('month', i.date) = m.month), 0)::float AS invoiced,
        COALESCE((SELECT SUM(p.amount - p."tdsAmount") FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
                  WHERE i.status <> 'CANCELLED' AND date_trunc('month', p."paymentDate") = m.month), 0)::float AS collected
      FROM months m ORDER BY m.month`,
    prisma.$queryRaw<{ id: string; name: string; revenue: number; invoices: bigint }[]>`
      SELECT c.id, c.name, SUM(i."grandTotal" - i."amountCredited")::float AS revenue, COUNT(i.id) AS invoices
      FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
      WHERE i.status IN ('PENDING','PARTIAL','PAID')
      GROUP BY c.id, c.name ORDER BY revenue DESC LIMIT 5`,
    prisma.$queryRaw<{ name: string; quantity: bigint; revenue: number }[]>`
      SELECT it.name, SUM(it.quantity) AS quantity, SUM(it.total)::float AS revenue
      FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId"
      WHERE i.status IN ('PENDING','PARTIAL','PAID')
      GROUP BY it.name ORDER BY revenue DESC LIMIT 5`,
    prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, invoiceNumber: true, date: true, dueDate: true, grandTotal: true, amountPaid: true, amountCredited: true, status: true, customer: { select: { name: true } } },
    }),
    prisma.$queryRaw<{ id: string; name: string; stock: number; threshold: number }[]>`
      SELECT id, name, stock, "lowStockThreshold" AS threshold FROM "Product"
      WHERE status = 'ACTIVE' AND stock <= "lowStockThreshold" ORDER BY stock ASC LIMIT 10`,
    prisma.$queryRaw<{ id: string; name: string; stock: number; unit: string; reorderLevel: number }[]>`
      SELECT id, name, "currentStock" AS stock, unit, "reorderLevel" FROM "InventoryItem"
      WHERE "isActive" = true AND "currentStock" <= "reorderLevel" ORDER BY "currentStock" ASC LIMIT 10`,
    prisma.customer.count(),
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    prisma.fulfillment.count({ where: { status: { in: ['PENDING', 'PACKING', 'PACKED'] } } }),
  ]);

  const [payables, payablesOverdue, billsMonth, expensesMonth, pnlMonth] = await Promise.all([
    prisma.bill.aggregate({ where: { status: { in: OPEN } }, _sum: { grandTotal: true, amountPaid: true, amountDebited: true }, _count: true }),
    prisma.bill.aggregate({ where: { status: { in: OPEN }, dueDate: { lt: today0() } }, _sum: { grandTotal: true, amountPaid: true, amountDebited: true }, _count: true }),
    prisma.billPayment.aggregate({ where: { paymentDate: { gte: monthStart }, bill: { status: { not: 'CANCELLED' } } }, _sum: { amount: true, tdsAmount: true } }),
    prisma.expense.aggregate({ where: { date: { gte: monthStart } }, _sum: { total: true } }),
    profitAndLoss(thisMonthPeriod()),
  ]);

  return {
    kpis: {
      payables: round2(n(payables._sum.grandTotal) - n(payables._sum.amountPaid) - n(payables._sum.amountDebited)),
      payablesCount: payables._count,
      payablesOverdue: round2(n(payablesOverdue._sum.grandTotal) - n(payablesOverdue._sum.amountPaid) - n(payablesOverdue._sum.amountDebited)),
      payablesOverdueCount: payablesOverdue._count,
      spentThisMonth: round2(n(billsMonth._sum.amount) - n(billsMonth._sum.tdsAmount) + n(expensesMonth._sum.total)),
      profitThisMonth: pnlMonth.netProfit,
      tracksCosts: pnlMonth.purchases.bills + pnlMonth.expenses.count > 0 || payables._count > 0,
      // Cash actually received: TDS deducted by customers isn't money in the bank.
      collectedThisMonth: round2(n(collectedMonth._sum.amount) - n(collectedMonth._sum.tdsAmount)),
      invoicedThisMonth: round2(n(invoicedMonth._sum.grandTotal) - n(invoicedMonth._sum.amountCredited)),
      invoicesThisMonth: invoicedMonth._count,
      outstanding: round2(n(outstanding._sum.grandTotal) - n(outstanding._sum.amountPaid) - n(outstanding._sum.amountCredited)),
      outstandingCount: outstanding._count,
      overdue: round2(n(overdue._sum.grandTotal) - n(overdue._sum.amountPaid) - n(overdue._sum.amountCredited)),
      overdueCount: overdue._count,
      customers: customerCount,
      products: productCount,
      pendingFulfillments,
    },
    monthly: monthly.map((m) => ({
      month: m.month.toISOString().slice(0, 7),
      invoiced: round2(n(m.invoiced)),
      collected: round2(n(m.collected)),
    })),
    topCustomers: topCustomers.map((c) => ({ ...c, revenue: round2(n(c.revenue)), invoices: Number(c.invoices) })),
    topProducts: topProducts.map((p) => ({ ...p, quantity: Number(p.quantity), revenue: round2(n(p.revenue)) })),
    recentInvoices,
    lowStock: { products: lowStockProducts, materials: lowStockMaterials },
  };
}

// -------------------------------------------------------------------------
// Business snapshot (shared by health score, insights, briefing and Q&A)
// -------------------------------------------------------------------------

export async function getSnapshot() {
  const [last30, prev30, invoiced90, collected90, open, overdueList, products, lowProducts, materials, lowMaterials, pendingFulfillments, customers] =
    await Promise.all([
      prisma.invoice.aggregate({ where: { status: { in: ISSUED }, date: { gte: daysAgo(30) } }, _sum: { grandTotal: true, amountCredited: true }, _count: true }),
      prisma.invoice.aggregate({ where: { status: { in: ISSUED }, date: { gte: daysAgo(60), lt: daysAgo(30) } }, _sum: { grandTotal: true, amountCredited: true }, _count: true }),
      prisma.invoice.aggregate({ where: { status: { in: ISSUED }, date: { gte: daysAgo(90) } }, _sum: { grandTotal: true, amountCredited: true } }),
      prisma.payment.aggregate({ where: { paymentDate: { gte: daysAgo(90) }, invoice: { status: { not: 'CANCELLED' } } }, _sum: { amount: true } }),
      prisma.invoice.aggregate({ where: { status: { in: OPEN } }, _sum: { grandTotal: true, amountPaid: true, amountCredited: true }, _count: true }),
      prisma.invoice.findMany({
        where: { status: { in: OPEN }, dueDate: { lt: today0() } },
        select: { id: true, invoiceNumber: true, grandTotal: true, amountPaid: true, amountCredited: true, dueDate: true, customer: { select: { id: true, name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.$queryRaw<{ id: string; name: string; stock: number }[]>`
        SELECT id, name, stock FROM "Product" WHERE status = 'ACTIVE' AND stock <= "lowStockThreshold" ORDER BY stock ASC LIMIT 20`,
      prisma.inventoryItem.count({ where: { isActive: true } }),
      prisma.$queryRaw<{ id: string; name: string; stock: number; unit: string }[]>`
        SELECT id, name, "currentStock" AS stock, unit FROM "InventoryItem"
        WHERE "isActive" = true AND "currentStock" <= "reorderLevel" ORDER BY "currentStock" ASC LIMIT 20`,
      prisma.fulfillment.count({ where: { status: { in: ['PENDING', 'PACKING', 'PACKED'] }, createdAt: { lt: daysAgo(3) } } }),
      prisma.$queryRaw<{ id: string; name: string; ltv: number; orders: bigint; last_order: Date }[]>`
        SELECT c.id, c.name, SUM(i."grandTotal" - i."amountCredited")::float AS ltv, COUNT(i.id) AS orders, MAX(i.date) AS last_order
        FROM "Customer" c JOIN "Invoice" i ON i."customerId" = c.id
        WHERE i.status IN ('PENDING','PARTIAL','PAID')
        GROUP BY c.id, c.name`,
    ]);

  const [totalCustomers, openBills, overdueBills, pnl90] = await Promise.all([
    prisma.customer.count(),
    prisma.bill.aggregate({ where: { status: { in: OPEN } }, _sum: { grandTotal: true, amountPaid: true, amountDebited: true }, _count: true }),
    prisma.bill.findMany({
      where: { status: { in: OPEN }, dueDate: { lt: today0() } },
      select: { id: true, billNumber: true, grandTotal: true, amountPaid: true, amountDebited: true, dueDate: true, supplier: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 20,
    }),
    profitAndLoss(periodFor(daysAgo(90), new Date(Date.now() + 1000), 'last 90 days')),
  ]);
  const custStats = customers.map((c) => ({
    id: c.id,
    name: c.name,
    ltv: round2(n(c.ltv)),
    orders: Number(c.orders),
    daysSinceLast: Math.floor((Date.now() - new Date(c.last_order).getTime()) / DAY),
  }));
  const repeat = custStats.filter((c) => c.orders >= 2);
  const churnRisks = repeat.filter((c) => c.daysSinceLast > 60).sort((a, b) => b.ltv - a.ltv);
  const avgLtv = custStats.length ? custStats.reduce((s, c) => s + c.ltv, 0) / custStats.length : 0;
  const vips = custStats.filter((c) => c.ltv >= avgLtv * 2 && c.daysSinceLast <= 45).sort((a, b) => b.ltv - a.ltv);

  const rev30 = round2(n(last30._sum.grandTotal) - n(last30._sum.amountCredited));
  const revPrev30 = round2(n(prev30._sum.grandTotal) - n(prev30._sum.amountCredited));
  const invoiced90Net = n(invoiced90._sum.grandTotal) - n(invoiced90._sum.amountCredited);

  return {
    revenue: {
      last30Days: rev30,
      previous30Days: revPrev30,
      changePct: revPrev30 > 0 ? round2(((rev30 - revPrev30) / revPrev30) * 100) : null,
      invoicesLast30Days: last30._count,
      collectionRate90d: invoiced90Net > 0 ? round2(n(collected90._sum.amount) / invoiced90Net) : null,
    },
    receivables: {
      outstanding: round2(n(open._sum.grandTotal) - n(open._sum.amountPaid) - n(open._sum.amountCredited)),
      openInvoices: open._count,
      overdue: overdueList.map((o) => ({
        id: o.id,
        invoiceNumber: o.invoiceNumber,
        customer: o.customer.name,
        customerId: o.customer.id,
        balance: round2(o.grandTotal - o.amountPaid - o.amountCredited),
        daysOverdue: Math.floor((Date.now() - (o.dueDate?.getTime() ?? Date.now())) / DAY),
      })),
    },
    inventory: {
      activeProducts: products,
      lowStockProducts: lowProducts,
      materials,
      lowStockMaterials: lowMaterials,
    },
    payables: {
      owed: round2(n(openBills._sum.grandTotal) - n(openBills._sum.amountPaid) - n(openBills._sum.amountDebited)),
      openBills: openBills._count,
      overdue: overdueBills.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        supplier: b.supplier.name,
        balance: round2(b.grandTotal - b.amountPaid - b.amountDebited),
        daysOverdue: Math.floor((Date.now() - (b.dueDate?.getTime() ?? Date.now())) / DAY),
      })),
    },
    profit90d: {
      tracked: pnl90.purchases.bills + pnl90.expenses.count > 0,
      netSales: pnl90.income.net,
      purchases: pnl90.purchases.total,
      expenses: pnl90.expenses.total,
      netProfit: pnl90.netProfit,
      netMarginPct: pnl90.netMarginPct,
    },
    operations: { delayedFulfillments: pendingFulfillments },
    customers: {
      total: totalCustomers,
      buying: custStats.length,
      repeatRate: custStats.length ? round2(repeat.length / custStats.length) : null,
      averageLtv: round2(avgLtv),
      churnRisks: churnRisks.slice(0, 10),
      vips: vips.slice(0, 10),
    },
  };
}

export type Snapshot = Awaited<ReturnType<typeof getSnapshot>>;

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function scoreHealth(s: Snapshot) {
  const changePct = s.revenue.changePct;
  const revenueHealth = clamp(changePct === null ? (s.revenue.last30Days > 0 ? 75 : 50) : 75 + changePct / 2);
  const overdueAmount = s.receivables.overdue.reduce((t, o) => t + o.balance, 0);
  const overdueShare = s.receivables.outstanding > 0 ? overdueAmount / s.receivables.outstanding : 0;
  const cashFlowHealth = clamp(s.revenue.collectionRate90d === null ? 70 - overdueShare * 40 : s.revenue.collectionRate90d * 100 - overdueShare * 30);
  const lowShare =
    (s.inventory.lowStockProducts.length + s.inventory.lowStockMaterials.length) /
    Math.max(1, s.inventory.activeProducts + s.inventory.materials);
  const inventoryHealth = clamp(100 - lowShare * 150);
  const customerHealth = clamp(
    (s.customers.repeatRate === null ? 60 : 50 + s.customers.repeatRate * 50) - Math.min(30, s.customers.churnRisks.length * 5),
  );
  const operationsHealth = clamp(100 - s.operations.delayedFulfillments * 10);
  // With bills/expenses recorded, profit health follows the real 90-day net margin
  // (0% margin = 50, 25%+ = 100, -25% or worse = 0); otherwise it is estimated.
  const margin = s.profit90d.tracked ? s.profit90d.netMarginPct : null;
  const profitHealth = margin === null ? clamp((revenueHealth + cashFlowHealth) / 2) : clamp(50 + margin * 2);
  const overallScore = clamp(
    revenueHealth * 0.25 + cashFlowHealth * 0.25 + customerHealth * 0.2 + inventoryHealth * 0.15 + operationsHealth * 0.15,
  );
  return { overallScore, revenueHealth, profitHealth, inventoryHealth, customerHealth, operationsHealth, cashFlowHealth };
}

/** Rule-based risks & opportunities. Replaces the previous open items; user decisions are kept. */
export async function refreshInsights(s: Snapshot) {
  const settings = await getSettings();
  const cur = settings.currencySymbol;
  const risks: { title: string; description: string; category: string; severity: string; referenceType?: string; referenceId?: string }[] = [];
  const opps: { title: string; description: string; category: string; impact: string; referenceType?: string; referenceId?: string }[] = [];

  for (const o of s.receivables.overdue.slice(0, 5)) {
    risks.push({
      title: `${o.invoiceNumber} overdue by ${o.daysOverdue} days`,
      description: `${o.customer} owes ${cur}${o.balance.toFixed(2)}. Send a payment reminder.`,
      category: 'CASHFLOW',
      severity: o.daysOverdue > 30 ? 'HIGH' : 'MEDIUM',
      referenceType: 'INVOICE',
      referenceId: o.id,
    });
  }
  for (const p of s.inventory.lowStockProducts.slice(0, 5)) {
    risks.push({
      title: `${p.name} is ${p.stock <= 0 ? 'out of stock' : 'running low'}`,
      description: `Only ${p.stock} left. Plan a production batch before it blocks orders.`,
      category: 'INVENTORY',
      severity: p.stock <= 0 ? 'CRITICAL' : 'MEDIUM',
      referenceType: 'PRODUCT',
      referenceId: p.id,
    });
  }
  for (const m of s.inventory.lowStockMaterials.slice(0, 5)) {
    risks.push({
      title: `Material low: ${m.name}`,
      description: `${m.stock} ${m.unit} left (at or below reorder level). Raise a purchase order.`,
      category: 'SUPPLIER',
      severity: m.stock <= 0 ? 'HIGH' : 'MEDIUM',
      referenceType: 'INVENTORY',
      referenceId: m.id,
    });
  }
  for (const c of s.customers.churnRisks.slice(0, 3)) {
    risks.push({
      title: `${c.name} may be churning`,
      description: `Repeat buyer (${c.orders} orders, ${cur}${c.ltv.toFixed(0)} lifetime) with no order in ${c.daysSinceLast} days.`,
      category: 'CHURN',
      severity: 'MEDIUM',
      referenceType: 'CUSTOMER',
      referenceId: c.id,
    });
    opps.push({
      title: `Win back ${c.name}`,
      description: `Send a personal offer or new-arrivals note to re-engage a ${cur}${c.ltv.toFixed(0)} customer.`,
      category: 'RETENTION',
      impact: c.ltv > s.customers.averageLtv ? 'HIGH' : 'MEDIUM',
      referenceType: 'CUSTOMER',
      referenceId: c.id,
    });
  }
  if (s.revenue.changePct !== null && s.revenue.changePct <= -20) {
    risks.push({
      title: `Revenue down ${Math.abs(s.revenue.changePct)}% vs previous 30 days`,
      description: `Last 30 days: ${cur}${s.revenue.last30Days.toFixed(0)} vs ${cur}${s.revenue.previous30Days.toFixed(0)}.`,
      category: 'MARGIN',
      severity: s.revenue.changePct <= -40 ? 'HIGH' : 'MEDIUM',
    });
  }
  for (const v of s.customers.vips.slice(0, 3)) {
    opps.push({
      title: `Reward VIP ${v.name}`,
      description: `${cur}${v.ltv.toFixed(0)} lifetime value. Offer early access or a loyalty pack to deepen the relationship.`,
      category: 'SALES',
      impact: 'HIGH',
      referenceType: 'CUSTOMER',
      referenceId: v.id,
    });
  }
  for (const b of s.payables.overdue.slice(0, 3)) {
    risks.push({
      title: `Bill ${b.billNumber} to ${b.supplier} overdue by ${b.daysOverdue} days`,
      description: `${cur}${b.balance.toFixed(2)} is unpaid. Late supplier payments can cost you credit terms.`,
      category: 'SUPPLIER',
      severity: b.daysOverdue > 30 ? 'HIGH' : 'MEDIUM',
      referenceType: 'BILL',
      referenceId: b.id,
    });
  }
  if (s.profit90d.tracked && s.profit90d.netSales > 0 && s.profit90d.netProfit < 0) {
    risks.push({
      title: 'Running at a loss over the last 90 days',
      description: `Net sales ${cur}${s.profit90d.netSales.toFixed(0)} vs purchases ${cur}${s.profit90d.purchases.toFixed(0)} and expenses ${cur}${s.profit90d.expenses.toFixed(0)}. Review prices and the biggest expense categories.`,
      category: 'MARGIN',
      severity: 'HIGH',
    });
  }
  if (s.receivables.overdue.length >= 3) {
    opps.push({
      title: 'Run a collections sweep',
      description: `${s.receivables.overdue.length} invoices are overdue. Clearing them improves cash flow immediately.`,
      category: 'SALES',
      impact: 'HIGH',
    });
  }

  await prisma.$transaction([
    prisma.businessRisk.deleteMany({ where: { status: 'ACTIVE' } }),
    prisma.businessOpportunity.deleteMany({ where: { status: 'PENDING' } }),
    prisma.businessRisk.createMany({ data: risks }),
    prisma.businessOpportunity.createMany({ data: opps }),
  ]);
  return { risks: risks.length, opportunities: opps.length };
}

/** Least-squares trend over the last 6 months of collections. Cheap and explainable. */
export async function refreshForecast() {
  const rows = await prisma.$queryRaw<{ month: Date; collected: number; orders: bigint }[]>`
    WITH months AS (
      SELECT generate_series(date_trunc('month', now()) - interval '6 months', date_trunc('month', now()) - interval '1 month', interval '1 month') AS month
    )
    SELECT m.month,
      COALESCE((SELECT SUM(p.amount - p."tdsAmount") FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
                WHERE i.status <> 'CANCELLED' AND date_trunc('month', p."paymentDate") = m.month), 0)::float AS collected,
      (SELECT COUNT(*) FROM "Invoice" i WHERE i.status IN ('PENDING','PARTIAL','PAID') AND date_trunc('month', i.date) = m.month) AS orders
    FROM months m ORDER BY m.month`;

  const fit = (ys: number[]) => {
    const k = ys.length;
    const xs = ys.map((_, i) => i);
    const mx = xs.reduce((a, b) => a + b, 0) / k;
    const my = ys.reduce((a, b) => a + b, 0) / k;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const slope = sxx ? xs.reduce((a, x, i) => a + (x - mx) * ((ys[i] ?? 0) - my), 0) / sxx : 0;
    const intercept = my - slope * mx;
    const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0);
    const ssRes = ys.reduce((a, y, i) => a + (y - (intercept + slope * i)) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    return { next: Math.max(0, intercept + slope * k), slope, r2, mean: my };
  };

  const collected = rows.map((r) => n(r.collected));
  const orders = rows.map((r) => Number(r.orders));
  const active = collected.filter((v) => v > 0).length;
  const rev = fit(collected);
  const ord = fit(orders);
  // Confidence grows with data coverage and goodness of fit.
  const conf = (r2: number) => round2(Math.min(0.95, 0.3 + (active / 6) * 0.4 + Math.max(0, r2) * 0.25));
  const trend = (slope: number) => (slope > 0.5 ? 'upward' : slope < -0.5 ? 'downward' : 'flat');

  await prisma.forecast.deleteMany({});
  const data = [
    {
      type: 'REVENUE',
      timeframe: 'NEXT_30_DAYS',
      forecastValue: round2(rev.next),
      confidence: conf(rev.r2),
      logic: `Linear trend over the last 6 months of collections (avg ${rev.mean.toFixed(0)}/month, ${trend(rev.slope)} trend).`,
    },
    {
      type: 'ORDERS',
      timeframe: 'NEXT_30_DAYS',
      forecastValue: Math.round(ord.next),
      confidence: conf(ord.r2),
      logic: `Linear trend over monthly invoice counts (avg ${ord.mean.toFixed(1)}/month, ${trend(ord.slope)} trend).`,
    },
  ];
  await prisma.forecast.createMany({ data });
  return data;
}

function rulesBriefing(s: Snapshot, health: ReturnType<typeof scoreHealth>, cur: string) {
  const lines: string[] = ['# Daily Executive Briefing', ''];
  lines.push('## Financial Health');
  const change = s.revenue.changePct === null ? '' : ` (${s.revenue.changePct >= 0 ? '+' : ''}${s.revenue.changePct}% vs previous 30 days)`;
  lines.push(`- Invoiced in the last 30 days: **${cur}${s.revenue.last30Days.toFixed(2)}**${change}`);
  lines.push(`- Outstanding receivables: **${cur}${s.receivables.outstanding.toFixed(2)}** across ${s.receivables.openInvoices} invoices`);
  if (s.revenue.collectionRate90d !== null) lines.push(`- 90-day collection rate: ${(s.revenue.collectionRate90d * 100).toFixed(0)}%`);
  if (s.profit90d.tracked) {
    const m = s.profit90d.netMarginPct === null ? '' : ` (${s.profit90d.netMarginPct}% margin)`;
    lines.push(`- Net profit, last 90 days: **${cur}${s.profit90d.netProfit.toFixed(2)}**${m}`);
  }
  if (s.payables.openBills) lines.push(`- Owed to suppliers: **${cur}${s.payables.owed.toFixed(2)}** across ${s.payables.openBills} bills`);
  lines.push('', '## Operational Status');
  lines.push(`- Products low/out of stock: ${s.inventory.lowStockProducts.map((p) => `${p.name} (${p.stock})`).join(', ') || 'none'}`);
  lines.push(`- Materials at reorder level: ${s.inventory.lowStockMaterials.map((m) => m.name).join(', ') || 'none'}`);
  lines.push(`- Orders waiting more than 3 days to ship: ${s.operations.delayedFulfillments}`);
  lines.push('', '## Customer Intelligence');
  lines.push(`- ${s.customers.buying} buying customers, repeat rate ${s.customers.repeatRate === null ? 'n/a' : `${(s.customers.repeatRate * 100).toFixed(0)}%`}`);
  lines.push(`- VIPs: ${s.customers.vips.map((v) => v.name).join(', ') || 'none yet'}`);
  lines.push(`- Churn risks: ${s.customers.churnRisks.map((c) => c.name).join(', ') || 'none'}`);
  lines.push('', '## Recommended Actions');
  const actions: string[] = [];
  if (s.receivables.overdue.length) actions.push(`Chase ${s.receivables.overdue.length} overdue invoice(s), starting with ${s.receivables.overdue[0]?.invoiceNumber}.`);
  if (s.payables.overdue.length) actions.push(`Pay or reschedule ${s.payables.overdue.length} overdue supplier bill(s), starting with ${s.payables.overdue[0]?.billNumber} (${s.payables.overdue[0]?.supplier}).`);
  if (s.inventory.lowStockProducts.length) actions.push(`Schedule production for ${s.inventory.lowStockProducts[0]?.name}.`);
  if (s.inventory.lowStockMaterials.length) actions.push(`Raise a purchase order for ${s.inventory.lowStockMaterials[0]?.name}.`);
  if (s.customers.churnRisks.length) actions.push(`Reach out to ${s.customers.churnRisks[0]?.name} with a win-back offer.`);
  if (!actions.length) actions.push('All key indicators look healthy. Focus on acquiring new customers.');
  actions.slice(0, 3).forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  lines.push('', `_Overall health score: ${health.overallScore}/100_`);
  return lines.join('\n');
}

export async function runAnalysis() {
  const settings = await getSettings();
  const s = await getSnapshot();
  const health = scoreHealth(s);
  const [score, insights, forecasts] = await Promise.all([
    prisma.businessHealthScore.create({ data: health }),
    refreshInsights(s),
    refreshForecast(),
  ]);

  let content = rulesBriefing(s, health, settings.currencySymbol);
  let source = 'RULES';
  let aiError: string | null = null;
  if (await isAiEnabled()) {
    try {
      const ai = await generate({
        system:
          `You are the executive assistant for ${settings.businessName}, a small business using InWoice. ` +
          'Write a concise daily briefing in Markdown with exactly these sections: ' +
          '"# Daily Executive Briefing", "## Financial Health", "## Operational Status", "## Customer Intelligence", ' +
          '"## Recommended Actions" (2-3 specific numbered actions). Use only the numbers provided; never invent data. ' +
          `Currency symbol: ${settings.currencySymbol}. Keep it under 300 words.`,
        prompt: `Business snapshot (JSON):\n${JSON.stringify({ health, ...s })}`,
        maxTokens: 1500,
      });
      content = ai.text;
      source = ai.provider;
    } catch (err) {
      aiError = err instanceof Error ? err.message : String(err);
    }
  }
  const briefing = await prisma.executiveBriefing.create({
    data: { type: 'DAILY', content, source, metrics: JSON.stringify({ health, ...s }) },
  });
  return { healthScore: score, briefing, insights, forecasts, aiError };
}

export async function askBusiness(question: string) {
  const settings = await getSettings();
  const s = await getSnapshot();
  const dash = await getDashboard();
  const ai = await generate({
    system:
      `You are InWoice, the business assistant for ${settings.businessName}. Answer the owner's question using ONLY the ` +
      'data in the provided snapshot. If the data does not contain the answer, say so plainly and suggest where in the ' +
      `app to look. Be concise and specific; use Markdown. Currency symbol: ${settings.currencySymbol}. ` +
      'You cannot take actions; you may recommend them.',
    prompt: `Snapshot:\n${JSON.stringify({
      ...s,
      monthly: dash.monthly,
      topCustomers: dash.topCustomers,
      topProducts: dash.topProducts,
      kpis: dash.kpis,
    })}\n\nQuestion: ${question}`,
    maxTokens: 1500,
  });
  const { provider, model } = await getAiConfig();
  return { answer: ai.text, provider, model };
}
