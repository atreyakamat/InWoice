import { useState } from 'react';
import { Archive, Download, History, Pencil, Plus, Search, SlidersHorizontal } from 'lucide-react';
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
  Stat,
  Table,
  Td,
  Textarea,
  Th,
  useConfirm,
} from '../components/ui';
import { useToast } from '../components/toast';
import { useDebounced, useLoad } from '../lib/useLoad';
import { del, downloadFile, get, post, put } from '../lib/api';
import { dateTime, money, num, titleCase } from '../lib/format';
import { cn } from '../lib/utils';
import type { InventoryItem, StockMovement, Supplier } from '../lib/types';

const CATEGORIES = ['RAW_MATERIAL', 'PACKAGING', 'CONSUMABLE', 'FINISHED_GOOD'];
const ADJUST_TYPES = ['ADJUSTMENT', 'DAMAGE', 'RETURN', 'PURCHASE'];

interface Dashboard {
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  mostConsumed: { id: string; name: string; unit: string; consumedQty: number }[];
}

interface FormState {
  name: string;
  sku: string;
  category: string;
  unit: string;
  currentStock: string;
  minimumStock: string;
  reorderLevel: string;
  costPerUnit: string;
  supplierId: string;
  location: string;
  notes: string;
}

const emptyForm: FormState = {
  name: '',
  sku: '',
  category: 'RAW_MATERIAL',
  unit: 'unit',
  currentStock: '0',
  minimumStock: '0',
  reorderLevel: '0',
  costPerUnit: '0',
  supplierId: '',
  location: '',
  notes: '',
};

const n0 = (v: string) => (v === '' ? 0 : Number(v));

