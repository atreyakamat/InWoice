import { useMemo, useState, type FormEvent } from 'react';
import { Ban, Eye } from 'lucide-react';
import { Button, Card, Field, Input, Modal, Select, StatusBadge, Table, Td, Th, useConfirm } from './ui';
import { useToast } from './toast';
import { get, openPdf, post } from '../lib/api';
import { date, isoDate, money } from '../lib/format';
import type { CreditNote, CreditReason, Invoice } from '../lib/types';

const REASONS: { value: CreditReason; label: string }[] = [
  { value: 'RETURN', label: 'Sales return' },
  { value: 'DISCOUNT', label: 'Post-sale discount' },
  { value: 'DEFICIENCY', label: 'Damaged / deficient goods' },
  { value: 'CORRECTION', label: 'Correction in invoice' },
  { value: 'OTHER', label: 'Other' },
];
const reasonLabel = (r: string) => REASONS.find((x) => x.value === r)?.label ?? r;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What is still creditable on each invoice line, given its active credit notes. */
function remainingByLine(inv: Invoice) {
  const ratio = inv.subtotal > 0 ? (inv.subtotal - inv.discount) / inv.subtotal : 0;
  const active = (inv.creditNotes ?? []).filter((c) => c.status === 'ISSUED');
  return (inv.items ?? []).map((item) => {
    const credited = active.flatMap((c) => c.items).filter((ci) => ci.invoiceItemId === item.id);
    const qty = item.quantity - credited.reduce((s, c) => s + c.quantity, 0);
    const value = r2(item.total * ratio - credited.reduce((s, c) => s + c.taxableValue, 0));
    return { item, qty, value, unitNet: item.unitPrice * ratio };
  });
}

