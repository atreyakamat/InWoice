import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { round2 } from '../lib/util';
import { addPayment, balanceOf } from './invoice.service';
import { addBillPayment, billBalance } from './bill.service';
import { createExpense } from './expense.service';

/**
 * Bank reconciliation: import a statement (CSV from net banking), then match each line
 * to what is already in InWoice: customer payments, supplier payments, expenses. Clear
 * one-to-one matches are made automatically; the rest get suggestions (open invoices or
 * bills of the same amount) that create the payment in one click.
 */

// --- CSV --------------------------------------------------------------------------------

/** Minimal RFC 4180 CSV parser (quotes, commas and new lines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

export interface Mapping {
  headerRow: number;
  date: number;
  description: number;
  reference?: number | null;
  debit?: number | null;
  credit?: number | null;
  amount?: number | null; // one signed column (or with Dr/Cr)
  balance?: number | null;
  dateOrder: 'DMY' | 'MDY' | 'YMD';
}

const find = (headers: string[], re: RegExp, not?: RegExp) => {
  const i = headers.findIndex((h) => re.test(h) && !(not && not.test(h)));
  return i >= 0 ? i : null;
};

/** Guess which columns hold what, for HDFC, SBI, ICICI, Axis, Kotak and most other exports. */
export function guessMapping(rows: string[][]): Mapping | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const h = rows[r]!.map((c) => c.toLowerCase().replace(/\s+/g, ' '));
    const date = find(h, /(^|\b)(txn|tran|transaction|posting)?\.? ?date\b|^date$/, /value/) ?? find(h, /date/);
    const description = find(h, /narration|description|particulars|remarks|details/);
    if (date === null || description === null) continue;
    return {
      headerRow: r,
      date,
      description,
      reference: find(h, /ref|chq|cheque|utr/),
      debit: find(h, /withdrawal|debit|^dr\b|paid out/),
      credit: find(h, /deposit|credit|^cr\b|paid in/),
      amount: find(h, /^amount|txn amount|transaction amount/),
      balance: find(h, /balance|^bal\b/),
      dateOrder: 'DMY',
    };
  }
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** 31/10/2026, 31-10-26, 31-Oct-2026, 31 Oct 2026, 2026-10-31 (local dates). */
export function parseBankDate(raw: string, order: Mapping['dateOrder'] = 'DMY'): Date | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[A-Za-z]*[-/. ,]+(\d{2,4})/);
  if (m) {
    const mon = MONTHS.indexOf(m[2]!.toLowerCase());
    if (mon < 0) return null;
    const y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!;
    return new Date(y, mon, +m[1]!);
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!;
    const [d, mo] = order === 'MDY' ? [+m[2]!, +m[1]!] : [+m[1]!, +m[2]!];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(y, mo - 1, d);
  }
  return null;
}

/** "1,23,456.50", "₹ 500", "(250.00)", "1,000.00 Dr" → number (Dr / brackets negative). */
export function parseBankAmount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (!s || s === '-') return null;
  const negative = /\bdr\b|^\(.*\)$|^-/i.test(s);
  const n = Number(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || s.replace(/[^\d]/g, '') === '') return null;
  return round2(negative ? -n : n);
}

export interface StatementLine {
  date: Date;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
}

export function readStatement(rows: string[][], map: Mapping): { lines: StatementLine[]; skipped: number } {
  const lines: StatementLine[] = [];
  let skipped = 0;
  for (const r of rows.slice(map.headerRow + 1)) {
    const date = parseBankDate(r[map.date] ?? '', map.dateOrder);
    const description = (r[map.description] ?? '').replace(/\s+/g, ' ').trim();
    let amount: number | null = null;
    if (map.amount !== null && map.amount !== undefined) {
      amount = parseBankAmount(r[map.amount]);
      // A separate Dr/Cr column next to the amount.
      const type = r.find((c) => /^(dr|cr|debit|credit)$/i.test(c));
      if (amount !== null && type && /^d/i.test(type)) amount = -Math.abs(amount);
    } else {
      const dr = parseBankAmount(r[map.debit ?? -1]);
      const cr = parseBankAmount(r[map.credit ?? -1]);
      if (dr !== null || cr !== null) amount = round2(Math.abs(cr ?? 0) - Math.abs(dr ?? 0));
    }
    if (!date || !description || amount === null || amount === 0) {
      skipped++; // headers repeated mid-file, opening balance rows, totals, blank lines
      continue;
    }
    lines.push({
      date,
      description,
      reference: (map.reference !== null && map.reference !== undefined ? r[map.reference] : '')?.trim() || null,
      amount,
      balance: map.balance !== null && map.balance !== undefined ? parseBankAmount(r[map.balance]) : null,
    });
  }
  return { lines, skipped };
}

