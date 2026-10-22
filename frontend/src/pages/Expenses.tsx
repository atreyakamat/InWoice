import { useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Td, Textarea, Th, useConfirm } from '../components/ui';
import { useToast } from '../components/toast';
import { del, get, http, post, put } from '../lib/api';
import { useDebounced, useLoad } from '../lib/useLoad';
import { date, isoDate, money, titleCase } from '../lib/format';
import { previewExpense } from '../lib/docmath';
import { cn } from '../lib/utils';
import type { Expense } from '../lib/types';

const METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER'];
const methodLabel = (m: string) => (m === 'UPI' ? 'UPI' : titleCase(m));

interface FormState {
  date: string;
  category: string;
  description: string;
  vendor: string;
  vendorGstin: string;
  amount: string;
  taxInclusive: boolean;
  taxRate: string;
  itcEligible: boolean;
  paymentMethod: string;
  referenceId: string;
  notes: string;
}

const blank = (): FormState => ({
  date: isoDate(new Date()),
  category: '',
  description: '',
  vendor: '',
  vendorGstin: '',
  amount: '',
  taxInclusive: true,
  taxRate: '0',
  itcEligible: true,
  paymentMethod: 'CASH',
  referenceId: '',
  notes: '',
});

const thisMonth = () => isoDate(new Date()).slice(0, 7);
const monthRange = (m: string) => {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  const last = new Date(y, mo, 0).getDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
};

