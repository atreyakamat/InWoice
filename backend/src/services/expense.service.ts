import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { optDate, optGstin, optStr, round2 } from '../lib/util';
import { businessStateCode, placeOfSupplyCode } from '../lib/gst';
import { fromInclusive, splitGst } from '../lib/accounting';
import { assertOpenPeriod, getSettings } from './settings.service';
import { PAYMENT_METHODS } from './bill.service';

/**
 * Expenses are paid on the spot (rent, salaries, electricity, courier...). Anything you
 * will pay later is a supplier bill instead, so it shows up in what you owe.
 */

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries & wages',
  'Electricity & utilities',
  'Internet & phone',
  'Transport & courier',
  'Packaging',
  'Marketing & ads',
  'Repairs & maintenance',
  'Office supplies',
  'Software & subscriptions',
  'Professional fees',
  'Bank & payment charges',
  'Travel',
  'Food & refreshments',
  'Taxes & licences',
  'Other',
] as const;

export const expenseInput = z.object({
  date: optDate,
  category: z.string().trim().min(1, 'Pick a category').max(60),
  description: z.string().trim().min(1, 'Describe the expense').max(200),
  vendor: optStr,
  vendorGstin: optGstin,
  amount: z.coerce.number().positive('Amount must be more than zero'),
  // true: `amount` is what you paid, GST included. false: `amount` is before GST.
  taxInclusive: z.boolean().default(true),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  interState: z.boolean().optional().nullable(),
  itcEligible: z.boolean().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  referenceId: optStr,
  notes: optStr,
});

export type ExpenseInput = z.infer<typeof expenseInput>;

/** Work out taxable value, GST split and ITC eligibility for an expense. */
export async function computeExpense(input: ExpenseInput) {
  const settings = await getSettings();
  const { taxable, tax } = input.taxInclusive
    ? fromInclusive(input.amount, input.taxRate)
    : { taxable: round2(input.amount), tax: round2((input.amount * input.taxRate) / 100) };
  const home = businessStateCode(settings.state, settings.gstNumber);
  const theirs = placeOfSupplyCode(null, null, input.vendorGstin);
  const interState = input.interState ?? Boolean(home && theirs && home !== theirs);
  if (input.itcEligible && !input.vendorGstin) throw badRequest("GST input credit needs the vendor's GSTIN on the bill");
  const itcEligible = tax > 0 && Boolean(input.vendorGstin) && (input.itcEligible ?? true);
  return {
    date: input.date ?? new Date(),
    category: input.category,
    description: input.description,
    vendor: input.vendor ?? null,
    vendorGstin: input.vendorGstin ?? null,
    amount: taxable,
    taxRate: input.taxRate,
    taxAmount: tax,
    ...splitGst(tax, interState),
    total: round2(taxable + tax),
    itcEligible,
    paymentMethod: input.paymentMethod,
    referenceId: input.referenceId ?? null,
    notes: input.notes ?? null,
  };
}

export async function createExpense(input: ExpenseInput) {
  const data = await computeExpense(input);
  await assertOpenPeriod([data.date], 'This expense');
  return prisma.expense.create({ data });
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw notFound('Expense');
  const data = await computeExpense(input);
  await assertOpenPeriod([existing.date, data.date], 'This expense');
  return prisma.expense.update({ where: { id }, data });
}

export async function deleteExpense(id: string) {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw notFound('Expense');
  await assertOpenPeriod([existing.date], 'This expense');
  await prisma.expense.delete({ where: { id } });
}

/** Default categories plus any custom ones already used, most used first. */
export async function expenseCategories() {
  const used = await prisma.expense.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { _count: { category: 'desc' } } });
  const names = used.map((u) => u.category);
  return [...names, ...EXPENSE_CATEGORIES.filter((c) => !names.includes(c))];
}