export const mappingInput = z.object({
  headerRow: z.coerce.number().int().min(0),
  date: z.coerce.number().int().min(0),
  description: z.coerce.number().int().min(0),
  reference: z.coerce.number().int().min(0).nullable().optional(),
  debit: z.coerce.number().int().min(0).nullable().optional(),
  credit: z.coerce.number().int().min(0).nullable().optional(),
  amount: z.coerce.number().int().min(0).nullable().optional(),
  balance: z.coerce.number().int().min(0).nullable().optional(),
  dateOrder: z.enum(['DMY', 'MDY', 'YMD']).default('DMY'),
});

export function previewStatement(csv: string) {
  const rows = parseCsv(csv);
  if (!rows.length) throw badRequest('That file is empty');
  const mapping = guessMapping(rows);
  const sample = mapping ? readStatement(rows.slice(0, mapping.headerRow + 11), mapping).lines : [];
  return { headers: mapping ? rows[mapping.headerRow] : rows[0], rows: rows.slice(0, 40), mapping, sample };
}

const lineHash = (account: string, l: StatementLine) =>
  crypto.createHash('sha256').update([account, l.date.toISOString().slice(0, 10), l.amount.toFixed(2), l.description.toLowerCase(), l.balance ?? ''].join('|')).digest('hex');

export async function importStatement(csv: string, mapping: Mapping, account = 'Main') {
  const rows = parseCsv(csv);
  const { lines, skipped } = readStatement(rows, mapping);
  if (!lines.length) throw badRequest('No transactions found. Check which columns hold the date, description and amounts.');
  const batch = crypto.randomUUID();
  const { count } = await prisma.bankTransaction.createMany({
    data: lines.map((l) => ({ ...l, account, hash: lineHash(account, l), importBatch: batch })),
    skipDuplicates: true,
  });
  const matched = await autoMatch();
  return { imported: count, duplicates: lines.length - count, skipped, matched };
}

// --- Matching ---------------------------------------------------------------------------

const WINDOW = 7 * 86_400_000;
const near = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) <= WINDOW;
const cash = (p: { amount: number; tdsAmount: number }) => round2(p.amount - p.tdsAmount);

export interface Suggestion {
  type: 'PAYMENT' | 'BILL_PAYMENT' | 'EXPENSE' | 'INVOICE' | 'BILL';
  id: string;
  label: string;
  amount: number;
  date: Date;
}

