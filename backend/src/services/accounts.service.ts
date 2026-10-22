import prisma from '../lib/prisma';
import { round2 } from '../lib/util';
import { ageingTotals, daysOverdue, pct, setOffItc, splitGst, type GstSplit } from '../lib/accounting';
import { balanceOf } from './invoice.service';
import { billBalance } from './bill.service';
import { buildGstReport, type Period } from './gst.service';

/**
 * Money reports: profit & loss, GSTR-3B summary, ageing of what is owed both ways, cash
 * in/out and the purchase register. Periods use server local time, like the GST reports.
 * Rows are fetched with narrow selects and summed in JS so month boundaries follow the
 * server time zone exactly; small-business volumes make this cheap.
 */

const ISSUED = ['PENDING', 'PARTIAL', 'PAID'];
const OPEN = ['PENDING', 'PARTIAL'];
const DAY = 86_400_000;

const inPeriod = (p: Period) => ({ gte: p.from, lt: p.to });
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Every month a period touches, in order ("2026-04", "2026-05", ...). */
export function monthsIn(p: Period): string[] {
  const out: string[] = [];
  const d = new Date(p.from.getFullYear(), p.from.getMonth(), 1);
  while (d < p.to && out.length < 120) {
    out.push(monthKey(d));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function periodFor(from: Date, to: Date, label: string): Period {
  return { from, to, label };
}

/** The current calendar month (server time). */
export function thisMonthPeriod(now = new Date()): Period {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return periodFor(from, new Date(from.getFullYear(), from.getMonth() + 1, 1), monthKey(from));
}

class Ledger {
  private m = new Map<string, number>();
  add(key: string, v: number) {
    this.m.set(key, round2((this.m.get(key) ?? 0) + v));
  }
  get(key: string) {
    return this.m.get(key) ?? 0;
  }
  rows() {
    return [...this.m.entries()].map(([category, amount]) => ({ category, amount })).filter((r) => Math.abs(r.amount) >= 0.005).sort((a, b) => b.amount - a.amount);
  }
  total() {
    return round2([...this.m.values()].reduce((s, v) => s + v, 0));
  }
}

// -----------------------------------------------------------------------------
// Profit & loss
// -----------------------------------------------------------------------------

/**
 * Management P&L. Amounts exclude GST you can claim back (it is neither income nor cost);
 * GST you can't claim is part of the cost. Purchases count in the month of the bill, net
 * of debit notes. When stock values were recorded at both ends of the period, the change
 * in stock is shown too, giving cost of goods sold = purchases - (closing - opening).
 */
export async function profitAndLoss(period: Period) {
  const [invoices, credits, bills, expenses, debits, stock] = await Promise.all([
    prisma.invoice.findMany({ where: { status: { in: ISSUED }, date: inPeriod(period) }, select: { date: true, subtotal: true, discount: true, shippingCost: true } }),
    prisma.creditNote.findMany({ where: { status: 'ISSUED', date: inPeriod(period) }, select: { date: true, taxableValue: true, shippingAmount: true } }),
    prisma.bill.findMany({
      where: { status: { not: 'CANCELLED' }, date: inPeriod(period) },
      select: { date: true, subtotal: true, discount: true, shippingCost: true, itcEligible: true, items: { select: { category: true, total: true, taxAmount: true } } },
    }),
    prisma.expense.findMany({ where: { date: inPeriod(period) }, select: { date: true, category: true, amount: true, taxAmount: true, itcEligible: true } }),
    prisma.debitNote.findMany({
      where: { status: 'ISSUED', date: inPeriod(period) },
      select: { date: true, bill: { select: { itcEligible: true } }, items: { select: { taxableValue: true, taxAmount: true, billItem: { select: { category: true } } } } },
    }),
    stockChange(period),
  ]);

  const months = new Map(monthsIn(period).map((k) => [k, { month: k, income: 0, purchases: 0, expenses: 0, profit: 0 }]));
  const bump = (d: Date, field: 'income' | 'purchases' | 'expenses', v: number) => {
    const row = months.get(monthKey(d));
    if (row) row[field] = round2(row[field] + v);
  };

  let sales = 0;
  let shipping = 0;
  for (const i of invoices) {
    sales += i.subtotal - i.discount;
    shipping += i.shippingCost;
    bump(i.date, 'income', i.subtotal - i.discount + i.shippingCost);
  }
  let creditNotes = 0;
  for (const c of credits) {
    creditNotes += c.taxableValue + c.shippingAmount;
    bump(c.date, 'income', -(c.taxableValue + c.shippingAmount));
  }

  const purchases = new Ledger();
  for (const b of bills) {
    const ratio = b.subtotal > 0 ? (b.subtotal - b.discount) / b.subtotal : 0;
    let billCost = 0;
    for (const it of b.items) {
      const cost = it.total * ratio + (b.itcEligible ? 0 : it.taxAmount);
      purchases.add(it.category, cost);
      billCost += cost;
    }
    if (b.shippingCost > 0) purchases.add('Freight on purchases', b.shippingCost);
    bump(b.date, 'purchases', billCost + b.shippingCost);
  }
  // Debit notes (returns to suppliers) reduce purchases under the line's own category.
  for (const d of debits) {
    let back = 0;
    for (const it of d.items) {
      const value = it.taxableValue + (d.bill.itcEligible ? 0 : it.taxAmount);
      purchases.add(it.billItem.category, -value);
      back += value;
    }
    bump(d.date, 'purchases', -back);
  }

  const spend = new Ledger();
  for (const e of expenses) {
    const cost = e.amount + (e.itcEligible ? 0 : e.taxAmount);
    spend.add(e.category, cost);
    bump(e.date, 'expenses', cost);
  }

  const netSales = round2(sales + shipping - creditNotes);
  const purchasesTotal = purchases.total();
  const expensesTotal = spend.total();
  const grossProfit = round2(netSales - purchasesTotal);
  const netProfit = round2(grossProfit - expensesTotal);

  return {
    period: { label: period.label, from: period.from, to: new Date(period.to.getTime() - 1) },
    income: { sales: round2(sales), shipping: round2(shipping), creditNotes: round2(creditNotes), net: netSales, invoices: invoices.length },
    purchases: { rows: purchases.rows(), total: purchasesTotal, bills: bills.length },
    grossProfit,
    grossMarginPct: pct(grossProfit, netSales),
    expenses: { rows: spend.rows(), total: expensesTotal, count: expenses.length },
    netProfit,
    netMarginPct: pct(netProfit, netSales),
    // Null when stock values weren't recorded at both ends of the period.
    stock: stock ? { ...stock, costOfSales: round2(purchasesTotal - stock.change), netProfitAfterStock: round2(netProfit + stock.change) } : null,
    debitNotes: debits.length,
    months: [...months.values()].map((m) => ({ ...m, profit: round2(m.income - m.purchases - m.expenses) })),
  };
}

// -----------------------------------------------------------------------------
// Stock valuation
// -----------------------------------------------------------------------------

/** Stock at cost right now: materials (stock x cost per unit) and finished goods (stock x cost price). */
export async function stockValueNow() {
  const [[m], [p]] = await Promise.all([
    prisma.$queryRaw<{ v: number | null }[]>`SELECT SUM(GREATEST("currentStock", 0) * "costPerUnit")::float AS v FROM "InventoryItem"`,
    prisma.$queryRaw<{ v: number | null }[]>`SELECT SUM(GREATEST(stock, 0) * "costPrice")::float AS v FROM "Product"`,
  ]);
  const materialsValue = round2(m?.v ?? 0);
  const productsValue = round2(p?.v ?? 0);
  return { materialsValue, productsValue, total: round2(materialsValue + productsValue) };
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Record today's stock value (once a day, from the scheduler or on demand). */
export async function takeStockSnapshot(now = new Date()) {
  const date = dayStart(now);
  const v = await stockValueNow();
  return prisma.stockSnapshot.upsert({ where: { date }, update: v, create: { date, ...v } });
}

/**
 * Stock value at the start of a day: the snapshot taken that day, or the closest one in the
 * three days before it. The start of today (or later) uses the live value.
 */
async function stockOn(day: Date) {
  if (day >= dayStart(new Date())) return (await stockValueNow()).total;
  const snap = await prisma.stockSnapshot.findFirst({ where: { date: { lte: day, gte: new Date(day.getTime() - 3 * 86_400_000) } }, orderBy: { date: 'desc' } });
  return snap ? snap.total : null;
}

async function stockChange(period: Period) {
  const [opening, closing] = await Promise.all([stockOn(period.from), stockOn(period.to)]);
  if (opening === null || closing === null) return null;
  return { opening: round2(opening), closing: round2(closing), change: round2(closing - opening) };
}

export type ProfitAndLoss = Awaited<ReturnType<typeof profitAndLoss>>;

export function pnlCsv(p: ProfitAndLoss) {
  const rows: Record<string, unknown>[] = [
    { section: 'Income', line: 'Sales (before GST)', amount: p.income.sales },
    { section: 'Income', line: 'Shipping charged', amount: p.income.shipping },
    { section: 'Income', line: 'Less: credit notes', amount: -p.income.creditNotes },
    { section: 'Income', line: 'Net sales', amount: p.income.net },
    ...p.purchases.rows.map((r) => ({ section: 'Purchases', line: r.category, amount: -r.amount })),
    { section: 'Purchases', line: 'Total purchases', amount: -p.purchases.total },
    { section: 'Gross profit', line: 'Gross profit', amount: p.grossProfit },
    ...p.expenses.rows.map((r) => ({ section: 'Expenses', line: r.category, amount: -r.amount })),
    { section: 'Expenses', line: 'Total expenses', amount: -p.expenses.total },
    { section: 'Net profit', line: 'Net profit', amount: p.netProfit },
  ];
  return { columns: ['section', 'line', 'amount'], rows };
}

// -----------------------------------------------------------------------------
// GSTR-3B
// -----------------------------------------------------------------------------

const zero = (): GstSplit & { taxable: number } => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
const addTo = (t: GstSplit & { taxable: number }, s: Partial<GstSplit & { taxable: number }>, sign = 1) => {
  t.taxable = round2(t.taxable + sign * (s.taxable ?? 0));
  t.igst = round2(t.igst + sign * (s.igst ?? 0));
  t.cgst = round2(t.cgst + sign * (s.cgst ?? 0));
  t.sgst = round2(t.sgst + sign * (s.sgst ?? 0));
};

/**
 * GSTR-3B summary: outward tax (from the same data as GSTR-1), input tax credit from bills
 * and expenses, and the cash payable after the legal set-off order.
 */
export async function gstr3b(period: Period) {
  const sumWhere = { igst: true, cgst: true, sgst: true, taxAmount: true } as const;
  const [r, billItc, billBlocked, expItc, expBlocked, debitItc] = await Promise.all([
    buildGstReport(period),
    prisma.bill.aggregate({ where: { status: { not: 'CANCELLED' }, itcEligible: true, date: inPeriod(period) }, _sum: sumWhere, _count: true }),
    prisma.bill.aggregate({ where: { status: { not: 'CANCELLED' }, itcEligible: false, taxAmount: { gt: 0 }, date: inPeriod(period) }, _sum: sumWhere }),
    prisma.expense.aggregate({ where: { itcEligible: true, date: inPeriod(period) }, _sum: sumWhere, _count: true }),
    prisma.expense.aggregate({ where: { itcEligible: false, taxAmount: { gt: 0 }, date: inPeriod(period) }, _sum: sumWhere }),
    // Supplier debit notes in the period reduce the credit you can claim.
    prisma.debitNote.aggregate({ where: { status: 'ISSUED', date: inPeriod(period), bill: { itcEligible: true } }, _sum: sumWhere, _count: true }),
  ]);

  // 3.1(a) taxable outward supplies and 3.1(c) nil-rated, net of credit notes (HSN rows already are).
  const outward = zero();
  const nilRated = zero();
  for (const h of r.hsn) addTo(h.rate > 0 ? outward : nilRated, h);

  // 3.2 inter-state supplies to unregistered persons, by place of supply.
  const inter = new Map<string, { placeOfSupply: string; taxable: number; igst: number }>();
  const interAdd = (pos: string, taxable: number, igst: number, sign = 1) => {
    const row = inter.get(pos) ?? { placeOfSupply: pos, taxable: 0, igst: 0 };
    row.taxable = round2(row.taxable + sign * taxable);
    row.igst = round2(row.igst + sign * igst);
    inter.set(pos, row);
  };
  r.b2cl.forEach((x) => interAdd(x.placeOfSupply, x.taxable, x.igst));
  r.b2cs.filter((x) => x.igst !== 0).forEach((x) => interAdd(x.placeOfSupply, x.taxable, x.igst));
  r.cdnur.forEach((x) => interAdd(x.placeOfSupply, x.taxable, x.igst, -1));

  const split = (a: { _sum: { igst: number | null; cgst: number | null; sgst: number | null } }): GstSplit => ({
    igst: round2(a._sum.igst ?? 0),
    cgst: round2(a._sum.cgst ?? 0),
    sgst: round2(a._sum.sgst ?? 0),
  });
  const billsGross = split(billItc);
  const reversed = split(debitItc);
  const fromBills = { igst: round2(billsGross.igst - reversed.igst), cgst: round2(billsGross.cgst - reversed.cgst), sgst: round2(billsGross.sgst - reversed.sgst) };
  const fromExpenses = split(expItc);
  const itc = { igst: round2(fromBills.igst + fromExpenses.igst), cgst: round2(fromBills.cgst + fromExpenses.cgst), sgst: round2(fromBills.sgst + fromExpenses.sgst) };
  const blockedB = split(billBlocked);
  const blockedE = split(expBlocked);
  const ineligible = { igst: round2(blockedB.igst + blockedE.igst), cgst: round2(blockedB.cgst + blockedE.cgst), sgst: round2(blockedB.sgst + blockedE.sgst) };
  const output = { igst: outward.igst, cgst: outward.cgst, sgst: outward.sgst };
  const total = (s: GstSplit) => round2(s.igst + s.cgst + s.sgst);

  return {
    period: r.period,
    business: r.business,
    outward: { ...outward, totalTax: total(outward) },
    nilRated: { taxable: nilRated.taxable },
    interStateUnregistered: [...inter.values()].filter((x) => Math.abs(x.taxable) >= 0.005).sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply)),
    itc: {
      fromBills: { ...fromBills, documents: billItc._count, debitNotes: debitItc._count, reversed },
      fromExpenses: { ...fromExpenses, documents: expItc._count },
      total: { ...itc, totalTax: total(itc) },
    },
    ineligibleItc: { ...ineligible, totalTax: total(ineligible) },
    ...setOffItc(output, itc),
    warnings: [
      ...r.warnings,
      ...(total(itc) > 0 ? ['Match the input tax credit with your GSTR-2B before filing. Only claim credit the supplier has reported.'] : []),
    ],
  };
}

// -----------------------------------------------------------------------------
// Ageing: who owes you, and whom you owe
// -----------------------------------------------------------------------------

interface OpenDoc {
  id: string;
  number: string;
  date: Date;
  dueDate: Date | null;
  balance: number;
  party: { id: string; name: string };
}

function ageingOf(docs: OpenDoc[], now: Date) {
  const byParty = new Map<string, { id: string; name: string; docs: OpenDoc[] }>();
  for (const d of docs) {
    const p = byParty.get(d.party.id) ?? { id: d.party.id, name: d.party.name, docs: [] };
    p.docs.push(d);
    byParty.set(d.party.id, p);
  }
  return {
    ...ageingTotals(docs, now),
    count: docs.length,
    parties: [...byParty.values()]
      .map((p) => ({ id: p.id, name: p.name, documents: p.docs.length, ...ageingTotals(p.docs, now) }))
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total)
      .slice(0, 50),
    oldest: docs
      .filter((d) => daysOverdue(d.dueDate, now) > 0)
      .sort((a, b) => daysOverdue(b.dueDate, now) - daysOverdue(a.dueDate, now))
      .slice(0, 10)
      .map((d) => ({ id: d.id, number: d.number, party: d.party.name, balance: d.balance, dueDate: d.dueDate, daysOverdue: daysOverdue(d.dueDate, now) })),
  };
}

