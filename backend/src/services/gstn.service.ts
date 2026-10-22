import prisma from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { round2 } from '../lib/util';
import { buildGstReport, type GstReport, type Period } from './gst.service';
import { getSettings } from './settings.service';

/**
 * Files exchanged with the GST portal:
 *  - GSTR-1 as JSON in the GST offline tool's format, to import and upload.
 *  - GSTR-2B (downloaded from the portal) matched against your bills, so you only claim
 *    input credit your suppliers have actually reported.
 * The portal's formats change from time to time: always open the GSTR-1 JSON in the
 * offline tool first, which validates it before you upload.
 */

const code = (pos: string) => pos.slice(0, 2);
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
/** The offline tool numbers item rows by rate: 18% → 1801. */
const itemNum = (rate: number) => Math.round(rate * 100) + 1;

const itm = (r: { rate: number; taxable: number; igst: number; cgst: number; sgst: number }, inter: boolean) => ({
  num: itemNum(r.rate),
  itm_det: inter
    ? { txval: round2(r.taxable), rt: r.rate, iamt: round2(r.igst), csamt: 0 }
    : { txval: round2(r.taxable), rt: r.rate, camt: round2(r.cgst), samt: round2(r.sgst), csamt: 0 },
});

function groupBy<T, K>(rows: T[], key: (r: T) => K) {
  const m = new Map<K, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}

/** GSTR-1 JSON for one month, from the same figures as the GSTR-1 report. */
export function gstr1Json(r: GstReport, gstin: string, fp: string) {
  const home = r.business.state ? code(r.business.state) : '';

  const b2b = [...groupBy(r.b2b, (x) => x.gstin)].map(([ctin, rows]) => ({
    ctin,
    inv: [...groupBy(rows, (x) => x.invoiceNumber)].map(([inum, lines]) => ({
      inum,
      idt: ddmmyyyy(lines[0]!.invoiceDateIso),
      val: lines[0]!.invoiceValue,
      pos: code(lines[0]!.placeOfSupply),
      rchrg: 'N',
      inv_typ: 'R',
      itms: lines.map((l) => itm(l, l.inter)),
    })),
  }));

  const b2cl = [...groupBy(r.b2cl, (x) => code(x.placeOfSupply))].map(([pos, rows]) => ({
    pos,
    inv: [...groupBy(rows, (x) => x.invoiceNumber)].map(([inum, lines]) => ({
      inum,
      idt: ddmmyyyy(lines[0]!.invoiceDateIso),
      val: lines[0]!.invoiceValue,
      itms: lines.map((l) => itm(l, true)),
    })),
  }));

  const b2cs = r.b2cs.map((x) => {
    const inter = code(x.placeOfSupply) !== home;
    return {
      sply_ty: inter ? 'INTER' : 'INTRA',
      pos: code(x.placeOfSupply),
      typ: 'OE',
      rt: x.rate,
      txval: round2(x.taxable),
      ...(inter ? { iamt: round2(x.igst) } : { camt: round2(x.cgst), samt: round2(x.sgst) }),
      csamt: 0,
    };
  });

  const cdnr = [...groupBy(r.cdnr, (x) => x.gstin)].map(([ctin, rows]) => ({
    ctin,
    nt: [...groupBy(rows, (x) => x.noteNumber)].map(([nt_num, lines]) => ({
      ntty: 'C',
      nt_num,
      nt_dt: ddmmyyyy(lines[0]!.noteDateIso),
      val: lines[0]!.noteValue,
      pos: code(lines[0]!.placeOfSupply),
      rchrg: 'N',
      inv_typ: 'R',
      itms: lines.map((l) => itm(l, l.inter)),
    })),
  }));

  const cdnur = [...groupBy(r.cdnur, (x) => x.noteNumber)].map(([nt_num, lines]) => ({
    typ: 'B2CL',
    ntty: 'C',
    nt_num,
    nt_dt: ddmmyyyy(lines[0]!.noteDateIso),
    val: lines[0]!.noteValue,
    pos: code(lines[0]!.placeOfSupply),
    itms: lines.map((l) => itm(l, true)),
  }));

  const hsnRow = (h: GstReport['hsn'][number], i: number) => ({
    num: i + 1,
    hsn_sc: h.hsn === 'NA' ? '' : h.hsn,
    desc: h.description.slice(0, 30),
    uqc: 'NOS',
    qty: h.quantity,
    rt: h.rate,
    txval: round2(h.taxable),
    iamt: round2(h.igst),
    camt: round2(h.cgst),
    samt: round2(h.sgst),
    csamt: 0,
  });

  const DOC_TYPE: Record<string, number> = { 'Invoices for outward supply': 1, 'Credit Note': 5 };
  const doc_det = r.docs.map((d) => ({
    doc_num: DOC_TYPE[d.nature] ?? 1,
    docs: [{ num: 1, from: d.from, to: d.to, totnum: d.total, cancel: d.cancelled, net_issue: d.total - d.cancelled }],
  }));

  return {
    gstin,
    fp,
    version: 'GST3.2.1',
    hash: 'hash',
    ...(b2b.length ? { b2b } : {}),
    ...(b2cl.length ? { b2cl } : {}),
    ...(b2cs.length ? { b2cs } : {}),
    ...(cdnr.length ? { cdnr } : {}),
    ...(cdnur.length ? { cdnur } : {}),
    hsn: {
      hsn_b2b: r.hsn.filter((h) => h.supplyType === 'B2B').map(hsnRow),
      hsn_b2c: r.hsn.filter((h) => h.supplyType === 'B2C').map(hsnRow),
    },
    ...(doc_det.length ? { doc_issue: { doc_det } } : {}),
  };
}

