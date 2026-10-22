import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, useConfirm } from '../components/ui';
import { useToast } from '../components/toast';
import { useLoad } from '../lib/useLoad';
import { del, get, post, put } from '../lib/api';
import { money } from '../lib/format';
import type { Pack, Product } from '../lib/types';

interface Row {
  key: number;
  productId: string;
  quantity: string;
}

interface FormState {
  name: string;
  description: string;
  price: string;
  hsnCode: string;
  taxRate: string;
  rows: Row[];
}

let rowKey = 0;
const emptyForm = (): FormState => ({ name: '', description: '', price: '', hsnCode: '', taxRate: '', rows: [{ key: ++rowKey, productId: '', quantity: '1' }] });

export default function Packs() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useLoad(async () => {
    const [packs, products] = await Promise.all([get<Pack[]>('/packs'), get<Product[]>('/products')]);
    return { packs, products };
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Pack | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const products = data?.products ?? [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };
  const openEdit = (p: Pack) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? '',
      price: String(p.price),
      hsnCode: p.hsnCode ?? '',
      taxRate: p.taxRate === null || p.taxRate === undefined ? '' : String(p.taxRate),
      rows: p.items.map((i) => ({ key: ++rowKey, productId: i.productId, quantity: String(i.quantity) })),
    });
    setOpen(true);
  };

  const updateRow = (key: number, patch: Partial<Row>) =>
    setForm((f) => ({ ...f, rows: f.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  const formValue = form.rows.reduce((s, r) => s + (productById.get(r.productId)?.price ?? 0) * (Number(r.quantity) || 0), 0);

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (form.price === '' || Number(form.price) < 0) return toast.error('Enter a valid price');
    const items = form.rows.filter((r) => r.productId).map((r) => ({ productId: r.productId, quantity: Number(r.quantity) }));
    if (items.some((i) => !(i.quantity > 0) || !Number.isInteger(i.quantity))) return toast.error('Quantities must be whole numbers above zero');
    if (!items.length) return toast.error('Add at least one product to the pack');
    setSaving(true);
    const body = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      hsnCode: form.hsnCode,
      taxRate: form.taxRate === '' ? '' : Number(form.taxRate),
      items,
    };
    try {
      if (editing) await put(`/packs/${editing.id}`, body);
      else await post('/packs', body);
      toast.success(editing ? 'Pack updated' : 'Pack created');
      setOpen(false);
      void reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Pack) => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: 'Packs used on past invoices will be archived instead of deleted.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const msg = await del(`/packs/${p.id}`);
      toast.success(msg ?? 'Pack deleted');
      void reload();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div>
      <PageHeader
        title="Packs"
        subtitle="Bundles of products sold as one line. Selling a pack deducts each component's stock."
        actions={
          <Button onClick={openNew} disabled={!products.length}>
            <Plus size={15} /> New pack
          </Button>
        }
      />

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Spinner />
      ) : !data?.packs.length ? (
        <Card>
          <EmptyState
            title="No packs yet"
            description={products.length ? 'Group products into a bundle with its own price.' : 'Add products first, then bundle them into packs.'}
            action={products.length ? <Button onClick={openNew}>Create a pack</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.packs.map((p) => {
            const value = p.componentValue ?? 0;
            const savings = value - p.price;
            return (
              <Card
                key={p.id}
                title={p.name}
                actions={
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label="Edit">
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label="Delete" className="hover:text-red-600">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                }
              >
                {p.description && <p className="mb-3 text-sm text-slate-500">{p.description}</p>}
                <div className="flex items-end justify-between">
                  <div className="text-2xl font-bold tabular-nums">{money(p.price)}</div>
                  {(p.availableStock ?? 0) > 0 ? (
                    <Badge tone="green">{p.availableStock} available</Badge>
                  ) : (
                    <Badge tone="red">Out of stock</Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Value if sold separately: {money(value)}
                  {savings > 0 && <span className="ml-1 font-medium text-emerald-600">(customer saves {money(savings)})</span>}
                </div>
                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
                  {p.items.map((i) => (
                    <li key={i.id} className="flex justify-between py-1.5">
                      <span>
                        {i.quantity} × {i.product.name}
                      </span>
                      <span className="text-xs text-slate-500">{i.product.stock} in stock</span>
                    </li>
                  ))}
                  {!p.items.length && <li className="py-1.5 text-slate-400">No components</li>}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New pack'}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Create pack'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label="Pack price *" hint={formValue > 0 ? `Components are worth ${money(formValue)} separately` : undefined}>
            <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          </Field>
          <Field label="Tax rate (%)" hint="Blank = business default">
            <Input type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))} />
          </Field>
          <Field label="HSN / SAC code">
            <Input value={form.hsnCode} onChange={(e) => setForm((f) => ({ ...f, hsnCode: e.target.value }))} />
          </Field>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Components</h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setForm((f) => ({ ...f, rows: [...f.rows, { key: ++rowKey, productId: '', quantity: '1' }] }))}
            >
              <Plus size={14} /> Add product
            </Button>
          </div>
          <div className="space-y-2">
            {form.rows.map((r) => (
              <div key={r.key} className="flex items-center gap-2">
                <Select className="flex-1" value={r.productId} onChange={(e) => updateRow(r.key, { productId: e.target.value })}>
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {money(p.price)}
                    </option>
                  ))}
                </Select>
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  step={1}
                  value={r.quantity}
                  onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                  aria-label="Quantity"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Remove"
                  onClick={() => setForm((f) => ({ ...f, rows: f.rows.filter((x) => x.key !== r.key) }))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
      {confirm.dialog}
    </div>
  );
}