/** Candidates for one bank line: existing unreconciled records first, then open documents. */
export async function suggestionsFor(t: { amount: number; date: Date; description: string }): Promise<Suggestion[]> {
  const from = new Date(t.date.getTime() - WINDOW);
  const to = new Date(t.date.getTime() + WINDOW);
  const amt = Math.abs(t.amount);
  const text = t.description.toLowerCase();
  const out: Suggestion[] = [];
  if (t.amount > 0) {
    const payments = await prisma.payment.findMany({
      where: { reconciled: false, paymentDate: { gte: from, lte: to }, invoice: { status: { not: 'CANCELLED' } } },
      include: { invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } } },
    });
    for (const p of payments.filter((p) => Math.abs(cash(p) - amt) < 0.01)) {
      out.push({ type: 'PAYMENT', id: p.id, label: `Payment for ${p.invoice.invoiceNumber} (${p.invoice.customer.name})`, amount: cash(p), date: p.paymentDate });
    }
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] } },
      select: { id: true, invoiceNumber: true, date: true, grandTotal: true, amountPaid: true, amountCredited: true, customer: { select: { name: true } } },
    });
    for (const i of invoices) {
      const bal = balanceOf(i);
      if (Math.abs(bal - amt) < 0.01 || (text.includes(i.invoiceNumber.toLowerCase()) && amt <= bal + 0.01)) {
        out.push({ type: 'INVOICE', id: i.id, label: `${i.invoiceNumber} · ${i.customer.name} (balance ${bal.toFixed(2)})`, amount: bal, date: i.date });
      }
    }
  } else {
    const [billPayments, expenses, bills] = await Promise.all([
      prisma.billPayment.findMany({
        where: { reconciled: false, paymentDate: { gte: from, lte: to }, bill: { status: { not: 'CANCELLED' } } },
        include: { bill: { select: { billNumber: true, supplier: { select: { name: true } } } } },
      }),
      prisma.expense.findMany({ where: { reconciled: false, date: { gte: from, lte: to } } }),
      prisma.bill.findMany({
        where: { status: { in: ['PENDING', 'PARTIAL'] } },
        select: { id: true, billNumber: true, date: true, grandTotal: true, amountPaid: true, amountDebited: true, supplier: { select: { name: true } } },
      }),
    ]);
    for (const p of billPayments.filter((p) => Math.abs(cash(p) - amt) < 0.01)) {
      out.push({ type: 'BILL_PAYMENT', id: p.id, label: `Payment of bill ${p.bill.billNumber} (${p.bill.supplier.name})`, amount: cash(p), date: p.paymentDate });
    }
    for (const e of expenses.filter((e) => Math.abs(e.total - amt) < 0.01)) {
      out.push({ type: 'EXPENSE', id: e.id, label: `Expense: ${e.description} (${e.category})`, amount: e.total, date: e.date });
    }
    for (const b of bills) {
      const bal = billBalance(b);
      if (Math.abs(bal - amt) < 0.01 || (text.includes(b.billNumber.toLowerCase()) && amt <= bal + 0.01)) {
        out.push({ type: 'BILL', id: b.id, label: `Bill ${b.billNumber} · ${b.supplier.name} (balance ${bal.toFixed(2)})`, amount: bal, date: b.date });
      }
    }
  }
  // Closest dates first.
  return out.sort((a, b) => Math.abs(a.date.getTime() - t.date.getTime()) - Math.abs(b.date.getTime() - t.date.getTime())).slice(0, 5);
}

async function link(txId: string, type: 'PAYMENT' | 'BILL_PAYMENT' | 'EXPENSE', recordId: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.bankTransaction.updateMany({ where: { id: txId, status: { not: 'MATCHED' } }, data: { status: 'MATCHED', matchType: type, matchId: recordId, matchedAt: new Date() } });
    if (!claimed.count) throw badRequest('This bank line is already matched');
    const where = { id: recordId, reconciled: false };
    const n =
      type === 'PAYMENT'
        ? await tx.payment.updateMany({ where, data: { reconciled: true } })
        : type === 'BILL_PAYMENT'
          ? await tx.billPayment.updateMany({ where, data: { reconciled: true } })
          : await tx.expense.updateMany({ where, data: { reconciled: true } });
    if (!n.count) throw badRequest('That record is already matched to another bank line');
  });
}

/** Match lines that have exactly one existing payment / expense of the same amount within a week. */
export async function autoMatch() {
  const open = await prisma.bankTransaction.findMany({ where: { status: 'UNMATCHED' }, orderBy: { date: 'asc' } });
  let matched = 0;
  for (const t of open) {
    const existing = (await suggestionsFor(t)).filter((s) => s.type === 'PAYMENT' || s.type === 'BILL_PAYMENT' || s.type === 'EXPENSE');
    if (existing.length !== 1) continue;
    try {
      await link(t.id, existing[0]!.type as 'PAYMENT' | 'BILL_PAYMENT' | 'EXPENSE', existing[0]!.id);
      matched++;
    } catch {
      // Someone matched it meanwhile.
    }
  }
  return matched;
}

