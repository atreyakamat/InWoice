import { z } from 'zod';
import prisma from '../lib/prisma';
import { gstinError } from '../lib/gst';
import { round2 } from '../lib/util';
import { computeDocument } from '../lib/accounting';
import { extractFromDocument, type DocumentInput } from './ai.service';

/**
 * Read a supplier bill from a photo or PDF and turn it into a draft bill for the user to
 * check. Nothing is saved: the result only fills in the bill form. The AI's answer is
 * checked here (GSTIN checksum, dates, totals add up) and anything doubtful is flagged.
 */

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;

export const BILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['supplierName', 'supplierGstin', 'billNumber', 'billDate', 'dueDate', 'lines', 'discount', 'shipping', 'cgst', 'sgst', 'igst', 'total'],
  properties: {
    supplierName: { ...str, description: 'Name of the business that issued the bill (the seller), not the buyer' },
    supplierGstin: { ...str, description: "Seller's 15-character GSTIN, or empty if none" },
    billNumber: { ...str, description: 'Invoice / bill number as printed' },
    billDate: { ...str, description: 'Invoice date as YYYY-MM-DD, or empty' },
    dueDate: { ...str, description: 'Due date as YYYY-MM-DD, or empty' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'hsn', 'quantity', 'unitPrice', 'taxRate'],
        properties: {
          description: str,
          hsn: { ...str, description: 'HSN/SAC code, or empty' },
          quantity: num,
          unitPrice: { ...num, description: 'Price per unit before GST' },
          taxRate: { ...num, description: 'GST rate in percent, e.g. 18 (CGST 9% + SGST 9% is 18)' },
        },
      },
    },
    discount: { ...num, description: 'Discount before GST for the whole bill, 0 if none' },
    shipping: { ...num, description: 'Freight / shipping / packing charges not taxed, 0 if none' },
    cgst: num,
    sgst: num,
    igst: num,
    total: { ...num, description: 'Grand total payable' },
  },
} as const;

const read = z.object({
  supplierName: z.string().catch(''),
  supplierGstin: z.string().catch(''),
  billNumber: z.string().catch(''),
  billDate: z.string().catch(''),
  dueDate: z.string().catch(''),
  lines: z
    .array(
      z.object({
        description: z.string().catch(''),
        hsn: z.string().catch(''),
        quantity: z.coerce.number().catch(1),
        unitPrice: z.coerce.number().catch(0),
        taxRate: z.coerce.number().catch(0),
      }),
    )
    .catch([]),
  discount: z.coerce.number().catch(0),
  shipping: z.coerce.number().catch(0),
  cgst: z.coerce.number().catch(0),
  sgst: z.coerce.number().catch(0),
  igst: z.coerce.number().catch(0),
  total: z.coerce.number().catch(0),
});

const SYSTEM =
  'You read Indian GST tax invoices and bills for a small business bookkeeping app. Copy values exactly as printed; never guess. ' +
  'If a value is not on the document, use an empty string (or 0 for numbers). Unit prices are before GST.';

const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime()) ? v : null);
const VALID_RATES = new Set([0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40]);

export async function readBill(document: DocumentInput) {
  const { data, provider, model } = await extractFromDocument({
    system: SYSTEM,
    prompt: 'Read this bill and fill in every field of the schema.',
    schema: BILL_SCHEMA as unknown as Record<string, unknown>,
    document,
  });
  const r = read.parse(data ?? {});
  const warnings: string[] = [];

  // Supplier: GSTIN first (checksum-validated), then name.
  const gstin = r.supplierGstin.replace(/\s+/g, '').toUpperCase();
  const gstinOk = gstin.length > 0 && !gstinError(gstin);
  if (gstin && !gstinOk) warnings.push(`The GSTIN read from the bill (${gstin}) is not valid. Check it against the bill.`);
  const supplier =
    (gstinOk ? await prisma.supplier.findFirst({ where: { gst: gstin } }) : null) ??
    (r.supplierName.trim() ? await prisma.supplier.findFirst({ where: { name: { equals: r.supplierName.trim(), mode: 'insensitive' } } }) : null);
  if (!supplier) warnings.push(`"${r.supplierName || 'The supplier'}" isn't in your suppliers yet. Add them to save this bill.`);

  const lines = r.lines
    .filter((l) => l.description.trim() && l.quantity > 0)
    .map((l) => ({ description: l.description.trim().slice(0, 200), hsnCode: l.hsn.trim() || null, quantity: round2(l.quantity), unitPrice: round2(l.unitPrice), taxRate: l.taxRate }));
  if (!lines.length) warnings.push('No line items could be read. Enter them by hand.');
  if (lines.some((l) => !VALID_RATES.has(l.taxRate))) warnings.push('Some GST rates look unusual. Check each line.');

  const billDate = isoDate(r.billDate);
  if (r.billDate && !billDate) warnings.push('The bill date could not be read. Check it.');
  const interState = r.igst > 0 && r.cgst + r.sgst === 0;
  const doc = computeDocument(lines, { discount: Math.max(0, r.discount), shippingCost: Math.max(0, r.shipping), interState });
  if (r.total > 0 && Math.abs(doc.grandTotal - r.total) > 1) {
    warnings.push(`The lines add up to ${doc.grandTotal.toFixed(2)} but the bill says ${r.total.toFixed(2)}. Check quantities, prices and GST rates.`);
  }

  return {
    provider,
    model,
    supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
    suggestedSupplier: { name: r.supplierName.trim(), gstin: gstinOk ? gstin : null },
    draft: {
      supplierId: supplier?.id ?? null,
      billNumber: r.billNumber.trim().slice(0, 40),
      date: billDate,
      dueDate: isoDate(r.dueDate),
      discount: round2(Math.max(0, r.discount)),
      shippingCost: round2(Math.max(0, r.shipping)),
      interState,
      items: lines,
    },
    printedTotal: round2(r.total),
    computedTotal: doc.grandTotal,
    warnings,
  };
}
