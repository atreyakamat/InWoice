import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Plus, Search } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/toast';
import { downloadFile, get, post } from '../lib/api';
import { useDebounced, useLoad } from '../lib/useLoad';
import { money } from '../lib/format';
import { cn } from '../lib/utils';
import type { Customer } from '../lib/types';

const EMPTY = { name: '', email: '', phone: '', instagram: '', address: '', city: '', state: '', gstin: '', segment: '', notes: '' };

export default function Customers() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const { data, loading, error, reload } = useLoad(() => get<Customer[]>('/customers', { search: q || undefined, limit: 500 }), [q]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      const c = await post<Customer>('/customers', form);
      toast.success(`${c.name} added`);
      setOpen(false);
      setForm(EMPTY);
      navigate(`/customers/${c.id}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile('/export/customers', 'customers.csv');
    } catch (err) {
      toast.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={data ? `${data.length} customer${data.length === 1 ? '' : 's'}` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} loading={exporting}>
              <Download size={15} /> Export CSV
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus size={15} /> Add customer
            </Button>
          </>
        }
      />

      <div className="relative mb-4 sm:w-80">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Search name, email or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <Card bodyClassName="p-0">
          {loading && !data ? (
            <Spinner />
          ) : !data || data.length === 0 ? (
            <EmptyState
              title={q ? 'No matching customers' : 'No customers yet'}
              description={q ? 'Try a different search.' : 'Add your first customer to start invoicing.'}
              action={
                !q ? (
                  <Button onClick={() => setOpen(true)}>
                    <Plus size={15} /> Add customer
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Contact</Th>
                  <Th>Location</Th>
                  <Th className="text-right">Invoices</Th>
                  <Th className="text-right">Total spent</Th>
                  <Th className="text-right">Outstanding</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/customers/${c.id}`)}>
                    <Td className="font-medium text-slate-900">
                      {c.name}
                      {c.segment && <span className="ml-2 text-xs font-normal text-slate-400">{c.segment}</span>}
                    </Td>
                    <Td>
                      <div className="text-slate-700">{c.email ?? '—'}</div>
                      {c.phone && <div className="text-xs text-slate-500">{c.phone}</div>}
                    </Td>
                    <Td>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</Td>
                    <Td className="text-right tabular-nums">{c.invoiceCount ?? 0}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{money(c.totalSpent)}</Td>
                    <Td className={cn('whitespace-nowrap text-right tabular-nums', (c.outstanding ?? 0) > 0 ? 'font-medium text-red-600' : 'text-slate-400')}>
                      {money(c.outstanding)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add customer"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="customer-form" loading={saving}>
              Save customer
            </Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input value={form.name} onChange={set('name')} autoFocus required />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Phone" hint="Include country code for WhatsApp, e.g. 9198…">
            <Input value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Instagram">
            <Input value={form.instagram} onChange={set('instagram')} />
          </Field>
          <Field label="Segment">
            <Input value={form.segment} onChange={set('segment')} placeholder="e.g. VIP, Wholesale" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address} onChange={set('address')} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={set('city')} />
          </Field>
          <Field label="State" hint="Used for GST (CGST+SGST vs IGST)">
            <Input value={form.state} onChange={set('state')} />
          </Field>
          <Field label="GSTIN">
            <Input value={form.gstin} onChange={set('gstin')} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={set('notes')} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
