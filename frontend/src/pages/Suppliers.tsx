import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Td, Textarea, Th, useConfirm } from '../components/ui';
import { useToast } from '../components/toast';
import { useLoad } from '../lib/useLoad';
import { del, get, post, put } from '../lib/api';
import { money } from '../lib/format';
import type { Supplier } from '../lib/types';

interface FormState {
  name: string;
  phone: string;
  email: string;
  address: string;
  gst: string;
  state: string;
  paymentTerms: string;
  leadTime: string;
  notes: string;
  status: string;
}

const emptyForm: FormState = { name: '', phone: '', email: '', address: '', gst: '', state: '', paymentTerms: '', leadTime: '', notes: '', status: 'ACTIVE' };

export default function Suppliers() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useLoad(() => get<Supplier[]>('/suppliers'));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      gst: s.gst ?? '',
      state: s.state ?? '',
      paymentTerms: s.paymentTerms ?? '',
      leadTime: s.leadTime === null ? '' : String(s.leadTime),
      notes: s.notes ?? '',
      status: s.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    const body = { ...form, leadTime: form.leadTime === '' ? '' : Number(form.leadTime) };
    try {
      if (editing) await put(`/suppliers/${editing.id}`, body);
      else await post('/suppliers', body);
      toast.success(editing ? 'Supplier updated' : 'Supplier added');
      setOpen(false);
      void reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Supplier) => {
    const ok = await confirm({
      title: `Delete ${s.name}?`,
      message: 'Suppliers with purchase orders are marked inactive instead of deleted.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const msg = await del(`/suppliers/${s.id}`);
      toast.success(msg ?? 'Supplier deleted');
      void reload();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Who you buy materials and packaging from, and what you owe them."
        actions={
          <Button onClick={openNew}>
            <Plus size={15} /> Add supplier
          </Button>
        }
      />
      <Card bodyClassName="p-0">
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState title="No suppliers yet" description="Add suppliers to link them to materials and purchase orders." action={<Button onClick={openNew}>Add supplier</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>Contact</Th>
                <Th>GST</Th>
                <Th>Terms</Th>
                <Th className="text-right">Lead time</Th>
                <Th className="text-right">Materials</Th>
                <Th className="text-right">POs</Th>
                <Th className="text-right">You owe</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="font-medium text-slate-900">{s.name}</div>
                    {s.address && <div className="max-w-xs truncate text-xs text-slate-500">{s.address}</div>}
                  </Td>
                  <Td>
                    <div>{s.phone ?? '—'}</div>
                    {s.email && <div className="text-xs text-slate-500">{s.email}</div>}
                  </Td>
                  <Td>{s.gst ?? '—'}</Td>
                  <Td>{s.paymentTerms ?? '—'}</Td>
                  <Td className="text-right">{s.leadTime !== null ? `${s.leadTime} days` : '—'}</Td>
                  <Td className="text-right tabular-nums">{s._count?.inventoryItems ?? 0}</Td>
                  <Td className="text-right tabular-nums">{s._count?.purchaseOrders ?? 0}</Td>
                  <Td className="text-right tabular-nums">
                    {s.balanceDue ? (
                      <Link to={`/bills?status=OPEN`} className="font-medium text-slate-900 hover:underline">
                        {money(s.balanceDue)}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link to={`/bills/new?supplierId=${s.id}`}>
                        <Button size="sm" variant="ghost" title="Record a bill" aria-label="Record a bill">
                          <ReceiptText size={14} />
                        </Button>
                      </Link>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)} aria-label="Edit">
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s)} aria-label="Delete" className="hover:text-red-600">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add supplier'}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Add supplier'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="GSTIN" hint="Checked for typos. Needed to claim GST on their bills.">
            <Input value={form.gst} onChange={(e) => set('gst', e.target.value.toUpperCase())} />
          </Field>
          <Field label="State" hint="Decides IGST vs CGST + SGST if there is no GSTIN">
            <Input value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="e.g. Maharashtra" />
          </Field>
          <Field label="Payment terms" hint="A number of days here sets bill due dates">
            <Input value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} placeholder="e.g. Net 30" />
          </Field>
          <Field label="Lead time (days)">
            <Input type="number" min={0} step={1} value={form.leadTime} onChange={(e) => set('leadTime', e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </Modal>
      {confirm.dialog}
    </div>
  );
}
