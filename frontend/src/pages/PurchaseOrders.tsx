import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Eye, PackageCheck, Plus, ReceiptText, Send, Trash2 } from 'lucide-react';
import {
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
import { useLoad } from '../lib/useLoad';
import { del, get, patch, post } from '../lib/api';
import { date, money, num } from '../lib/format';
import { cn } from '../lib/utils';
import type { InventoryItem, PurchaseOrder, Supplier } from '../lib/types';

const TABS = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Ordered', value: 'ORDERED' },
  { label: 'Partial', value: 'PARTIAL' },
  { label: 'Received', value: 'RECEIVED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

interface LineRow {
  key: number;
  inventoryItemId: string;
  quantityOrdered: string;
  unitPrice: string;
}

let rowKey = 0;
const newRow = (): LineRow => ({ key: ++rowKey, inventoryItemId: '', quantityOrdered: '1', unitPrice: '0' });

const progress = (po: PurchaseOrder) => {
  const ordered = po.items.reduce((s, i) => s + i.quantityOrdered, 0);
  const received = po.items.reduce((s, i) => s + i.quantityReceived, 0);
  return { ordered, received, pct: ordered > 0 ? Math.min(100, (received / ordered) * 100) : 0 };
};

export default function PurchaseOrders() {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useLoad(() => get<PurchaseOrder[]>('/purchase-orders', { status: status || undefined }), [status]);
  const suppliers = useLoad(() => get<Supplier[]>('/suppliers'));
  const materials = useLoad(() => get<InventoryItem[]>('/inventory'));

  // Create
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<LineRow[]>([newRow()]);
  const [creating, setCreating] = useState<'DRAFT' | 'ORDERED' | null>(null);

  const materialById = new Map((materials.data ?? []).map((m) => [m.id, m]));
  const createTotal = rows.reduce((s, r) => s + (Number(r.quantityOrdered) || 0) * (Number(r.unitPrice) || 0), 0);

  const openCreate = () => {
    setSupplierId('');
    setExpectedAt('');
    setNotes('');
    setRows([newRow()]);
    setCreateOpen(true);
  };

  const updateRow = (key: number, p: Partial<LineRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const create = async (st: 'DRAFT' | 'ORDERED') => {
    if (!supplierId) return toast.error('Choose a supplier');
    const items = rows
      .filter((r) => r.inventoryItemId)
      .map((r) => ({ inventoryItemId: r.inventoryItemId, quantityOrdered: Number(r.quantityOrdered), unitPrice: Number(r.unitPrice) || 0 }));
    if (!items.length) return toast.error('Add at least one item');
    if (items.some((i) => !(i.quantityOrdered > 0))) return toast.error('Quantities must be greater than zero');
    setCreating(st);
    try {
      const po = await post<PurchaseOrder>('/purchase-orders', { supplierId, expectedAt, notes, status: st, items });
      toast.success(`${po.poNumber} ${st === 'ORDERED' ? 'placed' : 'saved as draft'}`);
      setCreateOpen(false);
      void reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setCreating(null);
    }
  };

  // Detail
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);

  // Receive
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveSaving, setReceiveSaving] = useState(false);
  const openReceive = (po: PurchaseOrder) => {
    setReceiveQty(Object.fromEntries(po.items.map((i) => [i.inventoryItemId, String(Math.max(0, i.quantityOrdered - i.quantityReceived))])));
    setReceiving(po);
  };
  const saveReceive = async () => {
    if (!receiving) return;
    const items = Object.entries(receiveQty)
      .map(([inventoryItemId, q]) => ({ inventoryItemId, quantity: Number(q) || 0 }))
      .filter((i) => i.quantity > 0);
    if (!items.length) return toast.error('Enter at least one received quantity');
    setReceiveSaving(true);
    try {
      const po = await post<PurchaseOrder>(`/purchase-orders/${receiving.id}/receive`, { items });
      toast.success(po.status === 'RECEIVED' ? `${po.poNumber} fully received` : `Partial delivery recorded on ${po.poNumber}`);
      setReceiving(null);
      void reload();
      void materials.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setReceiveSaving(false);
    }
  };

  const setPoStatus = async (po: PurchaseOrder, st: 'ORDERED' | 'CANCELLED') => {
    if (st === 'CANCELLED') {
      const ok = await confirm({ title: `Cancel ${po.poNumber}?`, message: 'The order will be kept for your records but cannot be received.', confirmLabel: 'Cancel order', danger: true });
      if (!ok) return;
    }
    try {
      await patch(`/purchase-orders/${po.id}/status`, { status: st });
      toast.success(st === 'ORDERED' ? `${po.poNumber} marked as ordered` : `${po.poNumber} cancelled`);
      void reload();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (po: PurchaseOrder) => {
    const ok = await confirm({ title: `Delete ${po.poNumber}?`, message: 'This draft will be permanently removed.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      const msg = await del(`/purchase-orders/${po.id}`);
      toast.success(msg ?? 'Purchase order deleted');
      void reload();
    } catch (err) {
      toast.error(err);
    }
  };

  const activeSuppliers = (suppliers.data ?? []).filter((s) => s.status === 'ACTIVE');

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle="Order materials from suppliers and receive them into inventory."
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} /> New order
          </Button>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={cn(
              'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
              status === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card bodyClassName="p-0">
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState
            title={status ? 'No orders with this status' : 'No purchase orders yet'}
            description="Create an order to restock materials. Receiving it adds the stock automatically."
            action={!status && <Button onClick={openCreate}>New order</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>PO #</Th>
                <Th>Supplier</Th>
                <Th>Created</Th>
                <Th>Expected</Th>
                <Th className="text-right">Total</Th>
                <Th>Received</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((po) => {
                const p = progress(po);
                return (
                  <tr key={po.id} className="hover:bg-slate-50">
                    <Td>
                      <button className="font-medium text-brand-600 hover:underline" onClick={() => setViewing(po)}>
                        {po.poNumber}
                      </button>
                    </Td>
                    <Td>{po.supplier.name}</Td>
                    <Td className="whitespace-nowrap">{date(po.createdAt)}</Td>
                    <Td className="whitespace-nowrap">{date(po.expectedAt)}</Td>
                    <Td className="text-right tabular-nums">{money(po.totalAmount)}</Td>
                    <Td>
                      <div className="flex min-w-[120px] items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${p.pct}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-slate-500">
                          {num(p.received)}/{num(p.ordered)}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={po.status} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="View" aria-label="View" onClick={() => setViewing(po)}>
                          <Eye size={14} />
                        </Button>
                        {po.status === 'DRAFT' && (
                          <Button size="sm" variant="secondary" onClick={() => setPoStatus(po, 'ORDERED')}>
                            <Send size={13} /> Mark ordered
                          </Button>
                        )}
                        {(po.status === 'ORDERED' || po.status === 'PARTIAL') && (
                          <Button size="sm" onClick={() => openReceive(po)}>
                            <PackageCheck size={13} /> Receive
                          </Button>
                        )}
                        {(po.status === 'PARTIAL' || po.status === 'RECEIVED') && !po.bills?.length && (
                          <Link to={`/bills/new?po=${po.id}`}>
                            <Button size="sm" variant="secondary" title="Record the supplier's bill for this order">
                              <ReceiptText size={13} /> Add bill
                            </Button>
                          </Link>
                        )}
                        {(po.status === 'DRAFT' || po.status === 'ORDERED') && (
                          <Button size="sm" variant="ghost" title="Cancel order" aria-label="Cancel order" onClick={() => setPoStatus(po, 'CANCELLED')}>
                            <Ban size={14} />
                          </Button>
                        )}
                        {po.status === 'DRAFT' && (
                          <Button size="sm" variant="ghost" title="Delete" aria-label="Delete" className="hover:text-red-600" onClick={() => remove(po)}>
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New purchase order"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => create('DRAFT')} loading={creating === 'DRAFT'} disabled={creating !== null}>
              Save draft
            </Button>
            <Button onClick={() => create('ORDERED')} loading={creating === 'ORDERED'} disabled={creating !== null}>
              Place order
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier *">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier…</option>
              {activeSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Expected delivery">
            <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {!activeSuppliers.length && !suppliers.loading && (
          <p className="mt-2 text-sm text-amber-700">Add a supplier on the Suppliers page first.</p>
        )}

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Items</h3>
            <Button size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, newRow()])}>
              <Plus size={14} /> Add item
            </Button>
          </div>
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_110px_120px_100px_36px] gap-2 text-xs font-medium text-slate-500 sm:grid">
              <span>Material</span>
              <span>Quantity</span>
              <span>Unit price</span>
              <span className="text-right">Line total</span>
              <span />
            </div>
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_110px_120px_100px_36px] sm:items-center">
                <Select
                  className="col-span-2 sm:col-span-1"
                  value={r.inventoryItemId}
                  onChange={(e) => {
                    const m = materialById.get(e.target.value);
                    updateRow(r.key, { inventoryItemId: e.target.value, unitPrice: m ? String(m.costPerUnit) : r.unitPrice });
                  }}
                >
                  <option value="">Select material…</option>
                  {(materials.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unit})
                    </option>
                  ))}
                </Select>
                <Input type="number" min={0} step="any" value={r.quantityOrdered} onChange={(e) => updateRow(r.key, { quantityOrdered: e.target.value })} aria-label="Quantity" />
                <Input type="number" min={0} step="0.01" value={r.unitPrice} onChange={(e) => updateRow(r.key, { unitPrice: e.target.value })} aria-label="Unit price" />
                <div className="text-right text-sm tabular-nums">{money((Number(r.quantityOrdered) || 0) * (Number(r.unitPrice) || 0))}</div>
                <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow()]))}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 text-right text-sm">
            Total: <span className="font-semibold tabular-nums">{money(createTotal)}</span>
          </div>
        </div>
      </Modal>

      {/* Detail */}
      <Modal open={viewing !== null} onClose={() => setViewing(null)} title={viewing ? `${viewing.poNumber} — ${viewing.supplier.name}` : ''} wide>
        {viewing && (
          <div>
            <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
              <span>
                Status: <StatusBadge status={viewing.status} />
              </span>
              <span>Created {date(viewing.createdAt)}</span>
              <span>Expected {date(viewing.expectedAt)}</span>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th className="text-right">Ordered</Th>
                  <Th className="text-right">Received</Th>
                  <Th className="text-right">Unit price</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {viewing.items.map((i) => (
                  <tr key={i.id}>
                    <Td>{i.inventoryItem.name}</Td>
                    <Td className="text-right tabular-nums">
                      {num(i.quantityOrdered)} {i.inventoryItem.unit}
                    </Td>
                    <Td className={cn('text-right tabular-nums', i.quantityReceived >= i.quantityOrdered && 'text-emerald-600')}>{num(i.quantityReceived)}</Td>
                    <Td className="text-right tabular-nums">{money(i.unitPrice)}</Td>
                    <Td className="text-right tabular-nums">{money(i.totalPrice)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td colSpan={4} className="text-right font-semibold">
                    Total
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">{money(viewing.totalAmount)}</Td>
                </tr>
              </tbody>
            </Table>
            {viewing.notes && <p className="mt-3 text-sm text-slate-600">{viewing.notes}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-600">Bills:</span>
              {viewing.bills?.length ? (
                viewing.bills.map((b) => (
                  <Link key={b.id} to={`/bills/${b.id}`} className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-brand-700 hover:underline">
                    {b.billNumber} · {money(b.grandTotal)}
                  </Link>
                ))
              ) : (
                <span className="text-slate-500">none recorded yet</span>
              )}
              {viewing.status !== 'CANCELLED' && viewing.status !== 'DRAFT' && (
                <Link to={`/bills/new?po=${viewing.id}`} className="font-medium text-brand-600 hover:underline">
                  + Add bill
                </Link>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Receive */}
      <Modal
        open={receiving !== null}
        onClose={() => setReceiving(null)}
        title={`Receive goods: ${receiving?.poNumber ?? ''}`}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setReceiving(null)}>
              Cancel
            </Button>
            <Button onClick={saveReceive} loading={receiveSaving}>
              Add to inventory
            </Button>
          </>
        }
      >
        {receiving && (
          <div>
            <p className="mb-3 text-sm text-slate-600">Enter what actually arrived. Leave 0 for items not delivered yet.</p>
            <Table>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th className="text-right">Ordered</Th>
                  <Th className="text-right">Already received</Th>
                  <Th className="w-36">Receiving now</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receiving.items.map((i) => (
                  <tr key={i.id}>
                    <Td>{i.inventoryItem.name}</Td>
                    <Td className="text-right tabular-nums">
                      {num(i.quantityOrdered)} {i.inventoryItem.unit}
                    </Td>
                    <Td className="text-right tabular-nums">{num(i.quantityReceived)}</Td>
                    <Td>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={receiveQty[i.inventoryItemId] ?? '0'}
                        onChange={(e) => setReceiveQty((q) => ({ ...q, [i.inventoryItemId]: e.target.value }))}
                        aria-label={`Receive ${i.inventoryItem.name}`}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Modal>
      {confirm.dialog}
    </div>
  );
}
