import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, Field, Input, Modal, Select } from './ui';
import { useToast } from './toast';
import { post } from '../lib/api';
import { money } from '../lib/format';
import { round2 } from '../lib/docmath';
import { blankLine, toNum, type Line, type LineType, type salesTotals } from '../lib/salesLines';
import type { Customer, Pack, Product } from '../lib/types';

/**
 * Shared pieces of the invoice, quote and recurring-invoice forms: the line items, the
 * customer picker (with quick add) and the totals. Helpers live in lib/salesLines.
 */

// ---------------------------------------------------------------------------
// Customer picker with quick add
// ---------------------------------------------------------------------------

export function CustomerSelect({
  customers,
  onCustomers,
  value,
  onChange,
}: {
  customers: Customer[];
  onCustomers: (cs: Customer[]) => void;
  value: string;
  onChange: (id: string) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [qa, setQa] = useState({ name: '', email: '', phone: '', state: '' });
  const [saving, setSaving] = useState(false);

  const quickAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!qa.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      const c = await post<Customer>('/customers', qa);
      onCustomers([...customers, c].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(c.id);
      setOpen(false);
      setQa({ name: '', email: '', phone: '', state: '' });
      toast.success(`${c.name} added`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Customer">
          <option value="">Select a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.state ? ` (${c.state})` : ''}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Plus size={15} /> New
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New customer"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="quick-customer" loading={saving}>
              Add customer
            </Button>
          </>
        }
      >
        <form id="quick-customer" onSubmit={quickAdd} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input value={qa.name} onChange={(e) => setQa({ ...qa, name: e.target.value })} autoFocus required />
          </Field>
          <Field label="Email">
            <Input type="email" value={qa.email} onChange={(e) => setQa({ ...qa, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={qa.phone} onChange={(e) => setQa({ ...qa, phone: e.target.value })} />
          </Field>
          <Field label="State" hint="Used for GST" className="sm:col-span-2">
            <Input value={qa.state} onChange={(e) => setQa({ ...qa, state: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

export function LineItemsCard({
  lines,
  onLines,
  products,
  packs,
  defaultTax,
  priceHint,
}: {
  lines: Line[];
  onLines: (fn: (ls: Line[]) => Line[]) => void;
  products: Product[];
  packs: Pack[];
  defaultTax: number;
  /** Shown under the price field, e.g. "Blank = catalog price on each run". */
  priceHint?: string;
}) {
  const updateLine = (key: number, patch: Partial<Line>) => onLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickItem = (line: Line, itemId: string) => {
    if (!itemId) return updateLine(line.key, { itemId: '' });
    const ref = line.type === 'PRODUCT' ? products.find((x) => x.id === itemId) : packs.find((x) => x.id === itemId);
    if (ref) updateLine(line.key, { itemId, name: ref.name, unitPrice: String(ref.price), taxRate: String(ref.taxRate ?? defaultTax), hsnCode: ref.hsnCode ?? '' });
  };

  const optionsFor = (line: Line) => {
    const list: { id: string; name: string; price: number }[] = line.type === 'PRODUCT' ? products : line.type === 'PACK' ? packs : [];
    // Keep archived items referenced by an existing document selectable.
    if (line.itemId && !list.some((o) => o.id === line.itemId)) return [...list, { id: line.itemId, name: `${line.name} (archived)`, price: toNum(line.unitPrice) }];
    return list;
  };

  return (
    <Card
      title="Line items"
      actions={
        <Button size="sm" variant="secondary" onClick={() => onLines((ls) => [...ls, blankLine(defaultTax)])}>
          <Plus size={14} /> Add line
        </Button>
      }
    >
      {lines.length === 0 && <p className="text-sm text-slate-500">No lines yet. Add one to get started.</p>}
      <div className="space-y-3">
        {lines.map((l, idx) => {
          const amount = round2(toNum(l.quantity) * toNum(l.unitPrice));
          return (
            <div key={l.key} className="rounded-lg border border-slate-200 p-3">
              <div className="grid gap-2 sm:grid-cols-12">
                <Field label="Type" className="sm:col-span-3">
                  <Select
                    value={l.type}
                    onChange={(e) => updateLine(l.key, { type: e.target.value as LineType, itemId: '', name: '', unitPrice: '', hsnCode: '', taxRate: String(defaultTax) })}
                  >
                    <option value="PRODUCT">Product</option>
                    <option value="PACK">Pack</option>
                    <option value="CUSTOM">Custom</option>
                  </Select>
                </Field>
                {l.type === 'CUSTOM' ? (
                  <Field label="Description" className="sm:col-span-9">
                    <Input value={l.name} onChange={(e) => updateLine(l.key, { name: e.target.value })} placeholder="e.g. Design fee" />
                  </Field>
                ) : (
                  <Field label={l.type === 'PACK' ? 'Pack' : 'Product'} className="sm:col-span-9">
                    <Select value={l.itemId} onChange={(e) => pickItem(l, e.target.value)}>
                      <option value="">Select…</option>
                      {optionsFor(l).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} — {money(o.price)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Qty" className="sm:col-span-2">
                  <Input type="number" min={1} step={1} inputMode="numeric" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} />
                </Field>
                <Field label="Unit price" className="sm:col-span-3" hint={l.type !== 'CUSTOM' ? priceHint : undefined}>
                  <Input type="number" min={0} step="0.01" inputMode="decimal" value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })} />
                </Field>
                <Field label="Tax %" className="sm:col-span-2">
                  <Input type="number" min={0} max={100} step="0.01" value={l.taxRate} onChange={(e) => updateLine(l.key, { taxRate: e.target.value })} />
                </Field>
                <Field label="HSN/SAC" className="sm:col-span-2">
                  <Input value={l.hsnCode} onChange={(e) => updateLine(l.key, { hsnCode: e.target.value })} />
                </Field>
                <div className="flex items-end justify-between gap-2 sm:col-span-3">
                  <div className="pb-2 text-sm">
                    <span className="text-xs text-slate-500">Amount </span>
                    <span className="font-semibold tabular-nums">{money(amount)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="mb-1 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove line ${idx + 1}`}
                    title="Remove line"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export function TotalsCard({
  totals,
  interState,
  discount,
  onDiscount,
  shipping,
  onShipping,
  note,
}: {
  totals: ReturnType<typeof salesTotals>;
  interState: boolean;
  discount: string;
  onDiscount: (v: string) => void;
  shipping: string;
  onShipping: (v: string) => void;
  note?: string;
}) {
  return (
    <Card title="Summary">
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Field label="Discount">
          <Input type="number" min={0} step="0.01" value={discount} onChange={(e) => onDiscount(e.target.value)} />
        </Field>
        <Field label="Shipping">
          <Input type="number" min={0} step="0.01" value={shipping} onChange={(e) => onShipping(e.target.value)} />
        </Field>
      </div>
      <dl className="space-y-1.5 text-sm">
        <Row label="Subtotal" value={money(totals.subtotal)} />
        {totals.discount > 0 && <Row label="Discount" value={`− ${money(totals.discount)}`} />}
        {interState ? (
          <Row label="IGST" value={money(totals.igst)} />
        ) : (
          <>
            <Row label="CGST" value={money(totals.cgst)} />
            <Row label="SGST" value={money(totals.sgst)} />
          </>
        )}
        {totals.shippingCost > 0 && <Row label="Shipping" value={money(totals.shippingCost)} />}
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
          <dt>Total</dt>
          <dd className="tabular-nums">{money(totals.grandTotal)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-slate-400">{note ?? 'Estimate — final totals are computed on save.'}</p>
      <p className="mt-1 text-xs text-slate-500">{interState ? 'Inter-state supply: IGST applies.' : 'Intra-state supply: CGST + SGST apply.'}</p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}
