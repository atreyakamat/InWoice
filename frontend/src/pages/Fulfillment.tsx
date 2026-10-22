import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/toast';
import { useLoad } from '../lib/useLoad';
import { get, patch } from '../lib/api';
import { date, dateTime, isoDate, titleCase } from '../lib/format';
import { cn } from '../lib/utils';
import type { Fulfillment as FulfillmentRow } from '../lib/types';

const TABS = [
  { label: 'Open', value: 'OPEN' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Returned', value: 'RETURNED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'All', value: '' },
];

const STATUSES = ['PENDING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED'];
const FLOW = ['PENDING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED'];
const nextStatus = (s: string) => {
  const i = FLOW.indexOf(s);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
};

export default function Fulfillment() {
  const toast = useToast();
  const [tab, setTab] = useState('OPEN');
  const { data, loading, error, reload } = useLoad(() => get<FulfillmentRow[]>('/fulfillments', tab ? { status: tab } : undefined), [tab]);
  const [editing, setEditing] = useState<FulfillmentRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const advance = async (f: FulfillmentRow) => {
    const next = nextStatus(f.status);
    if (!next) return;
    setBusyId(f.id);
    try {
      await patch(`/fulfillments/${f.id}`, { status: next });
      toast.success(`${f.invoice?.invoiceNumber ?? 'Order'} → ${titleCase(next)}`);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Fulfillment" subtitle="Orders are added here automatically when an invoice is issued. Track packing and shipping." />

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.label}
            onClick={() => setTab(t.value)}
            className={cn('rounded-md px-3 py-1.5 text-sm font-medium', tab === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card bodyClassName="p-0">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : !data?.length ? (
          <EmptyState title="Nothing here" description={tab === 'OPEN' ? 'All orders are shipped. Nice work!' : 'No orders with this status.'} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Created</Th>
                <Th>Courier / tracking</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((f) => {
                const next = nextStatus(f.status);
                return (
                  <tr key={f.id}>
                    <Td>
                      <Link to={`/invoices/${f.invoiceId}`} className="font-medium text-brand-600 hover:underline">
                        {f.invoice?.invoiceNumber ?? 'Invoice'}
                      </Link>
                    </Td>
                    <Td>
                      <div className="text-slate-900">{f.invoice?.customer.name}</div>
                      {f.invoice?.customer.city && <div className="text-xs text-slate-500">{f.invoice.customer.city}</div>}
                    </Td>
                    <Td className="whitespace-nowrap">{date(f.createdAt)}</Td>
                    <Td>
                      {f.courier || f.trackingNumber ? (
                        <>
                          <div>{f.courier ?? '—'}</div>
                          {f.trackingNumber && <div className="font-mono text-xs text-slate-500">{f.trackingNumber}</div>}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={f.status} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {next && (
                          <Button size="sm" variant="secondary" loading={busyId === f.id} onClick={() => advance(f)} title={`Mark as ${titleCase(next)}`}>
                            {titleCase(next)} <ArrowRight size={12} />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>
                          Update
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

      {editing && (
        <UpdateModal
          fulfillment={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function UpdateModal({ fulfillment, onClose, onSaved }: { fulfillment: FulfillmentRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    status: fulfillment.status,
    courier: fulfillment.courier ?? '',
    trackingNumber: fulfillment.trackingNumber ?? '',
    estimatedDelivery: isoDate(fulfillment.estimatedDelivery),
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      // Notes go into the shipment history; send them only when typed so saving never wipes them.
      await patch(`/fulfillments/${fulfillment.id}`, { ...form, notes: form.notes.trim() || undefined });
      toast.success('Shipment updated');
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const history = fulfillment.shipmentRecords ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Update ${fulfillment.invoice?.invoiceNumber ?? 'shipment'}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <Select value={form.status} onChange={set('status')}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estimated delivery">
          <Input type="date" value={form.estimatedDelivery} onChange={set('estimatedDelivery')} />
        </Field>
        <Field label="Courier">
          <Input value={form.courier} onChange={set('courier')} placeholder="e.g. DTDC, India Post" />
        </Field>
        <Field label="Tracking number">
          <Input value={form.trackingNumber} onChange={set('trackingNumber')} />
        </Field>
        <Field label="Note" className="sm:col-span-2" hint="Added to the shipment history when the status changes">
          <Textarea value={form.notes} onChange={set('notes')} placeholder="Optional" />
        </Field>
      </div>
      {fulfillment.invoice?.customer.address && (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-medium">Ship to:</span> {fulfillment.invoice.customer.name}, {fulfillment.invoice.customer.address}
          {fulfillment.invoice.customer.city ? `, ${fulfillment.invoice.customer.city}` : ''}
          {fulfillment.invoice.customer.phone ? ` · ${fulfillment.invoice.customer.phone}` : ''}
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-medium text-slate-600">History</div>
          <ol className="space-y-2 border-l border-slate-200 pl-4">
            {history.map((r) => (
              <li key={r.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-500" />
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-slate-500">{dateTime(r.timestamp)}</span>
                </div>
                {r.notes && <div className="mt-0.5 text-xs text-slate-600">{r.notes}</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  );
}