export async function buildGstr1Json(period: Period, month: string) {
  const settings = await getSettings();
  if (!settings.gstNumber) throw badRequest('Add your GSTIN in Settings › Business first');
  const [y, m] = month.split('-');
  return gstr1Json(await buildGstReport(period), settings.gstNumber, `${m}${y}`);
}

// --- GSTR-2B ----------------------------------------------------------------------------

export interface PortalInvoice {
  gstin: string;
  supplierName: string | null;
  number: string;
  date: string | null;
  value: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  itcAvailable: boolean;
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

/** Read the B2B invoices from a GSTR-2B JSON download (tolerates the portal's variants). */
export function parseGstr2b(file: unknown): { period: string | null; invoices: PortalInvoice[] } {
  const root = file as Record<string, unknown>;
  const data = (root?.data ?? root) as Record<string, unknown>;
  const docdata = (data?.docdata ?? (data as { data?: { docdata?: unknown } })?.data?.docdata ?? data) as Record<string, unknown>;
  const b2b = docdata?.b2b;
  if (!Array.isArray(b2b)) throw badRequest("This doesn't look like a GSTR-2B JSON file (no B2B section found). Download it from the GST portal as JSON.");
  const invoices: PortalInvoice[] = [];
  for (const s of b2b as Record<string, unknown>[]) {
    const gstin = String(s.ctin ?? '').toUpperCase();
    for (const inv of (s.inv ?? []) as Record<string, unknown>[]) {
      const items = ((inv.items ?? inv.itms ?? []) as Record<string, unknown>[]).map((it) => (it.itm_det ?? it) as Record<string, unknown>);
      const t = items.reduce<{ taxable: number; igst: number; cgst: number; sgst: number }>(
        (a, it) => ({
          taxable: a.taxable + num(it.txval),
          igst: a.igst + num(it.igst ?? it.iamt),
          cgst: a.cgst + num(it.cgst ?? it.camt),
          sgst: a.sgst + num(it.sgst ?? it.samt),
        }),
        { taxable: 0, igst: 0, cgst: 0, sgst: 0 },
      );
      invoices.push({
        gstin,
        supplierName: (s.trdnm as string) ?? null,
        number: String(inv.inum ?? ''),
        date: (inv.dt ?? inv.idt ?? null) as string | null,
        value: num(inv.val),
        taxable: round2(t.taxable),
        igst: round2(t.igst),
        cgst: round2(t.cgst),
        sgst: round2(t.sgst),
        itcAvailable: (inv.itcavl ?? 'Y') !== 'N',
      });
    }
  }
  return { period: (data?.rtnprd as string) ?? null, invoices };
}

/** Bill numbers are typed differently by different people: compare letters and digits only. */
export const normaliseDocNumber = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=\d)/, '');

/**
 * Compare GSTR-2B with your bills: what matches, what differs, what the supplier reported
 * but you haven't recorded, and which of your bills the supplier hasn't reported yet
 * (credit you can't safely claim this month).
 */
export async function matchGstr2b(file: unknown, period: Period) {
  const { period: rtnprd, invoices } = parseGstr2b(file);
  const bills = await prisma.bill.findMany({
    where: { status: { not: 'CANCELLED' }, supplier: { gst: { not: null } } },
    select: { id: true, billNumber: true, date: true, subtotal: true, discount: true, taxAmount: true, igst: true, cgst: true, sgst: true, grandTotal: true, itcEligible: true, supplier: { select: { name: true, gst: true } } },
  });
  const key = (gstin: string, n: string) => `${gstin.toUpperCase()}|${normaliseDocNumber(n)}`;
  const byKey = new Map(bills.map((b) => [key(b.supplier.gst!, b.billNumber), b]));
  const seen = new Set<string>();

  const matched: { bill: string; supplier: string; number: string; taxDifference: number; ok: boolean; portal: PortalInvoice; books: { taxable: number; tax: number } }[] = [];
  const missingInBooks: PortalInvoice[] = [];
  for (const p of invoices) {
    const b = byKey.get(key(p.gstin, p.number));
    if (!b) {
      missingInBooks.push(p);
      continue;
    }
    seen.add(b.id);
    const booksTaxable = round2(b.subtotal - b.discount);
    const portalTax = round2(p.igst + p.cgst + p.sgst);
    const taxDifference = round2(portalTax - b.taxAmount);
    matched.push({
      bill: b.id,
      supplier: b.supplier.name,
      number: b.billNumber,
      taxDifference,
      ok: Math.abs(taxDifference) <= 1 && Math.abs(p.taxable - booksTaxable) <= 1,
      portal: p,
      books: { taxable: booksTaxable, tax: b.taxAmount },
    });
  }
  const notInPortal = bills
    .filter((b) => !seen.has(b.id) && b.itcEligible && b.taxAmount > 0 && b.date >= period.from && b.date < period.to)
    .map((b) => ({ bill: b.id, supplier: b.supplier.name, gstin: b.supplier.gst!, number: b.billNumber, date: b.date, tax: b.taxAmount }));

  const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));
  return {
    portalPeriod: rtnprd,
    summary: {
      portalInvoices: invoices.length,
      portalTax: sum(invoices.map((p) => p.igst + p.cgst + p.sgst)),
      matched: matched.filter((m) => m.ok).length,
      mismatched: matched.filter((m) => !m.ok).length,
      missingInBooks: missingInBooks.length,
      missingInBooksTax: sum(missingInBooks.map((p) => p.igst + p.cgst + p.sgst)),
      notInPortal: notInPortal.length,
      taxAtRisk: sum(notInPortal.map((b) => b.tax)),
    },
    matched,
    missingInBooks,
    notInPortal,
  };
}
