import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Stat,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  useConfirm,
} from '../components/ui';
import { useToast } from '../components/toast';
import { PortalCard, StatementCard } from '../components/CustomerAccount';
import { del, get, post, put } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, dateTime, money, titleCase } from '../lib/format';
import type { Customer, Invoice } from '../lib/types';

interface Activity {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  createdAt: string;
}

interface CustomerFull extends Customer {
  invoices: Invoice[];
  activities: Activity[];
  stats: { totalSpent: number; totalPaid: number; outstanding: number; invoiceCount: number; averageOrder: number };
}

const FIELDS = ['name', 'email', 'phone', 'instagram', 'address', 'city', 'state', 'gstin', 'segment', 'notes'] as const;
type FormState = Record<(typeof FIELDS)[number], string>;

const toForm = (c: Customer): FormState =>
  Object.fromEntries(FIELDS.map((k) => [k, (c[k] as string | null) ?? ''])) as FormState;

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: c, loading, error, reload } = useLoad(() => get<CustomerFull>(`/customers/${id}`), [id]);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading && !c) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!c) return null;

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form?.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      await put(`/customers/${id}`, form);
      toast.success('Customer updated');
      setEditOpen(false);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setAddingNote(true);
    try {
      await post(`/customers/${id}/notes`, { note });
      setNote('');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setAddingNote(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete customer?',
      message: `This permanently deletes ${c.name}. Customers with invoices cannot be deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await del(`/customers/${id}`);
      toast.success('Customer deleted');
      navigate('/customers');
    } catch (err) {
      toast.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Customers
      </Link>
      <PageHeader
        title={c.name}
        subtitle={c.segment ? `${c.segment} · customer since ${date(c.createdAt)}` : `Customer since ${date(c.createdAt)}`}
        actions={
          <>
            <Button variant="secondary" onClick={remove} loading={deleting}>
              <Trash2 size={15} /> Delete
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setForm(toForm(c));
                setEditOpen(true);
              }}
            >
              <Pencil size={15} /> Edit
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/quotes/new?customerId=${c.id}`)}>
              <Plus size={15} /> New quote
            </Button>
            <Button onClick={() => navigate(`/invoices/new?customerId=${c.id}`)}>
              <Plus size={15} /> New invoice
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Total spent" value={money(c.stats.totalSpent)} />
        <Stat label="Paid" value={money(c.stats.totalPaid)} tone="good" />
        <Stat label="Outstanding" value={money(c.stats.outstanding)} tone={c.stats.outstanding > 0 ? 'bad' : undefined} />
        <Stat label="Invoices" value={c.stats.invoiceCount} />
        <Stat label="Avg order" value={money(c.stats.averageOrder)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Invoices" bodyClassName="p-0">
            {c.invoices.length === 0 ? (
              <EmptyState
                title="No invoices yet"
                action={
                  <Button size="sm" onClick={() => navigate(`/invoices/new?customerId=${c.id}`)}>
                    <Plus size={14} /> Create invoice
                  </Button>
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Number</Th>
                    <Th>Date</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Balance</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {c.invoices.map((inv) => (
                    <tr key={inv.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <Td className="font-medium text-slate-900">{inv.invoiceNumber}</Td>
                      <Td className="whitespace-nowrap">{date(inv.date)}</Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">{money(inv.grandTotal)}</Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">{inv.status === 'CANCELLED' ? '—' : money(inv.balanceDue)}</Td>
                      <Td>
                        <StatusBadge status={inv.displayStatus} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Activity">
            <form onSubmit={addNote} className="mb-4 flex gap-2">
              <Input placeholder="Add a note (call, preference, follow-up…)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" loading={addingNote} disabled={!note.trim()}>
                Add
              </Button>
            </form>
            {c.activities.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              <ol className="space-y-3 border-l border-slate-200 pl-4">
                {c.activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500" />
                    <div className="text-sm font-medium text-slate-800">{a.eventType === 'NOTE' ? 'Note' : a.title}</div>
                    {a.description && <div className="whitespace-pre-wrap text-sm text-slate-600">{a.description}</div>}
                    <div className="text-xs text-slate-400">
                      {dateTime(a.createdAt)}
                      {a.eventType !== 'NOTE' && ` · ${titleCase(a.eventType)}`}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Contact">
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Mail size={15} className="mt-0.5 text-slate-400" />
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="text-brand-600 hover:underline">
                    {c.email}
                  </a>
                ) : (
                  <span className="text-slate-400">No email</span>
                )}
              </div>
              <div className="flex items-start gap-2">
                <Phone size={15} className="mt-0.5 text-slate-400" />
                {c.phone ? <span>{c.phone}</span> : <span className="text-slate-400">No phone</span>}
              </div>
              <div className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 text-slate-400" />
                <span>{[c.address, c.city, c.state].filter(Boolean).join(', ') || <span className="text-slate-400">No address</span>}</span>
              </div>
              {c.instagram && (
                <div>
                  <dt className="text-xs text-slate-500">Instagram</dt>
                  <dd>{c.instagram}</dd>
                </div>
              )}
              {c.gstin && (
                <div>
                  <dt className="text-xs text-slate-500">GSTIN</dt>
                  <dd className="font-mono text-xs">{c.gstin}</dd>
                </div>
              )}
              {c.notes && (
                <div>
                  <dt className="text-xs text-slate-500">Notes</dt>
                  <dd className="whitespace-pre-wrap text-slate-600">{c.notes}</dd>
                </div>
              )}
            </dl>
          </Card>
          <PortalCard customerId={c.id} customerName={c.name} phone={c.phone} />
          <StatementCard customerId={c.id} hasEmail={Boolean(c.email)} />
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit customer"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-customer" loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {form && (
          <form id="edit-customer" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *" className="sm:col-span-2">
              <Input value={form.name} onChange={set('name')} required />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Instagram">
              <Input value={form.instagram} onChange={set('instagram')} />
            </Field>
            <Field label="Segment">
              <Input value={form.segment} onChange={set('segment')} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={form.address} onChange={set('address')} />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={set('city')} />
            </Field>
            <Field label="State">
              <Input value={form.state} onChange={set('state')} />
            </Field>
            <Field label="GSTIN">
              <Input value={form.gstin} onChange={set('gstin')} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={set('notes')} />
            </Field>
          </form>
        )}
      </Modal>
      {confirm.dialog}
    </div>
  );
}
