import { useState } from 'react';
import { UNITS, UNIT_KEYS, unitLabel, unitOf, type Unit } from '../lib/units';
import { Link } from 'react-router-dom';
import { Download, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  useConfirm,
} from '../components/ui';
import { useToast } from '../components/toast';
import { useDebounced, useLoad } from '../lib/useLoad';
import { del, downloadFile, get, post, put } from '../lib/api';
import { money } from '../lib/format';
import type { Product } from '../lib/types';

interface FormState {
  name: string;
  sku: string;
  category: string;
  description: string;
  price: string;
  unit: Unit;
  minCharge: string;
  costPrice: string;
  hsnCode: string;
  taxRate: string;
  stock: string;
  lowStockThreshold: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

const emptyForm: FormState = {
  name: '',
  sku: '',
  category: '',
  description: '',
  price: '',
  unit: 'pcs',
  minCharge: '',
  costPrice: '',
  hsnCode: '',
  taxRate: '',
  stock: '0',
  lowStockThreshold: '5',
  status: 'ACTIVE',
};

const toForm = (p: Product): FormState => ({
  name: p.name,
  sku: p.sku ?? '',
  category: p.category ?? '',
  description: p.description ?? '',
  price: String(p.price),
  unit: unitOf(p.unit),
  minCharge: p.minCharge ? String(p.minCharge) : '',
  costPrice: String(p.costPrice ?? 0),
  hsnCode: p.hsnCode ?? '',
  taxRate: p.taxRate === null || p.taxRate === undefined ? '' : String(p.taxRate),
  stock: String(p.stock),
  lowStockThreshold: String(p.lowStockThreshold),
  status: p.status,
});

export default function Products() {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useLoad(
    () => get<Product[]>('/products', { search: q || undefined, includeArchived: showArchived ? 'true' : undefined }),
    [q, showArchived],
  );

  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm(toForm(p));
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (form.price === '' || Number(form.price) < 0) return toast.error('Enter a valid price');
    setSaving(true);
    const body = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      description: form.description,
      price: Number(form.price),
      unit: form.unit,
      minCharge: form.minCharge === '' ? null : Number(form.minCharge),
      costPrice: form.costPrice === '' ? 0 : Number(form.costPrice),
      hsnCode: form.hsnCode,
      taxRate: form.taxRate === '' ? '' : Number(form.taxRate),
      lowStockThreshold: form.lowStockThreshold === '' ? 0 : Number(form.lowStockThreshold),
      status: form.status,
    };
    // Stock changes on the server as orders and production happen, so only send it when
    // the user actually changed it (or when creating) to avoid overwriting newer values.
    const stock = form.stock === '' ? 0 : Number(form.stock);
    if (!editing || stock !== editing.stock) Object.assign(body, { stock });
    try {
      if (editing) await put(`/products/${editing.id}`, body);
      else await post('/products', body);
      toast.success(editing ? 'Product updated' : 'Product added');
      setOpen(false);
      void reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Product) => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: 'Products used on invoices or production will be archived instead, so your history stays intact.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const msg = await del(`/products/${p.id}`);
      toast.success(msg ?? 'Product deleted');
      void reload();
    } catch (err) {
      toast.error(err);
    }
  };

  const exportCsv = async () => {
    try {
      await downloadFile('/export/products', 'products.csv');
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Everything you sell, with pricing, tax and finished stock."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={15} /> Export CSV
            </Button>
            <Button onClick={openNew}>
              <Plus size={15} /> Add product
            </Button>
          </>
        }
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded" />
            Show archived
          </label>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState
            title={search ? 'No products match your search' : 'No products yet'}
            description="Add the products you sell so they can be picked on invoices."
            action={!search && <Button onClick={openNew}>Add product</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Margin</Th>
                <Th>Tax</Th>
                <Th>HSN</Th>
                <Th className="text-right">Stock</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((p) => {
                const margin = p.price > 0 ? ((p.price - (p.costPrice ?? 0)) / p.price) * 100 : null;
                const counted = unitOf(p.unit) === 'pcs';
                const low = counted && p.stock <= p.lowStockThreshold;
                const madeToOrder = (p.bom?._count.items ?? 0) > 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">{[p.sku, p.category].filter(Boolean).join(' · ') || '—'}</div>
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {money(p.price)}
                      {unitOf(p.unit) !== 'pcs' && <span className="text-xs text-slate-500">/{unitLabel(p.unit)}</span>}
                    </Td>
                    <Td className="text-right tabular-nums">{p.costPrice ? money(p.costPrice) : '—'}</Td>
                    <Td className="text-right tabular-nums">{margin === null || !p.costPrice ? '—' : `${margin.toFixed(0)}%`}</Td>
                    <Td>{p.taxRate === null || p.taxRate === undefined ? <span className="text-slate-400">default</span> : `${p.taxRate}%`}</Td>
                    <Td>{p.hsnCode ?? '—'}</Td>
                    <Td className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        {!counted ? <span className="text-xs text-slate-500">per job</span> : low ? <Badge tone="red">{p.stock}</Badge> : <span className="tabular-nums">{p.stock}</span>}
                        {madeToOrder && <span className="text-[11px] text-slate-500">made to order</span>}
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/products/${p.id}/bom`} className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50">
                          Materials (BOM)
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label="Edit">
                          <Pencil size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label="Delete" className="hover:text-red-600">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add product'}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Add product'}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Name *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus required />
          </Field>
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Sticker" />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label={form.unit === 'pcs' ? 'Selling price *' : `Rate per ${unitLabel(form.unit)} *`}>
            <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} required />
          </Field>
          <Field label="Sold by" hint={form.unit === 'pcs' ? 'Counted pieces, with stock' : 'Measured per job (made to order, no finished stock)'}>
            <Select value={form.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
              {UNIT_KEYS.map((u) => (
                <option key={u} value={u}>
                  {u === 'pcs' ? 'Piece' : `Per ${UNITS[u].label}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum charge per job (₹)" hint="Smaller jobs are billed at this amount (before GST). Blank = none.">
            <Input type="number" min={0} step="0.01" value={form.minCharge} onChange={(e) => set('minCharge', e.target.value)} placeholder="e.g. 150" />
          </Field>
          <Field label="Cost price" hint="Used for margin reports">
            <Input type="number" min={0} step="0.01" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} />
          </Field>
          <Field label="HSN / SAC code">
            <Input value={form.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} />
          </Field>
          <Field label="Tax rate (%)" hint="Leave blank to use the business default">
            <Input type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={(e) => set('taxRate', e.target.value)} />
          </Field>
          <Field label="Finished stock">
            <Input type="number" step="1" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
          </Field>
          <Field label="Low stock alert at">
            <Input type="number" min={0} step="1" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value as FormState['status'])}>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <button type="submit" className="hidden" />
        </form>
      </Modal>
      {confirm.dialog}
    </div>
  );
}
