import prisma from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { UNITS, unitOf, type Unit } from '../lib/units';
import { businessStateCode, placeOfSupplyCode, stateLabel } from '../lib/gst';
import { round2 } from '../lib/util';
import { getSettings } from './settings.service';

/**
 * GSTR-1 style outward-supply report for a period, built from issued invoices and
 * credit notes. Sections and CSV columns follow the GST offline tool templates so an
 * accountant can paste them in. Shipping is not taxed by InWoice, so it is part of
 * invoice value but never of taxable value.
 */

// Unregistered inter-state invoices above this value are reported individually (B2CL).
export const B2CL_LIMIT = 100_000;

const ISSUED = ['PENDING', 'PARTIAL', 'PAID'];

export interface Period {
  from: Date; // inclusive
  to: Date; // exclusive
  label: string;
}

/** "YYYY-MM" or explicit from/to dates ("YYYY-MM-DD", both inclusive). Server local time. */
export function parsePeriod(q: { month?: string; from?: string; to?: string }): Period {
  const ymd = (s: string) => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw badRequest('Dates must look like 2026-04-30');
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  if (q.from && q.to) {
    const from = ymd(q.from);
    const end = ymd(q.to);
    if (end < from) throw badRequest('"to" must be on or after "from"');
    return { from, to: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1), label: `${q.from} to ${q.to}` };
  }
  const month = q.month ?? new Date().toISOString().slice(0, 7);
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw badRequest('Month must look like 2026-04');
  const from = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1), label: month };
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmtDate = (d: Date) => {
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${String(d.getDate()).padStart(2, '0')}-${mon}-${String(d.getFullYear()).slice(2)}`;
};

interface TaxSplit {
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
}

function split(taxable: number, tax: number, inter: boolean): TaxSplit {
  const cgst = inter ? 0 : round2(tax / 2);
  return { taxable: round2(taxable), igst: inter ? round2(tax) : 0, cgst, sgst: inter ? 0 : round2(tax - cgst) };
}

function addInto<T extends TaxSplit>(target: T, s: TaxSplit, sign = 1) {
  target.taxable = round2(target.taxable + sign * s.taxable);
  target.igst = round2(target.igst + sign * s.igst);
  target.cgst = round2(target.cgst + sign * s.cgst);
  target.sgst = round2(target.sgst + sign * s.sgst);
}

export async function buildGstReport(period: Period) {
  const settings = await getSettings();
  const home = businessStateCode(settings.state, settings.gstNumber);

  const [invoices, creditNotes, docInvoices, docCredits] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: ISSUED }, date: { gte: period.from, lt: period.to } },
      include: { customer: true, items: true },
      orderBy: [{ date: 'asc' }, { invoiceNumber: 'asc' }],
    }),
    prisma.creditNote.findMany({
      where: { status: 'ISSUED', date: { gte: period.from, lt: period.to } },
      include: { customer: true, items: true, invoice: { include: { items: { select: { id: true, unit: true } } } } },
      orderBy: [{ date: 'asc' }, { creditNoteNumber: 'asc' }],
    }),
    prisma.invoice.findMany({
      where: { status: { not: 'DRAFT' }, date: { gte: period.from, lt: period.to } },
      select: { invoiceNumber: true, status: true },
      orderBy: { invoiceNumber: 'asc' },
    }),
    prisma.creditNote.findMany({
      where: { date: { gte: period.from, lt: period.to } },
      select: { creditNoteNumber: true, status: true },
      orderBy: { creditNoteNumber: 'asc' },
    }),
  ]);

  const b2b: Array<TaxSplit & { gstin: string; receiverName: string; invoiceNumber: string; invoiceDate: string; invoiceDateIso: string; invoiceValue: number; placeOfSupply: string; rate: number; inter: boolean }> = [];
  const b2cl: Array<TaxSplit & { invoiceNumber: string; invoiceDate: string; invoiceDateIso: string; invoiceValue: number; placeOfSupply: string; rate: number; inter: boolean }> = [];
  const b2cs = new Map<string, TaxSplit & { placeOfSupply: string; rate: number }>();
  const hsn = new Map<string, TaxSplit & { hsn: string; description: string; rate: number; unit: Unit; uqc: string; quantity: number; totalValue: number; supplyType: 'B2B' | 'B2C' }>();
  const cdnr: Array<TaxSplit & { gstin: string; receiverName: string; noteNumber: string; noteDate: string; noteDateIso: string; noteValue: number; placeOfSupply: string; rate: number; inter: boolean; invoiceNumber: string; invoiceDate: string }> = [];
  const cdnur: Array<TaxSplit & { noteNumber: string; noteDate: string; noteDateIso: string; noteValue: number; placeOfSupply: string; rate: number; inter: boolean; invoiceNumber: string }> = [];
  const warnings: string[] = [];

  const posOf = (pos: string | null, c: { state: string | null; gstin: string | null }) => placeOfSupplyCode(pos, c.state, c.gstin) ?? home;
  const isB2cl = (inter: boolean, registered: boolean, invoiceValue: number) => !registered && inter && invoiceValue > B2CL_LIMIT;

  const hsnAdd = (code: string | null, name: string, rate: number, qty: number, s: TaxSplit, b2bSupply: boolean, sign = 1, unitKey: string | null = 'pcs') => {
    const h = code?.trim() || 'NA';
    const unit = unitOf(unitKey);
    const key = `${b2bSupply ? 'B2B' : 'B2C'}|${h}|${rate}|${UNITS[unit].uqc}`;
    const row = hsn.get(key) ?? { hsn: h, description: name, rate, unit, uqc: UNITS[unit].uqc, quantity: 0, totalValue: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, supplyType: b2bSupply ? 'B2B' : 'B2C' };
    row.quantity = Math.round((row.quantity + sign * qty) * 1000) / 1000;
    addInto(row, s, sign);
    row.totalValue = round2(row.taxable + row.igst + row.cgst + row.sgst);
    hsn.set(key, row);
  };
  const b2csAdd = (posCode: string | null, rate: number, s: TaxSplit, sign = 1) => {
    const key = `${posCode}|${rate}`;
    const row = b2cs.get(key) ?? { placeOfSupply: stateLabel(posCode), rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    addInto(row, s, sign);
    b2cs.set(key, row);
  };

  // Credit notes are reported in the unit of the invoice line they reverse.
  const unitOfInvoiceItem = new Map(creditNotes.flatMap((cn) => cn.invoice.items.map((i) => [i.id, i.unit] as const)));

  // --- Invoices -------------------------------------------------------------
  for (const inv of invoices) {
    const registered = Boolean(inv.customer.gstin);
    const inter = inv.igst > 0 || (inv.taxAmount === 0 && Boolean(home) && posOf(inv.placeOfSupply, inv.customer) !== home);
    const posCode = posOf(inv.placeOfSupply, inv.customer);
    if (!posCode) warnings.push(`${inv.invoiceNumber}: place of supply unknown. Set the customer's state or your business state.`);
    const ratio = inv.subtotal > 0 ? (inv.subtotal - inv.discount) / inv.subtotal : 0;

    // Group lines by tax rate (GSTR-1 reports one row per invoice per rate).
    const byRate = new Map<number, TaxSplit>();
    for (const it of inv.items) {
      const s = split(it.total * ratio, it.taxAmount, inter);
      const r = byRate.get(it.taxRate) ?? { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      addInto(r, s);
      byRate.set(it.taxRate, r);
      hsnAdd(it.hsnCode, it.name, it.taxRate, it.quantity, s, registered, 1, it.unit);
    }

    const base = { invoiceNumber: inv.invoiceNumber, invoiceDate: fmtDate(inv.date), invoiceDateIso: isoDay(inv.date), invoiceValue: round2(inv.grandTotal), placeOfSupply: stateLabel(posCode), inter };
    for (const [rate, s] of byRate) {
      if (registered) b2b.push({ ...base, gstin: inv.customer.gstin!, receiverName: inv.customer.name, rate, ...s });
      else if (isB2cl(inter, registered, inv.grandTotal)) b2cl.push({ ...base, rate, ...s });
      else b2csAdd(posCode, rate, s);
    }
  }

  // --- Credit notes ----------------------------------------------------------
  for (const cn of creditNotes) {
    const registered = Boolean(cn.customer.gstin);
    const inter = cn.igst > 0 || cn.invoice.igst > 0;
    const posCode = posOf(cn.invoice.placeOfSupply, cn.customer);
    const byRate = new Map<number, TaxSplit>();
    for (const it of cn.items) {
      const s = split(it.taxableValue, it.taxAmount, inter);
      const r = byRate.get(it.taxRate) ?? { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      addInto(r, s);
      byRate.set(it.taxRate, r);
      hsnAdd(it.hsnCode, it.name, it.taxRate, it.quantity, s, registered, -1, unitOfInvoiceItem.get(it.invoiceItemId));
    }
    const base = { noteNumber: cn.creditNoteNumber, noteDate: fmtDate(cn.date), noteDateIso: isoDay(cn.date), noteValue: round2(cn.total), placeOfSupply: stateLabel(posCode), inter };
    for (const [rate, s] of byRate) {
      if (registered) {
        cdnr.push({ ...base, gstin: cn.customer.gstin!, receiverName: cn.customer.name, rate, invoiceNumber: cn.invoice.invoiceNumber, invoiceDate: fmtDate(cn.invoice.date), ...s });
      } else if (isB2cl(inter, registered, cn.invoice.grandTotal)) {
        cdnur.push({ ...base, rate, invoiceNumber: cn.invoice.invoiceNumber, ...s });
      } else {
        b2csAdd(posCode, rate, s, -1); // B2C small credit notes are netted into B2CS
      }
    }
  }

  // --- Documents issued --------------------------------------------------------
  const docs = [
    { nature: 'Invoices for outward supply', numbers: docInvoices.map((d) => d.invoiceNumber), cancelled: docInvoices.filter((d) => d.status === 'CANCELLED').length },
    { nature: 'Credit Note', numbers: docCredits.map((d) => d.creditNoteNumber), cancelled: docCredits.filter((d) => d.status === 'CANCELLED').length },
  ]
    .filter((d) => d.numbers.length)
    .map((d) => ({ nature: d.nature, from: d.numbers[0]!, to: d.numbers[d.numbers.length - 1]!, total: d.numbers.length, cancelled: d.cancelled }));

  // --- Summary -----------------------------------------------------------------
  const b2csRows = [...b2cs.values()].filter((r) => Math.abs(r.taxable) >= 0.005 || Math.abs(r.igst + r.cgst + r.sgst) >= 0.005);
  const sum = (rows: TaxSplit[], sign = 1) => {
    const t = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    rows.forEach((r) => addInto(t, r, sign));
    return t;
  };
  const gross = sum([...b2b, ...b2cl, ...b2csRows]);
  const notes = sum([...cdnr, ...cdnur], -1);
  const net = { ...gross };
  addInto(net, notes);
  const hsnRows = [...hsn.values()].sort((a, b) => a.supplyType.localeCompare(b.supplyType) || a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
  if (hsnRows.some((r) => r.hsn === 'NA')) warnings.push('Some items have no HSN code. Add HSN codes to products so the HSN summary is complete.');
  if (!settings.gstNumber) warnings.push('Your GSTIN is not set (Settings › Business).');

  return {
    period: { label: period.label, from: period.from, to: new Date(period.to.getTime() - 1) },
    business: { name: settings.businessName, gstin: settings.gstNumber, state: stateLabel(home) },
    summary: {
      invoices: invoices.length,
      creditNotes: creditNotes.length,
      taxableValue: net.taxable,
      igst: net.igst,
      cgst: net.cgst,
      sgst: net.sgst,
      totalTax: round2(net.igst + net.cgst + net.sgst),
      b2bTaxable: round2(sum(b2b).taxable - sum(cdnr).taxable),
      b2cTaxable: round2(sum([...b2cl, ...b2csRows]).taxable - sum(cdnur).taxable),
    },
    b2b,
    b2cl,
    b2cs: b2csRows.sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.rate - b.rate),
    cdnr,
    cdnur,
    hsn: hsnRows,
    docs,
    warnings,
  };
}

export type GstReport = Awaited<ReturnType<typeof buildGstReport>>;

/** CSV layouts matching the GST offline tool templates. */
export function gstCsv(report: GstReport, section: string): { columns: string[]; rows: Record<string, unknown>[] } {
  switch (section) {
    case 'b2b':
      return {
        columns: ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount'],
        rows: report.b2b.map((r) => ({
          'GSTIN/UIN of Recipient': r.gstin, 'Receiver Name': r.receiverName, 'Invoice Number': r.invoiceNumber, 'Invoice date': r.invoiceDate,
          'Invoice Value': r.invoiceValue, 'Place Of Supply': r.placeOfSupply, 'Reverse Charge': 'N', 'Applicable % of Tax Rate': '',
          'Invoice Type': 'Regular B2B', 'E-Commerce GSTIN': '', Rate: r.rate, 'Taxable Value': r.taxable, 'Cess Amount': 0,
        })),
      };
    case 'b2cl':
      return {
        columns: ['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
        rows: report.b2cl.map((r) => ({
          'Invoice Number': r.invoiceNumber, 'Invoice date': r.invoiceDate, 'Invoice Value': r.invoiceValue, 'Place Of Supply': r.placeOfSupply,
          'Applicable % of Tax Rate': '', Rate: r.rate, 'Taxable Value': r.taxable, 'Cess Amount': 0, 'E-Commerce GSTIN': '',
        })),
      };
    case 'b2cs':
      return {
        columns: ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
        rows: report.b2cs.map((r) => ({
          Type: 'OE', 'Place Of Supply': r.placeOfSupply, 'Applicable % of Tax Rate': '', Rate: r.rate, 'Taxable Value': r.taxable, 'Cess Amount': 0, 'E-Commerce GSTIN': '',
        })),
      };
    case 'cdnr':
      return {
        columns: ['GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'],
        rows: report.cdnr.map((r) => ({
          'GSTIN/UIN of Recipient': r.gstin, 'Receiver Name': r.receiverName, 'Note Number': r.noteNumber, 'Note Date': r.noteDate, 'Note Type': 'C',
          'Place Of Supply': r.placeOfSupply, 'Reverse Charge': 'N', 'Note Supply Type': 'Regular B2B', 'Note Value': r.noteValue,
          'Applicable % of Tax Rate': '', Rate: r.rate, 'Taxable Value': r.taxable, 'Cess Amount': 0,
        })),
      };
    case 'cdnur':
      return {
        columns: ['UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'],
        rows: report.cdnur.map((r) => ({
          'UR Type': 'B2CL', 'Note Number': r.noteNumber, 'Note Date': r.noteDate, 'Note Type': 'C', 'Place Of Supply': r.placeOfSupply,
          'Note Value': r.noteValue, 'Applicable % of Tax Rate': '', Rate: r.rate, 'Taxable Value': r.taxable, 'Cess Amount': 0,
        })),
      };
    case 'hsn':
      return {
        columns: ['Supply Type', 'HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'],
        rows: report.hsn.map((r) => ({
          'Supply Type': r.supplyType, HSN: r.hsn, Description: r.description, UQC: UNITS[r.unit].uqcLabel, 'Total Quantity': r.quantity, 'Total Value': r.totalValue,
          Rate: r.rate, 'Taxable Value': r.taxable, 'Integrated Tax Amount': r.igst, 'Central Tax Amount': r.cgst, 'State/UT Tax Amount': r.sgst, 'Cess Amount': 0,
        })),
      };
    case 'docs':
      return {
        columns: ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
        rows: report.docs.map((d) => ({ 'Nature of Document': d.nature, 'Sr. No. From': d.from, 'Sr. No. To': d.to, 'Total Number': d.total, Cancelled: d.cancelled })),
      };
    default:
      throw badRequest('Unknown section. Use b2b, b2cl, b2cs, cdnr, cdnur, hsn or docs.');
  }
}

/** Line-level sales register for the period: every invoice line, and credit note lines as negatives. */
export async function salesRegister(period: Period) {
  const [invoices, creditNotes] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: ISSUED }, date: { gte: period.from, lt: period.to } },
      include: { customer: true, items: true },
      orderBy: [{ date: 'asc' }, { invoiceNumber: 'asc' }],
    }),
    prisma.creditNote.findMany({
      where: { status: 'ISSUED', date: { gte: period.from, lt: period.to } },
      include: { customer: true, items: true, invoice: { include: { items: { select: { id: true, unit: true } } } } },
      orderBy: [{ date: 'asc' }, { creditNoteNumber: 'asc' }],
    }),
  ]);
  const rows: Record<string, unknown>[] = [];
  for (const inv of invoices) {
    const ratio = inv.subtotal > 0 ? (inv.subtotal - inv.discount) / inv.subtotal : 0;
    const inter = inv.igst > 0;
    for (const it of inv.items) {
      const s = split(it.total * ratio, it.taxAmount, inter);
      rows.push({
        document: 'Invoice', number: inv.invoiceNumber, date: inv.date.toISOString().slice(0, 10), customer: inv.customer.name, gstin: inv.customer.gstin,
        placeOfSupply: inv.placeOfSupply, item: it.name, hsn: it.hsnCode, quantity: it.quantity, unitPrice: it.unitPrice, taxRate: it.taxRate,
        taxableValue: s.taxable, cgst: s.cgst, sgst: s.sgst, igst: s.igst, lineTotal: round2(s.taxable + it.taxAmount), reference: '',
      });
    }
  }
  for (const cn of creditNotes) {
    const inter = cn.igst > 0 || cn.invoice.igst > 0;
    for (const it of cn.items) {
      const s = split(it.taxableValue, it.taxAmount, inter);
      rows.push({
        document: 'Credit note', number: cn.creditNoteNumber, date: cn.date.toISOString().slice(0, 10), customer: cn.customer.name, gstin: cn.customer.gstin,
        placeOfSupply: cn.invoice.placeOfSupply, item: it.name, hsn: it.hsnCode, quantity: -it.quantity, unitPrice: '', taxRate: it.taxRate,
        taxableValue: -s.taxable, cgst: -s.cgst, sgst: -s.sgst, igst: -s.igst, lineTotal: -round2(s.taxable + it.taxAmount), reference: cn.invoice.invoiceNumber,
      });
    }
  }
  return {
    columns: ['document', 'number', 'date', 'customer', 'gstin', 'placeOfSupply', 'item', 'hsn', 'quantity', 'unitPrice', 'taxRate', 'taxableValue', 'cgst', 'sgst', 'igst', 'lineTotal', 'reference'],
    rows,
  };
}