export async function ageing(now = new Date()) {
  const [invoices, bills] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: OPEN } },
      select: { id: true, invoiceNumber: true, date: true, dueDate: true, grandTotal: true, amountPaid: true, amountCredited: true, customer: { select: { id: true, name: true } } },
    }),
    prisma.bill.findMany({
      where: { status: { in: OPEN } },
      select: { id: true, billNumber: true, date: true, dueDate: true, grandTotal: true, amountPaid: true, amountDebited: true, supplier: { select: { id: true, name: true } } },
    }),
  ]);
  const rec: OpenDoc[] = invoices
    .map((i) => ({ id: i.id, number: i.invoiceNumber, date: i.date, dueDate: i.dueDate, balance: balanceOf(i), party: i.customer }))
    .filter((d) => d.balance > 0);
  const pay: OpenDoc[] = bills
    .map((b) => ({ id: b.id, number: b.billNumber, date: b.date, dueDate: b.dueDate, balance: billBalance(b), party: b.supplier }))
    .filter((d) => d.balance > 0);
  return { asOf: now, receivables: ageingOf(rec, now), payables: ageingOf(pay, now) };
}

// -----------------------------------------------------------------------------
// Cash in / out
// -----------------------------------------------------------------------------

export async function cashSummary(period: Period, now = new Date()) {
  const [received, paidOut, expenses, openInvoices, openBills] = await Promise.all([
    prisma.payment.findMany({ where: { paymentDate: inPeriod(period), invoice: { status: { not: 'CANCELLED' } } }, select: { paymentDate: true, amount: true, tdsAmount: true } }),
    prisma.billPayment.findMany({ where: { paymentDate: inPeriod(period), bill: { status: { not: 'CANCELLED' } } }, select: { paymentDate: true, amount: true, tdsAmount: true } }),
    prisma.expense.findMany({ where: { date: inPeriod(period) }, select: { date: true, total: true } }),
    prisma.invoice.findMany({ where: { status: { in: OPEN } }, select: { dueDate: true, grandTotal: true, amountPaid: true, amountCredited: true } }),
    prisma.bill.findMany({ where: { status: { in: OPEN } }, select: { dueDate: true, grandTotal: true, amountPaid: true, amountDebited: true } }),
  ]);

  const months = new Map(monthsIn(period).map((k) => [k, { month: k, moneyIn: 0, supplierPayments: 0, expenses: 0, net: 0 }]));
  const bump = (d: Date, field: 'moneyIn' | 'supplierPayments' | 'expenses', v: number) => {
    const row = months.get(monthKey(d));
    if (row) row[field] = round2(row[field] + v);
  };
  // Cash only: TDS deducted (by customers, or by you from suppliers) never passes through the bank.
  const cash = (p: { amount: number; tdsAmount: number }) => p.amount - p.tdsAmount;
  received.forEach((p) => bump(p.paymentDate, 'moneyIn', cash(p)));
  paidOut.forEach((p) => bump(p.paymentDate, 'supplierPayments', cash(p)));
  expenses.forEach((e) => bump(e.date, 'expenses', e.total));

  const sum = (xs: number[]) => round2(xs.reduce((s, v) => s + v, 0));
  const moneyIn = sum(received.map(cash));
  const supplierPayments = sum(paidOut.map(cash));
  const expensesPaid = sum(expenses.map((e) => e.total));

  // What falls due soon (by due date; documents without one count as due now).
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = (rows: { dueDate: Date | null; balance: number }[]) => {
    const within = (days: number) => sum(rows.filter((r) => !r.dueDate || r.dueDate < new Date(today.getTime() + (days + 1) * DAY)).map((r) => r.balance));
    return { overdue: sum(rows.filter((r) => daysOverdue(r.dueDate, now) > 0).map((r) => r.balance)), next7Days: within(7), next30Days: within(30), total: sum(rows.map((r) => r.balance)) };
  };

  return {
    period: { label: period.label, from: period.from, to: new Date(period.to.getTime() - 1) },
    moneyIn,
    moneyOut: { supplierPayments, expenses: expensesPaid, total: round2(supplierPayments + expensesPaid) },
    net: round2(moneyIn - supplierPayments - expensesPaid),
    months: [...months.values()].map((m) => ({ ...m, net: round2(m.moneyIn - m.supplierPayments - m.expenses) })),
    upcoming: {
      toReceive: due(openInvoices.map((i) => ({ dueDate: i.dueDate, balance: balanceOf(i) }))),
      toPay: due(openBills.map((b) => ({ dueDate: b.dueDate, balance: billBalance(b) }))),
    },
  };
}

