import { useState } from 'react';
import { Ban } from 'lucide-react';
import { Button, Card, Field, Input, Modal, Select, StatusBadge, Table, Td, Th, useConfirm } from './ui';
import { useToast } from './toast';
import { post } from '../lib/api';
import { date, isoDate, money, num } from '../lib/format';
import type { Bill, DebitNote } from '../lib/types';

const REASONS = [
  { value: 'RETURN', label: 'Goods returned' },
  { value: 'DISCOUNT', label: 'Price reduced after the bill' },
  { value: 'DEFICIENCY', label: 'Damaged / short supplied' },
  { value: 'CORRECTION', label: 'Correction in bill' },
  { value: 'OTHER', label: 'Other' },
];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What can still be debited on each bill line, given its active debit notes. */
function remaining(bill: Bill) {
  const ratio = bill.subtotal > 0 ? (bill.subtotal - bill.discount) / bill.subtotal : 0;
  const active = (bill.debitNotes ?? []).filter((d) => d.status === 'ISSUED');
  return (bill.items ?? []).map((item) => {
    const done = active.flatMap((d) => d.items).filter((i) => i.billItemId === item.id);
    return {
      item,
      qty: r2(item.quantity - done.reduce((s, d) => s + d.quantity, 0)),
      value: r2(item.total * ratio - done.reduce((s, d) => s + d.taxableValue, 0)),
      unitNet: item.unitPrice * ratio,
    };
  });
}

/** Debit note to the supplier: goods returned (by quantity) or a price reduction (by amount). */
export function DebitNoteModal({ bill, open, onClose, onSaved }: { bill: Bill; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const lines = remaining(bill);
  const [mode, setMode] = useState<'RETURN' | 'VALUE'>('RETURN');
  const [reason, setReason] = useState('RETURN');
  const [restock, setRestock] = useState(true);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [when, setWhen] = useState(isoDate(new Date()));
  const [saving, setSaving] = useState(false);

  const preview = lines.map((l) => {
    const raw = Number(entries[l.item.id] || 0);
    const taxable = mode === 'RETURN' ? r2(raw * l.unitNet) : r2(raw);
    return { ...l, raw, taxable, tax: r2((taxable * l.item.taxRate) / 100) };
  });
  const taxable = r2(preview.reduce((s, p) => s + p.taxable, 0));
  const tax = r2(preview.reduce((s, p) => s + p.tax, 0));
  const total = r2(taxable + tax);
  const refund = r2(Math.max(0, total - bill.balanceDue));
  const hasMaterials = lines.some((l) => l.item.inventoryItemId);

  const save = async () => {
    const items = preview
      .filter((p) => p.raw > 0)
      .map((p) => (mode === 'RETURN' ? { billItemId: p.item.id, quantity: p.raw } : { billItemId: p.item.id, quantity: 0, amount: p.raw }));
    if (!items.length) return toast.error(mode === 'RETURN' ? 'Enter how many were returned on at least one line' : 'Enter an amount on at least one line');
    setSaving(true);
    try {
      const dn = await post<DebitNote>(`/bills/${bill.id}/debit-notes`, { reason, date: when, restock: mode === 'RETURN' && restock, items });
      toast.success(`Debit note ${dn.debitNoteNumber} issued`);
      setEntries({});
      onSaved();
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
      title={`Debit note against bill ${bill.billNumber}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={total <= 0}>
            Issue debit note
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {(['RETURN', 'VALUE'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setEntries({});
                setReason(m === 'RETURN' ? 'RETURN' : 'DISCOUNT');
              }}
              className={`rounded-md px-3 py-1.5 font-medium ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              {m === 'RETURN' ? 'Goods returned' : 'Reduce the price'}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
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
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Line</Th>
              <Th className="text-right">{mode === 'RETURN' ? 'Can return' : 'Can reduce'}</Th>
              <Th className="text-right">{mode === 'RETURN' ? 'Returned' : 'Reduce by (before GST)'}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {preview.map((p) => (
              <tr key={p.item.id}>
                <Td>
                  {p.item.description}
                  <div className="text-xs text-slate-500">
                    {money(p.item.unitPrice)} · GST {p.item.taxRate}%
                  </div>
                </Td>
                <Td className="text-right tabular-nums">{mode === 'RETURN' ? num(p.qty) : money(p.value)}</Td>
                <Td className="text-right">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    max={mode === 'RETURN' ? p.qty : p.value}
                    value={entries[p.item.id] ?? ''}
                    onChange={(e) => setEntries((x) => ({ ...x, [p.item.id]: e.target.value }))}
                    className="ml-auto w-28 text-right"
                    aria-label={`${mode === 'RETURN' ? 'Quantity returned' : 'Reduction'} for ${p.item.description}`}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {mode === 'RETURN' && hasMaterials && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            Take the returned materials out of stock
          </label>
        )}
        <div className="rounded-lg bg-slate-50 p-3">
          Before GST {money(taxable)} · GST {money(tax)} · <span className="font-semibold">Total {money(total)}</span>
          {refund > 0 && <p className="mt-1 text-amber-800">You had already paid this bill, so {money(refund)} is a refund the supplier owes you.</p>}
        </div>
      </div>
    </Modal>
  );
}

export function DebitNotesCard({ bill, onChanged }: { bill: Bill; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const notes = bill.debitNotes ?? [];
  if (!notes.length) return null;
  const cancel = async (d: DebitNote) => {
    if (!(await confirm({ title: `Cancel ${d.debitNoteNumber}?`, message: 'The bill balance comes back, and any returned materials go back into stock.', confirmLabel: 'Cancel debit note', danger: true }))) return;
    setBusy(d.id);
    try {
      await post(`/bills/debit-notes/${d.id}/cancel`);
      toast.success('Debit note cancelled');
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title="Debit notes" bodyClassName="p-0">
      <Table>
        <thead>
          <tr>
            <Th>Number</Th>
            <Th>Date</Th>
            <Th>Reason</Th>
            <Th className="text-right">Total</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {notes.map((d) => (
            <tr key={d.id}>
              <Td className="font-medium text-slate-900">{d.debitNoteNumber}</Td>
              <Td className="whitespace-nowrap">{date(d.date)}</Td>
              <Td className="text-slate-600">
                {REASONS.find((r) => r.value === d.reason)?.label ?? d.reason}
                {d.refundAmount > 0 && d.status === 'ISSUED' && <div className="text-xs text-amber-700">Refund due {money(d.refundAmount)}</div>}
              </Td>
              <Td className="text-right tabular-nums">{money(d.total)}</Td>
              <Td>
                <StatusBadge status={d.status} />
              </Td>
              <Td className="text-right">
                {d.status === 'ISSUED' && (
                  <Button size="sm" variant="ghost" onClick={() => void cancel(d)} loading={busy === d.id} title="Cancel" aria-label={`Cancel ${d.debitNoteNumber}`}>
                    <Ban size={14} />
                  </Button>
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
