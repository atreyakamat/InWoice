import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Factory, Plus, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Td, Th, useConfirm } from '../components/ui';
import { useToast } from '../components/toast';
import { useLoad } from '../lib/useLoad';
import { get, post } from '../lib/api';
import { date, num } from '../lib/format';
import type { Product, ProductionBatch } from '../lib/types';

interface OutputRow {
  productId: string;
  quantity: string;
}

export default function Production() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: batches, loading, error, reload } = useLoad(() => get<ProductionBatch[]>('/production'));
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const complete = async (b: ProductionBatch) => {
    setBusyId(b.id);
    try {
      await post(`/production/${b.id}/complete`);
      toast.success(`${b.batchNumber} completed — stock updated`);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (b: ProductionBatch) => {
    const ok = await confirm({ title: 'Cancel batch?', message: `${b.batchNumber} will be cancelled. No stock is changed.`, confirmLabel: 'Cancel batch', danger: true });
    if (!ok) return;
    setBusyId(b.id);
    try {
      await post(`/production/${b.id}/cancel`);
      toast.success('Batch cancelled');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Production"
        subtitle={
          <>
            Producing a batch consumes raw materials according to each product's bill of materials and adds finished stock.{' '}
            <Link to="/products" className="font-medium text-brand-600 hover:underline">
              Set up BOMs on Products
            </Link>
            .
          </>
        }
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> New batch
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        {loading && !batches ? (
          <Spinner />
        ) : error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : !batches?.length ? (
          <EmptyState
            title="No production batches yet"
            description="Plan a batch to turn raw materials into finished products."
            action={
              <Button onClick={() => setOpen(true)}>
                <Factory size={16} /> New batch
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Batch</Th>
                <Th>Created</Th>
                <Th>Products made</Th>
                <Th>Materials used</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b.id} className="align-top">
                  <Td className="font-medium text-slate-900">
                    {b.batchNumber}
                    {b.notes && <div className="mt-0.5 max-w-xs text-xs font-normal text-slate-500">{b.notes}</div>}
                  </Td>
                  <Td className="whitespace-nowrap">{date(b.createdAt)}</Td>
                  <Td>
                    {b.outputs.map((o) => (
                      <div key={o.id}>
                        {o.quantityProduced} × {o.product.name}
                      </div>
                    ))}
                  </Td>
                  <Td>
                    {b.usages.length ? (
                      b.usages.map((u) => (
                        <div key={u.id} className="text-xs">
                          {num(u.quantityConsumed)} {u.inventoryItem.unit} {u.inventoryItem.name}
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">{b.status === 'COMPLETED' ? 'No BOM materials' : '—'}</span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={b.status} />
                  </Td>
                  <Td className="text-right">
                    {b.status === 'PLANNED' && (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" loading={busyId === b.id} onClick={() => complete(b)}>
                          Complete
                        </Button>
                        <Button size="sm" variant="secondary" disabled={busyId === b.id} onClick={() => cancel(b)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <NewBatchModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={async () => {
          setOpen(false);
          await reload();
        }}
      />
      {confirm.dialog}
    </div>
  );
}

function NewBatchModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: products } = useLoad(() => (open ? get<Product[]>('/products') : Promise.resolve(null)), [open]);
  const [batchNumber, setBatchNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<OutputRow[]>([{ productId: '', quantity: '1' }]);
  const [saving, setSaving] = useState<'plan' | 'now' | null>(null);

  const reset = () => {
    setBatchNumber('');
    setNotes('');
    setRows([{ productId: '', quantity: '1' }]);
  };

  const submit = async (complete: boolean) => {
    const outputs = rows
      .filter((r) => r.productId)
      .map((r) => ({ productId: r.productId, quantity: Number(r.quantity) }));
    if (!outputs.length) return toast.error('Add at least one product');
    if (outputs.some((o) => !(Number.isInteger(o.quantity) && o.quantity > 0))) return toast.error('Quantities must be positive whole numbers');
    setSaving(complete ? 'now' : 'plan');
    try {
      await post('/production', { batchNumber, notes, outputs, complete });
      toast.success(complete ? 'Batch produced — stock updated' : 'Batch planned');
      reset();
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(null);
    }
  };

  const setRow = (i: number, patch: Partial<OutputRow>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New production batch"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" loading={saving === 'plan'} disabled={saving !== null} onClick={() => submit(false)}>
            Save as planned
          </Button>
          <Button loading={saving === 'now'} disabled={saving !== null} onClick={() => submit(true)}>
            Produce now
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Batch number" hint="Leave blank to auto-number">
          <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="BATCH-0001" />
        </Field>
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <div className="mt-5">
        <div className="mb-2 text-xs font-medium text-slate-600">Products to make</div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Select value={r.productId} onChange={(e) => setRow(i, { productId: e.target.value })} className="flex-1">
                <option value="">Select product…</option>
                {products?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (in stock: {p.stock}){p.bom?._count.items ? '' : ' — no BOM'}
                  </option>
                ))}
              </Select>
              <Input type="number" min={1} step={1} value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} className="w-24" aria-label="Quantity" />
              <Button variant="ghost" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))} aria-label="Remove row" disabled={rows.length === 1}>
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRows((rs) => [...rs, { productId: '', quantity: '1' }])}>
          <Plus size={14} /> Add product
        </Button>
        <p className="mt-3 text-xs text-slate-500">"Produce now" checks material stock first; if anything is short, nothing is changed and you'll see what's missing.</p>
      </div>
    </Modal>
  );
}
