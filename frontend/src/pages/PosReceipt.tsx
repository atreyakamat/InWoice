import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, money } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { Invoice } from '../lib/types';
import { qtyText } from '../lib/units';

/**
 * A till receipt sized for 80 mm thermal printers (also fine on A4). Opens the print dialog
 * by itself. For a full GST invoice, use the invoice PDF.
 */
export default function PosReceipt() {
  const { id = '' } = useParams();
  const { settings: s } = useAuth();
  const { data: inv } = useLoad(() => get<Invoice>(`/pos/receipt/${id}`), [id]);

  useEffect(() => {
    if (!inv || !s) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [inv, s]);

  if (!inv || !s) return <p className="p-4 text-sm">Loading…</p>;
  const paidBy = (inv.payments ?? []).map((p) => p.paymentMethod.replace('_', ' ').toLowerCase()).join(', ');

  return (
    <div className="receipt mx-auto bg-white p-3 font-mono text-[12px] leading-snug text-black">
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print { body { background: #fff; } .no-print { display: none; } }
        .receipt { width: 74mm; }
      `}</style>
      <div className="text-center">
        <div className="text-[15px] font-bold">{s.businessName}</div>
        {s.address && <div className="whitespace-pre-line">{s.address}</div>}
        {s.phone && <div>{s.phone}</div>}
        {s.gstNumber && <div>GSTIN {s.gstNumber}</div>}
        <div className="mt-1 font-bold">{s.gstNumber ? 'TAX INVOICE' : 'RECEIPT'}</div>
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between">
        <span>{inv.invoiceNumber}</span>
        <span>{date(inv.date)}</span>
      </div>
      {inv.customer.name !== 'Walk-in customer' && <div>To: {inv.customer.name}</div>}
      <div className="my-2 border-t border-dashed border-black" />
      {(inv.items ?? []).map((i) => (
        <div key={i.id} className="mb-1">
          <div>{i.name}</div>
          {i.details && <div className="text-[11px]">{i.details}</div>}
          <div className="flex justify-between">
            <span>
              {qtyText(i.quantity, i.unit)} × {money(i.unitPrice)} {i.taxRate ? `(${i.taxRate}%)` : ''}
            </span>
            <span>{money(i.total)}</span>
          </div>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <Line label="Subtotal" value={money(inv.subtotal)} />
      {inv.discount > 0 && <Line label="Discount" value={`-${money(inv.discount)}`} />}
      {inv.cgst > 0 && <Line label="CGST" value={money(inv.cgst)} />}
      {inv.sgst > 0 && <Line label="SGST" value={money(inv.sgst)} />}
      {inv.igst > 0 && <Line label="IGST" value={money(inv.igst)} />}
      <div className="mt-1 flex justify-between text-[15px] font-bold">
        <span>TOTAL</span>
        <span>{money(inv.grandTotal)}</span>
      </div>
      {inv.amountPaid > 0 && <Line label={`Paid (${paidBy})`} value={money(inv.amountPaid)} />}
      {inv.balanceDue > 0 && <Line label="Balance due" value={money(inv.balanceDue)} />}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="text-center">{s.thankYouMessage || 'Thank you!'}</div>
      <div className="no-print mt-4 flex justify-center gap-2 font-sans">
        <button className="rounded border px-3 py-1" onClick={() => window.print()}>
          Print
        </button>
        <button className="rounded border px-3 py-1" onClick={() => window.close()}>
          Close
        </button>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
