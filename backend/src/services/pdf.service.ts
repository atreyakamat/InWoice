import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { BusinessSettings, CreditNote, CreditNoteItem, Customer, Invoice, InvoiceItem, Payment, Quote, QuoteItem } from '@prisma/client';
import { balanceOf, displayStatus } from './invoice.service';
import { quoteDisplayStatus } from './quote.service';

type FullInvoice = Invoice & { customer: Customer; items: InvoiceItem[]; payments: Payment[] };
type FullQuote = Quote & { customer: Customer; items: QuoteItem[] };

/** What the shared invoice/quotation layout needs. */
interface SalesDoc {
  title: 'INVOICE' | 'QUOTATION';
  number: string;
  date: Date;
  dueLabel: string;
  dueDate: Date | null;
  status: string;
  customer: Customer;
  placeOfSupply: string | null;
  items: { name: string; hsnCode: string | null; quantity: number; unitPrice: number; taxRate: number; total: number }[];
  subtotal: number;
  discount: number;
  igst: number;
  cgst: number;
  sgst: number;
  shippingCost: number;
  grandTotal: number;
  credited: number;
  paid: number;
  balance: number | null; // null = no "Balance due" line (quotes, cancelled invoices)
  showPayment: boolean;
  notes: string | null;
}

// The built-in PDF fonts are Latin-1 only, so non-ASCII currency symbols (₹, €) are
// written as their ISO code to avoid bundling a font file.
function moneyFormatter(s: BusinessSettings) {
  const symbol = /^[\x20-\x7e]+$/.test(s.currencySymbol) ? s.currencySymbol : s.currency === 'INR' ? 'Rs. ' : `${s.currency} `;
  const nf = new Intl.NumberFormat(s.currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (n: number) => `${symbol}${nf.format(n)}`;
}

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

function dataUrlToBuffer(url: string | null): Buffer | null {
  const m = url?.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  return m?.[2] ? Buffer.from(m[2], 'base64') : null;
}

/** UPI deep link that pre-fills the amount (also used for the portal's Pay button). */
export function upiLink(s: BusinessSettings, amount: number, note: string) {
  if (!s.upiId || amount <= 0) return null;
  const upi = new URLSearchParams({ pa: s.upiId, pn: s.businessName, am: amount.toFixed(2), cu: s.currency || 'INR', tn: note });
  return `upi://pay?${upi.toString()}`;
}

export async function renderInvoicePdf(inv: FullInvoice, s: BusinessSettings): Promise<Buffer> {
  const cancelled = inv.status === 'CANCELLED';
  return renderSalesPdf(
    {
      ...inv,
      title: 'INVOICE',
      number: inv.invoiceNumber,
      dueLabel: 'Due',
      status: displayStatus(inv),
      credited: inv.amountCredited,
      paid: inv.amountPaid,
      balance: cancelled ? null : balanceOf(inv),
      showPayment: !cancelled,
    },
    s,
  );
}

export async function renderQuotePdf(q: FullQuote, s: BusinessSettings): Promise<Buffer> {
  return renderSalesPdf(
    {
      ...q,
      title: 'QUOTATION',
      number: q.quoteNumber,
      dueLabel: 'Valid until',
      dueDate: q.validUntil,
      status: quoteDisplayStatus(q),
      credited: 0,
      paid: 0,
      balance: null,
      showPayment: false,
    },
    s,
  );
}

async function renderSalesPdf(inv: SalesDoc, s: BusinessSettings): Promise<Buffer> {
  const money = moneyFormatter(s);
  const balance = inv.balance ?? 0;
  const label = inv.title === 'INVOICE' ? 'Invoice' : 'Quotation';

  const link = inv.showPayment ? upiLink(s, balance, `Invoice ${inv.number}`) : null;
  const qr = link ? await QRCode.toBuffer(link, { margin: 1, width: 220 }) : null;

  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `${label} ${inv.number}`, Author: s.businessName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const accent = '#4f46e5';
  const muted = '#6b7280';

  // Header -------------------------------------------------------------
  let y = 40;
  const logo = dataUrlToBuffer(s.logoUrl);
  if (logo) {
    try {
      doc.image(logo, left, y, { fit: [70, 70] });
    } catch {
      /* unreadable image: skip */
    }
  }
  const bizX = logo ? left + 85 : left;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text(s.businessName, bizX, y, { width: 260 });
  doc.font('Helvetica').fontSize(9).fillColor(muted);
  const bizLines = [s.address, [s.phone, s.email].filter(Boolean).join(' | '), s.website, s.gstNumber ? `GSTIN: ${s.gstNumber}` : null]
    .filter(Boolean)
    .join('\n');
  if (bizLines) doc.text(bizLines, bizX, doc.y + 2, { width: 260 });

  doc.font('Helvetica-Bold').fontSize(22).fillColor(accent).text(inv.title, left, y, { width, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#111827');
  const status = inv.status;
  doc.text(`No: ${inv.number}`, left, y + 30, { width, align: 'right' });
  doc.text(`Date: ${fmtDate(inv.date)}`, { width, align: 'right' });
  doc.text(`${inv.dueLabel}: ${fmtDate(inv.dueDate)}`, { width, align: 'right' });
  doc.font('Helvetica-Bold').fillColor(['PAID', 'ACCEPTED', 'CONVERTED'].includes(status) ? '#059669' : ['OVERDUE', 'EXPIRED', 'DECLINED'].includes(status) ? '#dc2626' : muted);
  doc.text(status, { width, align: 'right' });

  // Bill to ----------------------------------------------------------------
  y = Math.max(doc.y, 130) + 15;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text(inv.title === 'INVOICE' ? 'BILL TO' : 'PREPARED FOR', left, y);
  const c = inv.customer;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(c.name, left, y + 12);
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  const custLines = [c.address, [c.city, c.state].filter(Boolean).join(', '), c.phone, c.email, c.gstin ? `GSTIN: ${c.gstin}` : null]
    .filter(Boolean)
    .join('\n');
  if (custLines) doc.text(custLines, left, doc.y + 1, { width: 280 });
  const billToEnd = doc.y;
  if (inv.placeOfSupply) {
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(`Place of supply: ${inv.placeOfSupply}`, left, y, { width, align: 'right' });
  }

  // Items table ------------------------------------------------------------
  y = billToEnd + 18;
  const cols = [
    { key: '#', w: 22, align: 'left' as const },
    { key: 'Item', w: 196, align: 'left' as const },
    { key: 'HSN', w: 50, align: 'left' as const },
    { key: 'Qty', w: 38, align: 'right' as const },
    { key: 'Rate', w: 70, align: 'right' as const },
    { key: 'Tax', w: 42, align: 'right' as const },
    { key: 'Amount', w: width - 418, align: 'right' as const },
  ];
  const drawRow = (vals: string[], rowY: number, bold = false) => {
    let x = left + 6;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    let h = 0;
    cols.forEach((col, i) => {
      doc.text(vals[i] ?? '', x, rowY, { width: col.w - 8, align: col.align });
      h = Math.max(h, doc.heightOfString(vals[i] ?? '', { width: col.w - 8 }));
      x += col.w;
    });
    return h;
  };
  doc.rect(left, y, width, 20).fill('#f3f4f6');
  doc.fillColor('#374151');
  drawRow(cols.map((c) => c.key), y + 6, true);
  y += 26;
  doc.fillColor('#111827');
  inv.items.forEach((item, idx) => {
    if (y > doc.page.height - 200) {
      doc.addPage();
      y = 40;
    }
    const h = drawRow(
      [String(idx + 1), item.name, item.hsnCode ?? '', String(item.quantity), money(item.unitPrice), `${item.taxRate}%`, money(item.total)],
      y,
    );
    y += Math.max(h, 12) + 8;
    doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor('#f3f4f6').stroke();
  });

  // Totals ------------------------------------------------------------------
  y += 6;
  const totalsTop = y;
  const totalsX = right - 220;
  const line = (label: string, value: string, bold = false, color = '#111827') => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(color);
    doc.text(label, totalsX, y, { width: 110 });
    doc.text(value, totalsX + 110, y, { width: 110, align: 'right' });
    y += bold ? 18 : 14;
  };
  line('Subtotal', money(inv.subtotal));
  if (inv.discount > 0) line('Discount', `- ${money(inv.discount)}`);
  if (inv.igst > 0) line('IGST', money(inv.igst));
  if (inv.cgst > 0) line('CGST', money(inv.cgst));
  if (inv.sgst > 0) line('SGST', money(inv.sgst));
  if (inv.shippingCost > 0) line('Shipping', money(inv.shippingCost));
  doc.moveTo(totalsX, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();
  y += 6;
  line('Total', money(inv.grandTotal), true);
  if (inv.credited > 0) line('Credit notes', `- ${money(inv.credited)}`, false, '#059669');
  if (inv.paid > 0) line('Paid', money(inv.paid), false, '#059669');
  if (inv.balance !== null) line('Balance due', money(balance), true, balance > 0 ? accent : '#059669');

  // Payment details + QR (left column, beside totals) -----------------------
  const payY = totalsTop;
  const payLines = [
    s.bankName ? `Bank: ${s.bankName}` : null,
    s.accountNumber ? `A/C: ${s.accountNumber}` : null,
    s.ifscCode ? `IFSC: ${s.ifscCode}` : null,
    s.upiId ? `UPI: ${s.upiId}` : null,
  ].filter(Boolean);
  if (inv.showPayment && (payLines.length || qr)) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('PAYMENT DETAILS', left, payY);
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(payLines.join('\n'), left, payY + 12, { width: 160 });
    if (qr) {
      doc.image(qr, left + 165, payY, { width: 80 });
      doc.fontSize(7).fillColor(muted).text('Scan to pay via UPI', left + 165, payY + 82, { width: 80, align: 'center' });
    }
  }

  // Notes & footer ------------------------------------------------------------
  y = inv.showPayment ? Math.max(y, payY + 110) + 10 : y + 10;
  const footerBlocks: [string, string | null][] = [
    ['Notes', inv.notes],
    ['Terms & Conditions', s.termsConditions],
  ];
  for (const [title, body] of footerBlocks) {
    if (!body) continue;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text(title.toUpperCase(), left, y);
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(body, left, doc.y + 2, { width });
    y = doc.y + 10;
  }
  const thanks = s.thankYouMessage || 'Thank you for your business!';
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(accent).text(thanks, left, y + 4, { width, align: 'center' });
  if (s.invoiceFooter) doc.font('Helvetica').fontSize(8).fillColor(muted).text(s.invoiceFooter, { width, align: 'center' });

  doc.end();
  return done;
}

type FullCreditNote = CreditNote & {
  items: CreditNoteItem[];
  customer: Customer;
  invoice: { invoiceNumber: string; date: Date; placeOfSupply: string | null };
};

const REASON_LABELS: Record<string, string> = {
  RETURN: 'Sales return',
  DISCOUNT: 'Post-sale discount',
  DEFICIENCY: 'Deficiency in goods/services',
  CORRECTION: 'Correction in invoice',
  OTHER: 'Other',
};

/** A GST credit note: same layout family as the invoice, showing tax reversed per line. */
export async function renderCreditNotePdf(cn: FullCreditNote, s: BusinessSettings): Promise<Buffer> {
  const money = moneyFormatter(s);
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Credit note ${cn.creditNoteNumber}`, Author: s.businessName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const accent = '#b45309';
  const muted = '#6b7280';

  let y = 40;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text(s.businessName, left, y, { width: 280 });
  doc.font('Helvetica').fontSize(9).fillColor(muted);
  const bizLines = [s.address, [s.phone, s.email].filter(Boolean).join(' | '), s.gstNumber ? `GSTIN: ${s.gstNumber}` : null].filter(Boolean).join('\n');
  if (bizLines) doc.text(bizLines, left, doc.y + 2, { width: 280 });

  doc.font('Helvetica-Bold').fontSize(20).fillColor(accent).text('CREDIT NOTE', left, y, { width, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#111827');
  doc.text(`No: ${cn.creditNoteNumber}`, left, y + 28, { width, align: 'right' });
  doc.text(`Date: ${fmtDate(cn.date)}`, { width, align: 'right' });
  doc.text(`Against invoice: ${cn.invoice.invoiceNumber} (${fmtDate(cn.invoice.date)})`, { width, align: 'right' });
  doc.text(`Reason: ${REASON_LABELS[cn.reason] ?? cn.reason}`, { width, align: 'right' });
  if (cn.status === 'CANCELLED') doc.font('Helvetica-Bold').fillColor('#dc2626').text('CANCELLED', { width, align: 'right' });

  y = Math.max(doc.y, 120) + 15;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();
  y += 10;
  const c = cn.customer;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('CUSTOMER', left, y);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(c.name, left, y + 12);
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  const custLines = [c.address, [c.city, c.state].filter(Boolean).join(', '), c.gstin ? `GSTIN: ${c.gstin}` : null].filter(Boolean).join('\n');
  if (custLines) doc.text(custLines, left, doc.y + 1, { width: 280 });
  const custEnd = doc.y;
  if (cn.invoice.placeOfSupply) {
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(`Place of supply: ${cn.invoice.placeOfSupply}`, left, y, { width, align: 'right' });
  }

  y = custEnd + 18;
  const cols = [
    { key: 'Item', w: 210, align: 'left' as const },
    { key: 'HSN', w: 55, align: 'left' as const },
    { key: 'Qty', w: 40, align: 'right' as const },
    { key: 'Taxable', w: 80, align: 'right' as const },
    { key: 'Tax', w: 70, align: 'right' as const },
    { key: 'Amount', w: width - 455, align: 'right' as const },
  ];
  const drawRow = (vals: string[], rowY: number, bold = false) => {
    let x = left + 6;
    let h = 0;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    cols.forEach((col, i) => {
      doc.text(vals[i] ?? '', x, rowY, { width: col.w - 8, align: col.align });
      h = Math.max(h, doc.heightOfString(vals[i] ?? '', { width: col.w - 8 }));
      x += col.w;
    });
    return h;
  };
  doc.rect(left, y, width, 20).fill('#f3f4f6');
  doc.fillColor('#374151');
  drawRow(cols.map((col) => col.key), y + 6, true);
  y += 26;
  doc.fillColor('#111827');
  for (const it of cn.items) {
    if (y > doc.page.height - 160) {
      doc.addPage();
      y = 40;
    }
    const h = drawRow(
      [it.name, it.hsnCode ?? '', it.quantity ? String(it.quantity) : '-', money(it.taxableValue), `${money(it.taxAmount)} (${it.taxRate}%)`, money(it.taxableValue + it.taxAmount)],
      y,
    );
    y += Math.max(h, 12) + 8;
  }

  y += 6;
  const totalsX = right - 220;
  const line = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor('#111827');
    doc.text(label, totalsX, y, { width: 110 });
    doc.text(value, totalsX + 110, y, { width: 110, align: 'right' });
    y += bold ? 18 : 14;
  };
  line('Taxable value', money(cn.taxableValue));
  if (cn.igst > 0) line('IGST', money(cn.igst));
  if (cn.cgst > 0) line('CGST', money(cn.cgst));
  if (cn.sgst > 0) line('SGST', money(cn.sgst));
  if (cn.shippingAmount > 0) line('Shipping', money(cn.shippingAmount));
  doc.moveTo(totalsX, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();
  y += 6;
  line('Total credit', money(cn.total), true);
  if (cn.refundAmount > 0) line('Refund to customer', money(cn.refundAmount));

  if (cn.notes) {
    y += 10;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('NOTES', left, y);
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(cn.notes, left, doc.y + 2, { width });
  }

  doc.end();
  return done;
}

interface StatementPdf {
  customer: { name: string; address: string | null; city: string | null; state: string | null; gstin: string | null };
  period: { label: string; from: Date; to: Date };
  opening: number;
  lines: { date: Date; reference: string; details: string; debit: number; credit: number; balance: number }[];
  totals: { invoiced: number; received: number; credited: number };
  closing: number;
  openInvoices: { invoiceNumber: string; date: Date; dueDate: Date | null; balance: number; status: string }[];
  amountDue: number;
  overdue: number;
}

/** Statement of account for one customer and period, with a UPI QR for the amount due. */
export async function renderStatementPdf(st: StatementPdf, s: BusinessSettings): Promise<Buffer> {
  const money = moneyFormatter(s);
  const link = upiLink(s, st.amountDue, `${st.customer.name} statement`);
  const qr = link ? await QRCode.toBuffer(link, { margin: 1, width: 220 }) : null;

  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Statement ${st.customer.name}`, Author: s.businessName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const accent = '#4f46e5';
  const muted = '#6b7280';
  const signed = (n: number) => (n < 0 ? `${money(-n)} Cr` : money(n));

  let y = 40;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text(s.businessName, left, y, { width: 280 });
  doc.font('Helvetica').fontSize(9).fillColor(muted);
  const bizLines = [s.address, [s.phone, s.email].filter(Boolean).join(' | '), s.gstNumber ? `GSTIN: ${s.gstNumber}` : null].filter(Boolean).join('\n');
  if (bizLines) doc.text(bizLines, left, doc.y + 2, { width: 280 });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(accent).text('STATEMENT OF ACCOUNT', left, y, { width, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#111827');
  doc.text(`Period: ${fmtDate(st.period.from)} to ${fmtDate(st.period.to)}`, left, y + 26, { width, align: 'right' });
  doc.text(`Issued: ${fmtDate(new Date())}`, { width, align: 'right' });

  y = Math.max(doc.y, 110) + 15;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();
  y += 10;
  const c = st.customer;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('CUSTOMER', left, y);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(c.name, left, y + 12);
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  const custLines = [c.address, [c.city, c.state].filter(Boolean).join(', '), c.gstin ? `GSTIN: ${c.gstin}` : null].filter(Boolean).join('\n');
  if (custLines) doc.text(custLines, left, doc.y + 1, { width: 280 });
  const custEnd = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('AMOUNT DUE', left, y, { width, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(st.amountDue > 0 ? accent : '#059669').text(money(st.amountDue), left, y + 12, { width, align: 'right' });
  if (st.overdue > 0) doc.font('Helvetica').fontSize(9).fillColor('#dc2626').text(`of which overdue: ${money(st.overdue)}`, left, doc.y, { width, align: 'right' });

  // Transactions -------------------------------------------------------------
  y = Math.max(custEnd, doc.y) + 18;
  const cols = [
    { w: 62, align: 'left' as const },
    { w: 70, align: 'left' as const },
    { w: width - 62 - 70 - 3 * 78, align: 'left' as const },
    { w: 78, align: 'right' as const },
    { w: 78, align: 'right' as const },
    { w: 78, align: 'right' as const },
  ];
  const row = (vals: string[], rowY: number, bold = false) => {
    let x = left + 6;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    let h = 0;
    cols.forEach((col, i) => {
      doc.text(vals[i] ?? '', x, rowY, { width: col.w - 8, align: col.align });
      h = Math.max(h, doc.heightOfString(vals[i] ?? '', { width: col.w - 8 }));
      x += col.w;
    });
    return Math.max(h, 12) + 8;
  };
  const header = () => {
    doc.rect(left, y, width, 20).fill('#f3f4f6');
    doc.fillColor('#374151');
    row(['Date', 'Reference', 'Details', 'Debit', 'Credit', 'Balance'], y + 6, true);
    y += 26;
    doc.fillColor('#111827');
  };
  header();
  y += row([fmtDate(st.period.from), '', 'Opening balance', '', '', signed(st.opening)], y, true);
  for (const l of st.lines) {
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = 40;
      header();
    }
    y += row([fmtDate(l.date), l.reference, l.details, l.debit ? money(l.debit) : '', l.credit ? money(l.credit) : '', signed(l.balance)], y);
    doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor('#f3f4f6').stroke();
  }
  y += row([fmtDate(st.period.to), '', 'Closing balance', money(st.totals.invoiced), money(st.totals.received + st.totals.credited), signed(st.closing)], y, true);

  // Open invoices + how to pay ----------------------------------------------------
  if (y > doc.page.height - 200) {
    doc.addPage();
    y = 40;
  }
  y += 12;
  const blockTop = y;
  if (st.openInvoices.length) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('UNPAID INVOICES', left, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#374151');
    for (const i of st.openInvoices.slice(0, 15)) {
      const overdue = i.status === 'OVERDUE';
      doc.fillColor(overdue ? '#dc2626' : '#374151').text(`${i.invoiceNumber}  ·  due ${fmtDate(i.dueDate)}${overdue ? ' (overdue)' : ''}`, left, y, { width: 220 });
      doc.text(money(i.balance), left + 220, y, { width: 80, align: 'right' });
      y += 13;
    }
    if (st.openInvoices.length > 15) {
      doc.fillColor(muted).text(`...and ${st.openInvoices.length - 15} more`, left, y);
      y += 13;
    }
  }
  const payLines = [s.bankName ? `Bank: ${s.bankName}` : null, s.accountNumber ? `A/C: ${s.accountNumber}` : null, s.ifscCode ? `IFSC: ${s.ifscCode}` : null, s.upiId ? `UPI: ${s.upiId}` : null].filter(Boolean);
  if (st.amountDue > 0 && (payLines.length || qr)) {
    const px = right - 230;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('HOW TO PAY', px, blockTop);
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(payLines.join('\n'), px, blockTop + 14, { width: 140 });
    if (qr) {
      doc.image(qr, px + 145, blockTop, { width: 80 });
      doc.fontSize(7).fillColor(muted).text('Scan to pay via UPI', px + 145, blockTop + 82, { width: 80, align: 'center' });
    }
    y = Math.max(y, blockTop + 100);
  }
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(muted).text('Please let us know if anything on this statement looks wrong.', left, y + 16, { width, align: 'center' });

  doc.end();
  return done;
}