export function CreditNoteModal({ inv, open, onClose, onSaved }: { inv: Invoice; open: boolean; onClose: () => void; onSaved: (inv: Invoice) => void }) {
  const toast = useToast();
  const lines = useMemo(() => remainingByLine(inv), [inv]);
  const [mode, setMode] = useState<'RETURN' | 'VALUE'>('RETURN');
  const [reason, setReason] = useState<CreditReason>('RETURN');
  const [restock, setRestock] = useState(true);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [shipping, setShipping] = useState('');
  const [when, setWhen] = useState(isoDate(new Date()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const shippingLeft = r2(inv.shippingCost - (inv.creditNotes ?? []).filter((c) => c.status === 'ISSUED').reduce((s, c) => s + c.shippingAmount, 0));

  const switchMode = (m: 'RETURN' | 'VALUE') => {
    setMode(m);
    setEntries({});
    setReason(m === 'RETURN' ? 'RETURN' : 'DISCOUNT');
  };

  // Live preview, mirroring the server's calculation.
  const preview = lines.map((l) => {
    const raw = Number(entries[l.item.id] || 0);
    const taxable = mode === 'RETURN' ? r2(raw * l.unitNet) : r2(raw);
    return { ...l, raw, taxable, tax: r2((taxable * l.item.taxRate) / 100) };
  });
  const taxable = r2(preview.reduce((s, p) => s + p.taxable, 0));
  const tax = r2(preview.reduce((s, p) => s + p.tax, 0));
  const total = r2(taxable + tax + Number(shipping || 0));
  const refund = r2(Math.max(0, total - inv.balanceDue));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    for (const p of preview) {
      if (mode === 'RETURN' && (p.raw > p.qty || !Number.isInteger(p.raw) || p.raw < 0)) return toast.error(`${p.item.name}: enter a whole number up to ${p.qty}`);
      if (mode === 'VALUE' && (p.raw < 0 || p.raw > p.value + 0.005)) return toast.error(`${p.item.name}: at most ${money(p.value)} can be credited`);
    }
    if (Number(shipping || 0) > shippingLeft + 0.005) return toast.error(`At most ${money(shippingLeft)} of shipping can be credited`);
    if (total <= 0) return toast.error('Enter a quantity or amount on at least one line');
    setSaving(true);
    try {
      const cn = await post<CreditNote>(`/invoices/${inv.id}/credit-notes`, {
        reason,
        date: when || null,
        notes: notes.trim() || null,
        restock: mode === 'RETURN' && restock,
        shippingAmount: Number(shipping || 0),
        items: preview
          .filter((p) => p.raw > 0)
          .map((p) => (mode === 'RETURN' ? { invoiceItemId: p.item.id, quantity: p.raw } : { invoiceItemId: p.item.id, quantity: 0, amount: p.raw })),
      });
      toast.success(`Credit note ${cn.creditNoteNumber} issued`);
      onSaved(await get<Invoice>(`/invoices/${inv.id}`));
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Credit note for ${inv.invoiceNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="cn-form" loading={saving} disabled={total <= 0}>
            Issue credit note {total > 0 ? `· ${money(total)}` : ''}
          </Button>
        </>
      }
    >
      <form id="cn-form" onSubmit={submit} className="space-y-4">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
          {(
            [
              ['RETURN', 'Goods returned'],
              ['VALUE', 'Reduce the price'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={mode === m ? 'rounded-md bg-white px-3 py-1.5 font-medium text-slate-900 shadow-sm' : 'px-3 py-1.5 text-slate-500 hover:text-slate-800'}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="-mx-5 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">{mode === 'RETURN' ? 'Can return' : 'Can credit'}</Th>
                <Th className="w-32 text-right">{mode === 'RETURN' ? 'Qty returned' : 'Amount (pre-tax)'}</Th>
                <Th className="text-right">Credit incl. tax</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.map((p) => (
                <tr key={p.item.id}>
                  <Td className="font-medium text-slate-900">
                    {p.item.name}
                    <div className="text-xs font-normal text-slate-500">
                      {money(p.unitNet)} each after discount · {p.item.taxRate}% tax
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-slate-500">{mode === 'RETURN' ? p.qty : money(p.value)}</Td>
                  <Td className="text-right">
                    <Input
                      type="number"
                      min={0}
                      max={mode === 'RETURN' ? p.qty : p.value}
                      step={mode === 'RETURN' ? 1 : '0.01'}
                      value={entries[p.item.id] ?? ''}
                      onChange={(e) => setEntries({ ...entries, [p.item.id]: e.target.value })}
                      disabled={mode === 'RETURN' ? p.qty <= 0 : p.value <= 0}
                      className="text-right"
                      aria-label={`${p.item.name} ${mode === 'RETURN' ? 'quantity' : 'amount'}`}
                    />
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{p.taxable > 0 ? money(p.taxable + p.tax) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value as CreditReason)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          {shippingLeft > 0 && (
            <Field label="Refund shipping" hint={`Up to ${money(shippingLeft)}`}>
              <Input type="number" min={0} max={shippingLeft} step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} />
            </Field>
          )}
          <Field label="Notes" className="sm:col-span-3">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 items arrived damaged" />
          </Field>
        </div>

        {mode === 'RETURN' && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Put returned items back into stock
          </label>
        )}

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Taxable value</span>
            <span className="tabular-nums">{money(taxable)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>{inv.igst > 0 ? 'IGST' : 'CGST + SGST'} reversed</span>
            <span className="tabular-nums">{money(tax)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
            <span>Total credit</span>
            <span className="tabular-nums">{money(total)}</span>
          </div>
          {refund > 0 && (
            <p className="mt-2 text-amber-700">
              The customer has already paid for this, so <b>{money(refund)}</b> is a refund you owe them. Pay it back and keep the credit note as the record.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}

export function CreditNotesCard({ inv, onChanged }: { inv: Invoice; onChanged: (inv: Invoice) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const notes = inv.creditNotes ?? [];
  if (!notes.length) return null;

  const cancel = async (cn: CreditNote) => {
    const ok = await confirm({
      title: `Cancel ${cn.creditNoteNumber}?`,
      message: `The invoice balance goes back up by ${money(cn.total)}${cn.restock ? ' and the returned items are taken out of stock again' : ''}.`,
      confirmLabel: 'Cancel credit note',
      danger: true,
    });
    if (!ok) return;
    setBusy(cn.id);
    try {
      await post(`/credit-notes/${cn.id}/cancel`);
      onChanged(await get<Invoice>(`/invoices/${inv.id}`));
      toast.success('Credit note cancelled');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Credit notes" bodyClassName="p-0">
      <Table>
        <thead>
          <tr>
            <Th>Number</Th>
            <Th>Date</Th>
            <Th>Reason</Th>
            <Th className="text-right">Amount</Th>
            <Th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {notes.map((cn) => (
            <tr key={cn.id} className={cn.status === 'CANCELLED' ? 'opacity-60' : undefined}>
              <Td className="whitespace-nowrap font-medium text-slate-900">
                {cn.creditNoteNumber} {cn.status === 'CANCELLED' && <StatusBadge status="CANCELLED" />}
              </Td>
              <Td className="whitespace-nowrap">{date(cn.date)}</Td>
              <Td className="text-slate-600">
                {reasonLabel(cn.reason)}
                {cn.refundAmount > 0 && <div className="text-xs text-amber-700">Refund {money(cn.refundAmount)}</div>}
              </Td>
              <Td className="whitespace-nowrap text-right font-medium tabular-nums">{money(cn.total)}</Td>
              <Td className="whitespace-nowrap text-right">
                <button
                  onClick={() => openPdf(`/credit-notes/${cn.id}/pdf`).catch((err) => toast.error(err))}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="View credit note PDF"
                  title="View PDF"
                >
                  <Eye size={15} />
                </button>
                {cn.status === 'ISSUED' && (
                  <button
                    onClick={() => cancel(cn)}
                    disabled={busy === cn.id}
                    className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label="Cancel credit note"
                    title="Cancel credit note"
                  >
                    <Ban size={15} />
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {confirm.dialog}
    </Card>
  );
}