export default function Expenses() {
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth());
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);

  const { data, loading, error, reload } = useLoad(async () => {
    const res = await http.get('/expenses', { params: { ...(month ? monthRange(month) : {}), category: category || undefined, q: q || undefined, limit: 500 } });
    return {
      rows: res.data.data as Expense[],
      total: res.data.total as number,
      summary: res.data.summary as { total: number; gst: number; byCategory: { category: string; total: number }[] },
    };
  }, [month, category, q]);
  const categories = useLoad(() => get<string[]>('/expenses/categories'));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<FormState>(blank());
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditing(null);
    setForm(blank());
    setOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      date: isoDate(e.date),
      category: e.category,
      description: e.description,
      vendor: e.vendor ?? '',
      vendorGstin: e.vendorGstin ?? '',
      amount: String(e.total),
      taxInclusive: true,
      taxRate: String(e.taxRate),
      itcEligible: e.itcEligible || e.taxAmount === 0,
      paymentMethod: e.paymentMethod,
      referenceId: e.referenceId ?? '',
      notes: e.notes ?? '',
    });
    setOpen(true);
  };

  const amount = Number(form.amount) || 0;
  const rate = Number(form.taxRate) || 0;
  const preview = previewExpense(amount, rate, form.taxInclusive);

  const save = async () => {
    if (!form.category.trim()) return toast.error('Pick a category');
    if (!form.description.trim()) return toast.error('Describe the expense');
    if (!(amount > 0)) return toast.error('Enter the amount');
    setSaving(true);
    const body = {
      ...form,
      amount,
      taxRate: rate,
      date: form.date || null,
      // Only ask for input credit when there is GST and a GSTIN to claim it against.
      itcEligible: preview.tax > 0 && form.vendorGstin.trim() ? form.itcEligible : undefined,
    };
    try {
      if (editing) await put(`/expenses/${editing.id}`, body);
      else await post('/expenses', body);
      toast.success(editing ? 'Expense updated' : 'Expense added');
      setOpen(false);
      void reload();
      void categories.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Expense) => {
    if (!(await confirm({ title: 'Delete this expense?', message: `${e.description}: ${money(e.total)}`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      toast.success((await del(`/expenses/${e.id}`)) ?? 'Expense deleted');
      void reload();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Money spent and paid on the spot. For anything you'll pay later, record a bill instead."
        actions={
          <Button onClick={openNew}>
            <Plus size={15} /> Add expense
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Month</span>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" aria-label="Month" />
        </label>
        <button onClick={() => setMonth(month ? '' : thisMonth())} className="pb-2 text-sm font-medium text-brand-600 hover:underline">
          {month ? 'Show all time' : 'This month'}
        </button>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Description, vendor, ref." className="pl-9" aria-label="Search expenses" />
        </div>
      </div>

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={month ? 'Spent this period' : 'Spent (all time)'} value={money(data.summary.total, { decimals: 0 })} hint={`${data.total} expense${data.total === 1 ? '' : 's'}`} />
          <Stat label="GST inside" value={money(data.summary.gst, { decimals: 0 })} />
          {data.summary.byCategory.slice(0, 2).map((c) => (
            <Stat key={c.category} label={c.category} value={money(c.total, { decimals: 0 })} />
          ))}
        </div>
      )}

      {data && data.summary.byCategory.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {[{ category: '', total: data.summary.total }, ...data.summary.byCategory].map((c) => (
            <button
              key={c.category || 'all'}
              onClick={() => setCategory(c.category === category ? '' : c.category)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium', category === c.category ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
            >
              {c.category || 'All'} · {money(c.total, { decimals: 0 })}
            </button>
          ))}
        </div>
      )}

      <Card bodyClassName="p-0">
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <Spinner />
        ) : !data?.rows.length ? (
          <EmptyState title="No expenses for this period" description="Add rent, salaries, electricity and other running costs to see your real profit." action={<Button onClick={openNew}>Add expense</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Paid by</Th>
                <Th className="text-right">GST</Th>
                <Th className="text-right">Total</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap">{date(e.date)}</Td>
                  <Td>
                    <div className="font-medium text-slate-900">{e.description}</div>
                    {(e.vendor || e.referenceId) && <div className="text-xs text-slate-500">{[e.vendor, e.referenceId].filter(Boolean).join(' · ')}</div>}
                  </Td>
                  <Td className="text-slate-600">{e.category}</Td>
                  <Td className="text-slate-600">{methodLabel(e.paymentMethod)}</Td>
                  <Td className="text-right tabular-nums">
                    {e.taxAmount > 0 ? money(e.taxAmount) : '—'}
                    {e.itcEligible && <div className="text-xs text-emerald-600">claimable</div>}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{money(e.total)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" aria-label="Edit" title="Edit" onClick={() => openEdit(e)}>
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Delete" title="Delete" className="hover:text-red-600" onClick={() => remove(e)}>
                      <Trash2 size={14} />
                    </Button>
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
        title={editing ? 'Edit expense' : 'Add expense'}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Add expense'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Input list="expense-categories" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Rent" aria-label="Category" />
            <datalist id="expense-categories">
              {(categories.data ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. October shop rent" aria-label="Description" />
          </Field>
          <Field label={form.taxInclusive ? 'Amount paid (incl. GST)' : 'Amount before GST'}>
            <Input type="number" min="0" step="any" value={form.amount} onChange={(e) => set('amount', e.target.value)} aria-label="Amount" />
          </Field>
          <Field label="GST rate %">
            <Select value={form.taxRate} onChange={(e) => set('taxRate', e.target.value)} aria-label="GST rate">
              {['0', '5', '12', '18', '28'].map((r) => (
                <option key={r} value={r}>
                  {r === '0' ? 'No GST' : `${r}%`}
                </option>
              ))}
            </Select>
          </Field>
          {rate > 0 && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.taxInclusive} onChange={(e) => set('taxInclusive', e.target.checked)} />
              The amount includes GST
            </label>
          )}
          <Field label="Vendor (optional)">
            <Input value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
          </Field>
          <Field label="Vendor GSTIN (optional)" hint="Needed to claim the GST back">
            <Input value={form.vendorGstin} onChange={(e) => set('vendorGstin', e.target.value.toUpperCase())} placeholder="15 characters" />
          </Field>
          {rate > 0 && form.vendorGstin.trim() && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.itcEligible} onChange={(e) => set('itcEligible', e.target.checked)} />
              I can claim this GST (input tax credit)
            </label>
          )}
          <Field label="Paid by">
            <Select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference (optional)" hint="Receipt no., UTR">
            <Input value={form.referenceId} onChange={(e) => set('referenceId', e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          {amount > 0 && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:col-span-2">
              Before GST {money(preview.taxable)} · GST {money(preview.tax)} · <span className="font-semibold">Total {money(preview.total)}</span>
            </div>
          )}
        </div>
      </Modal>
      {confirm.dialog}
    </div>
  );
}