/** Match a bank line by hand. Matching to an open invoice or bill records the payment first. */
export async function matchTransaction(txId: string, target: { type: Suggestion['type']; id: string }) {
  const t = await prisma.bankTransaction.findUnique({ where: { id: txId } });
  if (!t) throw notFound('Bank transaction');
  if (t.status === 'MATCHED') throw badRequest('This bank line is already matched');
  const amt = Math.abs(t.amount);
  if (target.type === 'INVOICE') {
    if (t.amount <= 0) throw badRequest('Only money coming in can pay an invoice');
    await addPayment(target.id, { amount: amt, tdsAmount: 0, paymentMethod: 'BANK_TRANSFER', paymentDate: t.date, referenceId: t.reference ?? null, notes: `From bank: ${t.description}`.slice(0, 200) });
    // The payment just recorded (newest by creation, whatever its date).
    const p = await prisma.payment.findFirstOrThrow({ where: { invoiceId: target.id }, orderBy: { createdAt: 'desc' } });
    await link(t.id, 'PAYMENT', p.id);
  } else if (target.type === 'BILL') {
    if (t.amount >= 0) throw badRequest('Only money going out can pay a bill');
    await addBillPayment(target.id, { amount: amt, tdsAmount: 0, tdsSection: null, paymentMethod: 'BANK_TRANSFER', paymentDate: t.date, referenceId: t.reference ?? null, notes: `From bank: ${t.description}`.slice(0, 200) });
    const p = await prisma.billPayment.findFirstOrThrow({ where: { billId: target.id }, orderBy: { createdAt: 'desc' } });
    await link(t.id, 'BILL_PAYMENT', p.id);
  } else {
    await link(t.id, target.type, target.id);
  }
  return prisma.bankTransaction.findUniqueOrThrow({ where: { id: txId } });
}

export const expenseFromBankInput = z.object({
  category: z.string().trim().min(1),
  description: z.string().trim().max(200).optional(),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  vendor: z.string().trim().optional(),
  vendorGstin: z.string().trim().optional(),
});

/** Record a bank debit (bank charges, rent, salary…) as an expense and match it. */
export async function expenseFromTransaction(txId: string, input: z.infer<typeof expenseFromBankInput>) {
  const t = await prisma.bankTransaction.findUnique({ where: { id: txId } });
  if (!t) throw notFound('Bank transaction');
  if (t.status === 'MATCHED') throw badRequest('This bank line is already matched');
  if (t.amount >= 0) throw badRequest('Only money going out can be an expense');
  const e = await createExpense({
    date: t.date,
    category: input.category,
    description: input.description || t.description.slice(0, 200),
    vendor: input.vendor || null,
    vendorGstin: input.vendorGstin || null,
    amount: Math.abs(t.amount),
    taxInclusive: true,
    taxRate: input.taxRate,
    interState: null,
    itcEligible: undefined,
    paymentMethod: 'BANK_TRANSFER',
    referenceId: t.reference,
    notes: null,
  });
  await link(t.id, 'EXPENSE', e.id);
  return e;
}

export async function setIgnored(txId: string, ignored: boolean) {
  const t = await prisma.bankTransaction.findUnique({ where: { id: txId } });
  if (!t) throw notFound('Bank transaction');
  if (t.status === 'MATCHED') throw badRequest('Unmatch this line first');
  return prisma.bankTransaction.update({ where: { id: txId }, data: { status: ignored ? 'IGNORED' : 'UNMATCHED' } });
}

/** Undo a match (the payment or expense itself is kept). */
export async function unmatch(txId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.bankTransaction.findUnique({ where: { id: txId } });
    if (!t) throw notFound('Bank transaction');
    if (t.status !== 'MATCHED' || !t.matchId) return t;
    const where = { id: t.matchId };
    if (t.matchType === 'PAYMENT') await tx.payment.updateMany({ where, data: { reconciled: false } });
    else if (t.matchType === 'BILL_PAYMENT') await tx.billPayment.updateMany({ where, data: { reconciled: false } });
    else if (t.matchType === 'EXPENSE') await tx.expense.updateMany({ where, data: { reconciled: false } });
    return tx.bankTransaction.update({ where: { id: txId }, data: { status: 'UNMATCHED', matchType: null, matchId: null, matchedAt: null } });
  });
}