export default function Inventory() {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const q = useDebounced(search);

  const items = useLoad(
    () => get<InventoryItem[]>('/inventory', { search: q || undefined, category: category || undefined, lowStock: lowOnly ? 'true' : undefined }),
    [q, category, lowOnly],
  );
  const dash = useLoad(() => get<Dashboard>('/inventory/dashboard'));
  const suppliers = useLoad(() => get<Supplier[]>('/suppliers'));
  const reloadAll = () => {
    void items.reload();
    void dash.reload();
  };

  // Add / edit
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };
  const openEdit = (i: InventoryItem) => {
    setEditing(i);
    setForm({
      name: i.name,
      sku: i.sku ?? '',
      category: i.category,
      unit: i.unit,
      currentStock: String(i.currentStock),
      minimumStock: String(i.minimumStock),
      reorderLevel: String(i.reorderLevel),
      costPerUnit: String(i.costPerUnit),
      supplierId: i.supplierId ?? '',
      location: i.location ?? '',
      notes: i.notes ?? '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.unit.trim()) return toast.error('Unit is required');
    setSaving(true);
    const body: Record<string, unknown> = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      unit: form.unit,
      minimumStock: n0(form.minimumStock),
      reorderLevel: n0(form.reorderLevel),
      costPerUnit: n0(form.costPerUnit),
      supplierId: form.supplierId,
      location: form.location,
      notes: form.notes,
    };
    if (!editing) body.currentStock = n0(form.currentStock);
    try {
      if (editing) await put(`/inventory/${editing.id}`, body);
      else await post('/inventory', body);
      toast.success(editing ? 'Item updated' : 'Item added');
      setFormOpen(false);
      reloadAll();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Adjust stock
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [adj, setAdj] = useState({ delta: '', type: 'ADJUSTMENT', notes: '' });
  const [adjSaving, setAdjSaving] = useState(false);
  const saveAdjust = async () => {
    if (!adjusting) return;
    const delta = Number(adj.delta);
    if (!adj.delta || !Number.isFinite(delta) || delta === 0) return toast.error('Enter a non-zero quantity (negative to remove)');
    setAdjSaving(true);
    try {
      await post(`/inventory/${adjusting.id}/adjust`, { delta, type: adj.type, notes: adj.notes });
      toast.success('Stock updated');
      setAdjusting(null);
      reloadAll();
    } catch (err) {
      toast.error(err);
    } finally {
      setAdjSaving(false);
    }
  };

  // History
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const history = useLoad(
    () => (historyItem ? get<StockMovement[]>('/stock-movements', { inventoryItemId: historyItem.id }) : Promise.resolve([] as StockMovement[])),
    [historyItem?.id],
  );

  const archive = async (i: InventoryItem) => {
    const ok = await confirm({
      title: `Archive ${i.name}?`,
      message: 'The item disappears from lists, but its movement history is kept.',
      confirmLabel: 'Archive',
      danger: true,
    });
    if (!ok) return;
    try {
      const msg = await del(`/inventory/${i.id}`);
      toast.success(msg ?? 'Item archived');
      reloadAll();
    } catch (err) {
      toast.error(err);
    }
  };

  const exportCsv = async () => {
    try {
      await downloadFile('/export/inventory', 'inventory.csv');
    } catch (err) {
      toast.error(err);
    }
  };

  const d = dash.data;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Raw materials, packaging and consumables. Stock changes are always recorded as movements."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={15} /> Export CSV
            </Button>
            <Button onClick={openNew}>
              <Plus size={15} /> Add item
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Items" value={d ? num(d.totalItems, 0) : '—'} />
        <Stat label="Stock value" value={d ? money(d.totalValue) : '—'} />
        <Stat label="Low stock" value={d ? d.lowStockCount : '—'} tone={d && d.lowStockCount > 0 ? 'warn' : undefined} />
        <Stat label="Out of stock" value={d ? d.outOfStockCount : '—'} tone={d && d.outOfStockCount > 0 ? 'bad' : undefined} />
      </div>

      {d && d.mostConsumed.length > 0 && (
        <Card title="Most consumed (last 30 days)" className="mb-6">
          <div className="flex flex-wrap gap-2">
            {d.mostConsumed.map((m) => (
              <Badge key={m.id} tone="indigo">
                {m.name}: {num(m.consumedQty)} {m.unit}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="sm:w-48" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="rounded" />
            Low stock only
          </label>
        </div>

        {items.error ? (
          <div className="p-4">
            <ErrorBox message={items.error} onRetry={items.reload} />
          </div>
        ) : items.loading && !items.data ? (
          <Spinner />
        ) : !items.data?.length ? (
          <EmptyState
            title={search || category || lowOnly ? 'Nothing matches these filters' : 'No inventory items yet'}
            description="Track raw materials and packaging so production and made-to-order sales can consume them."
            action={!search && !category && !lowOnly && <Button onClick={openNew}>Add item</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th className="text-right">In stock</Th>
                <Th className="text-right">Reorder at</Th>
                <Th className="text-right">Cost / unit</Th>
                <Th className="text-right">Value</Th>
                <Th>Supplier</Th>
                <Th>Location</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.data.map((i) => {
                const low = i.currentStock <= Math.max(i.reorderLevel, i.minimumStock);
                return (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="font-medium text-slate-900">{i.name}</div>
                      {i.sku && <div className="text-xs text-slate-500">{i.sku}</div>}
                    </Td>
                    <Td>{titleCase(i.category)}</Td>
                    <Td className="text-right">
                      <span className={cn('tabular-nums', low && 'font-semibold text-red-600')}>
                        {num(i.currentStock)} {i.unit}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">{num(i.reorderLevel)}</Td>
                    <Td className="text-right tabular-nums">{money(i.costPerUnit)}</Td>
                    <Td className="text-right tabular-nums">{money(i.currentStock * i.costPerUnit)}</Td>
                    <Td>{i.supplier?.name ?? '—'}</Td>
                    <Td>{i.location ?? '—'}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Adjust stock"
                          aria-label="Adjust stock"
                          onClick={() => {
                            setAdj({ delta: '', type: 'ADJUSTMENT', notes: '' });
                            setAdjusting(i);
                          }}
                        >
                          <SlidersHorizontal size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" title="History" aria-label="History" onClick={() => setHistoryItem(i)}>
                          <History size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" title="Edit" aria-label="Edit" onClick={() => openEdit(i)}>
                          <Pencil size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" title="Archive" aria-label="Archive" className="hover:text-red-600" onClick={() => archive(i)}>
                          <Archive size={14} />
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

      {/* Add / edit */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add inventory item'}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Add item'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </Field>
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit *" hint="e.g. sheet, metre, roll, unit">
            <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} />
          </Field>
          {!editing ? (
            <Field label="Opening stock">
              <Input type="number" min={0} step="any" value={form.currentStock} onChange={(e) => set('currentStock', e.target.value)} />
            </Field>
          ) : (
            <Field label="Current stock" hint="Use “Adjust stock” to change it">
              <Input value={`${num(editing.currentStock)} ${editing.unit}`} disabled />
            </Field>
          )}
          <Field label="Minimum stock">
            <Input type="number" min={0} step="any" value={form.minimumStock} onChange={(e) => set('minimumStock', e.target.value)} />
          </Field>
          <Field label="Reorder level" hint="Flagged as low at or below this">
            <Input type="number" min={0} step="any" value={form.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} />
          </Field>
          <Field label="Cost per unit">
            <Input type="number" min={0} step="0.01" value={form.costPerUnit} onChange={(e) => set('costPerUnit', e.target.value)} />
          </Field>
          <Field label="Supplier">
            <Select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
              <option value="">None</option>
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Shelf A" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Adjust */}
      <Modal
        open={adjusting !== null}
        onClose={() => setAdjusting(null)}
        title={`Adjust stock: ${adjusting?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjusting(null)}>
              Cancel
            </Button>
            <Button onClick={saveAdjust} loading={adjSaving}>
              Record movement
            </Button>
          </>
        }
      >
        {adjusting && (
          <div className="grid gap-4">
            <p className="text-sm text-slate-600">
              Currently {num(adjusting.currentStock)} {adjusting.unit} in stock.
            </p>
            <Field label="Quantity change" hint="Positive adds stock, negative removes it">
              <Input type="number" step="any" value={adj.delta} onChange={(e) => setAdj((a) => ({ ...a, delta: e.target.value }))} autoFocus />
            </Field>
            <Field label="Reason">
              <Select value={adj.type} onChange={(e) => setAdj((a) => ({ ...a, type: e.target.value }))}>
                {ADJUST_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes">
              <Input value={adj.notes} onChange={(e) => setAdj((a) => ({ ...a, notes: e.target.value }))} />
            </Field>
            {adj.delta !== '' && Number.isFinite(Number(adj.delta)) && (
              <p className="text-sm text-slate-600">
                New stock: <strong>{num(adjusting.currentStock + Number(adj.delta))}</strong> {adjusting.unit}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* History */}
      <Modal open={historyItem !== null} onClose={() => setHistoryItem(null)} title={`History: ${historyItem?.name ?? ''}`} wide>
        {history.loading ? (
          <Spinner />
        ) : history.error ? (
          <ErrorBox message={history.error} onRetry={history.reload} />
        ) : !history.data?.length ? (
          <EmptyState title="No movements yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th className="text-right">Quantity</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.data.map((m) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap">{dateTime(m.createdAt)}</Td>
                  <Td>{titleCase(m.type)}</Td>
                  <Td className={cn('text-right font-medium tabular-nums', m.quantity >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                    {m.quantity > 0 ? '+' : ''}
                    {num(m.quantity)}
                  </Td>
                  <Td className="text-slate-500">{m.notes ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Modal>
      {confirm.dialog}
    </div>
  );
}