// -----------------------------------------------------------------------------
// Purchase register (bills + expenses, line level) for the accountant / GSTR-2B matching
// -----------------------------------------------------------------------------

export async function purchaseRegister(period: Period) {
  const [bills, expenses] = await Promise.all([
    prisma.bill.findMany({
      where: { status: { not: 'CANCELLED' }, date: inPeriod(period) },
      include: { supplier: true, items: true, purchaseOrder: { select: { poNumber: true } } },
      orderBy: [{ date: 'asc' }, { billNumber: 'asc' }],
    }),
    prisma.expense.findMany({ where: { date: inPeriod(period) }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  const debits = await prisma.debitNote.findMany({
    where: { status: 'ISSUED', date: inPeriod(period) },
    include: { supplier: true, bill: { select: { billNumber: true, itcEligible: true } }, items: { include: { billItem: { select: { category: true, hsnCode: true } } } } },
    orderBy: [{ date: 'asc' }, { debitNoteNumber: 'asc' }],
  });
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rows: Record<string, unknown>[] = [];
  for (const b of bills) {
    const ratio = b.subtotal > 0 ? (b.subtotal - b.discount) / b.subtotal : 0;
    const inter = b.igst > 0;
    for (const it of b.items) {
      const taxable = round2(it.total * ratio);
      const s = splitGst(it.taxAmount, inter);
      rows.push({
        document: 'Bill', number: b.billNumber, date: day(b.date), party: b.supplier.name, gstin: b.supplier.gst ?? '', item: it.description, category: it.category,
        hsn: it.hsnCode ?? '', quantity: it.quantity, unitPrice: it.unitPrice, taxRate: it.taxRate, taxableValue: taxable, cgst: s.cgst, sgst: s.sgst, igst: s.igst,
        total: round2(taxable + it.taxAmount), itcEligible: b.itcEligible ? 'Y' : 'N', reference: b.purchaseOrder?.poNumber ?? '',
      });
    }
    if (b.shippingCost > 0) {
      rows.push({
        document: 'Bill', number: b.billNumber, date: day(b.date), party: b.supplier.name, gstin: b.supplier.gst ?? '', item: 'Freight / shipping', category: 'Freight on purchases',
        hsn: '', quantity: 1, unitPrice: b.shippingCost, taxRate: 0, taxableValue: b.shippingCost, cgst: 0, sgst: 0, igst: 0, total: b.shippingCost, itcEligible: 'N', reference: b.purchaseOrder?.poNumber ?? '',
      });
    }
  }
  for (const d of debits) {
    for (const it of d.items) {
      const s = splitGst(it.taxAmount, d.igst > 0);
      rows.push({
        document: 'Debit note', number: d.debitNoteNumber, date: day(d.date), party: d.supplier.name, gstin: d.supplier.gst ?? '', item: it.description, category: it.billItem.category,
        hsn: it.billItem.hsnCode ?? '', quantity: -it.quantity, unitPrice: '', taxRate: it.taxRate, taxableValue: -it.taxableValue, cgst: -s.cgst, sgst: -s.sgst, igst: -s.igst,
        total: -round2(it.taxableValue + it.taxAmount), itcEligible: d.bill.itcEligible ? 'Y' : 'N', reference: d.bill.billNumber,
      });
    }
  }
  for (const e of expenses) {
    rows.push({
      document: 'Expense', number: e.referenceId ?? '', date: day(e.date), party: e.vendor ?? '', gstin: e.vendorGstin ?? '', item: e.description, category: e.category,
      hsn: '', quantity: 1, unitPrice: e.amount, taxRate: e.taxRate, taxableValue: e.amount, cgst: e.cgst, sgst: e.sgst, igst: e.igst, total: e.total,
      itcEligible: e.itcEligible ? 'Y' : 'N', reference: e.paymentMethod,
    });
  }
  return {
    columns: ['document', 'number', 'date', 'party', 'gstin', 'item', 'category', 'hsn', 'quantity', 'unitPrice', 'taxRate', 'taxableValue', 'cgst', 'sgst', 'igst', 'total', 'itcEligible', 'reference'],
    rows,
  };
}

// -----------------------------------------------------------------------------
// TDS
// -----------------------------------------------------------------------------

/**
 * TDS for the period: what customers deducted from what they paid you (claim it against
 * your income tax; check Form 26AS), and what you deducted from supplier payments
 * (deposit it by the 7th of next month and file the quarterly return).
 */
export async function tdsSummary(period: Period) {
  const [received, deducted] = await Promise.all([
    prisma.payment.findMany({
      where: { tdsAmount: { gt: 0 }, paymentDate: inPeriod(period), invoice: { status: { not: 'CANCELLED' } } },
      select: { paymentDate: true, amount: true, tdsAmount: true, invoice: { select: { invoiceNumber: true, customer: { select: { name: true, gstin: true } } } } },
      orderBy: { paymentDate: 'asc' },
    }),
    prisma.billPayment.findMany({
      where: { tdsAmount: { gt: 0 }, paymentDate: inPeriod(period), bill: { status: { not: 'CANCELLED' } } },
      select: { paymentDate: true, amount: true, tdsAmount: true, tdsSection: true, bill: { select: { billNumber: true, supplier: { select: { name: true, gst: true } } } } },
      orderBy: { paymentDate: 'asc' },
    }),
  ]);
  const bySection = new Map<string, { section: string; payments: number; amount: number; tds: number }>();
  const byMonth = new Map<string, number>();
  for (const d of deducted) {
    const sec = d.tdsSection || 'Not set';
    const row = bySection.get(sec) ?? { section: sec, payments: 0, amount: 0, tds: 0 };
    row.payments++;
    row.amount = round2(row.amount + d.amount);
    row.tds = round2(row.tds + d.tdsAmount);
    bySection.set(sec, row);
    byMonth.set(monthKey(d.paymentDate), round2((byMonth.get(monthKey(d.paymentDate)) ?? 0) + d.tdsAmount));
  }
  const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));
  return {
    period: { label: period.label, from: period.from, to: new Date(period.to.getTime() - 1) },
    receivable: {
      total: sum(received.map((r) => r.tdsAmount)),
      rows: received.map((r) => ({ date: r.paymentDate, customer: r.invoice.customer.name, invoice: r.invoice.invoiceNumber, settled: r.amount, tds: r.tdsAmount })),
    },
    payable: {
      total: sum(deducted.map((d) => d.tdsAmount)),
      bySection: [...bySection.values()].sort((a, b) => b.tds - a.tds),
      // Deposit by the 7th of the following month.
      byMonth: [...byMonth.entries()].map(([month, tds]) => ({ month, tds })),
      rows: deducted.map((d) => ({ date: d.paymentDate, supplier: d.bill.supplier.name, bill: d.bill.billNumber, section: d.tdsSection, settled: d.amount, tds: d.tdsAmount })),
    },
  };
}
