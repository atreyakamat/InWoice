import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, StatusBadge, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/toast';
import { CustomerSelect, LineItemsCard, TotalsCard } from '../components/SalesForm';
import { blankLine, isInterState, lineError, linesBody, linesFrom, salesTotals, toNum, type Line } from '../lib/salesLines';
import { get, post, put } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { useAuth } from '../context/AuthContext';
import { date, isoDate, money } from '../lib/format';
import type { Customer, Frequency, Pack, Product, RecurringInvoice } from '../lib/types';

interface Loaded {
  customers: Customer[];
  products: Product[];
  packs: Pack[];
  schedule: RecurringInvoice | null;
}

const FREQ: { value: Frequency; label: string; months: number }[] = [
  { value: 'WEEKLY', label: 'Week(s)', months: 0 },
  { value: 'MONTHLY', label: 'Month(s)', months: 1 },
  { value: 'QUARTERLY', label: 'Quarter(s)', months: 3 },
  { value: 'YEARLY', label: 'Year(s)', months: 12 },
];

/** How many past periods a start date in the past would create straight away (max 12, like the server). */
function backlog(start: string, frequency: Frequency, interval: number) {
  if (!start) return 0;
  const s = new Date(`${start}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (s > today) return 0;
  let n = 0;
  for (let i = 0; i < 13; i++) {
    const d =
      frequency === 'WEEKLY'
        ? new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7 * interval * i)
        : new Date(s.getFullYear(), s.getMonth() + FREQ.find((f) => f.value === frequency)!.months * interval * i, Math.min(s.getDate(), 28));
    if (d <= today) n++;
  }
  return Math.min(n, 12);
}

export default function RecurringEditor() {
  const { id } = useParams();
  const { data, loading, error, reload } = useLoad(async (): Promise<Loaded> => {
    const [customers, products, packs, schedule] = await Promise.all([
      get<Customer[]>('/customers', { limit: 500 }),
      get<Product[]>('/products'),
      get<Pack[]>('/packs'),
      id ? get<RecurringInvoice>(`/recurring/${id}`) : Promise.resolve(null),
    ]);
    return { customers, products, packs, schedule };
  }, [id]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  return <RecurringForm key={id ?? 'new'} data={data} id={id} />;
}

function RecurringForm({ data, id }: { data: Loaded; id?: string }) {
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useAuth();
  const defaultTax = settings?.defaultTaxRate ?? 0;
  const r = data.schedule;

  const [customers, setCustomers] = useState<Customer[]>(data.customers);
  const [name, setName] = useState(r?.name ?? '');
  const [customerId, setCustomerId] = useState(r?.customerId ?? '');
  const [frequency, setFrequency] = useState<Frequency>(r?.frequency ?? 'MONTHLY');
  const [interval, setEvery] = useState(String(r?.interval ?? 1));
  const [startDate, setStartDate] = useState(r ? isoDate(r.startDate) : isoDate(new Date()));
  const [endDate, setEndDate] = useState(r ? isoDate(r.endDate) : '');
  const [terms, setTerms] = useState(r?.paymentTermsDays === null || r?.paymentTermsDays === undefined ? '' : String(r.paymentTermsDays));
  const [autoIssue, setAutoIssue] = useState(r?.autoIssue ?? true);
  const [autoEmail, setAutoEmail] = useState(r?.autoEmail ?? false);
  const [discount, setDiscount] = useState(String(r?.discount ?? 0));
  const [shipping, setShipping] = useState(String(r?.shippingCost ?? 0));
  const [notes, setNotes] = useState(r?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() => (r ? linesFrom(r.items) : [blankLine(defaultTax)]));
  const [saving, setSaving] = useState(false);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const interState = isInterState(settings, customer);
  const catalogPrice = (l: Line) => (l.type === 'PRODUCT' ? data.products.find((p) => p.id === l.itemId)?.price : l.type === 'PACK' ? data.packs.find((p) => p.id === l.itemId)?.price : null) ?? null;
  const totals = salesTotals(lines, discount, shipping, interState, catalogPrice);
  const pending = isEdit ? 0 : backlog(startDate, frequency, Math.max(1, toNum(interval)));

  const save = async () => {
    if (!name.trim()) return toast.error('Give the schedule a name');
    if (!customerId) return toast.error('Choose a customer');
    const problem = lineError(lines, { allowBlankPrice: true });
    if (problem) return toast.error(problem);
    setSaving(true);
    const body = {
      name: name.trim(),
      customerId,
      frequency,
      interval: Math.max(1, Math.round(toNum(interval))),
      startDate,
      endDate: endDate || null,
      paymentTermsDays: terms === '' ? '' : toNum(terms),
      autoIssue,
      autoEmail: autoIssue && autoEmail,
      discount: toNum(discount),
      shippingCost: toNum(shipping),
      notes: notes.trim() || null,
      items: linesBody(lines),
    };
    try {
      if (isEdit) await put<RecurringInvoice>(`/recurring/${id}`, body);
      else await post<RecurringInvoice>('/recurring', body);
      toast.success(isEdit ? 'Schedule updated' : 'Schedule created');
      navigate('/recurring');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link to="/recurring" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Recurring invoices
      </Link>
      <PageHeader
        title={isEdit ? `Edit ${r?.name ?? 'schedule'}` : 'New recurring invoice'}
        subtitle={r ? <span className="inline-flex items-center gap-2"><StatusBadge status={r.status} /> {r.runCount} invoice{r.runCount === 1 ? '' : 's'} created so far</span> : 'The same invoice, created automatically every period.'}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Schedule">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *" hint="Only for you, e.g. Monthly retainer" className="sm:col-span-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Schedule name" />
              </Field>
              <Field label="Customer *" className="sm:col-span-2">
                <CustomerSelect customers={customers} onCustomers={setCustomers} value={customerId} onChange={setCustomerId} />
              </Field>
              <Field label="Repeat every">
                <div className="flex gap-2">
                  <Input type="number" min={1} max={12} value={interval} onChange={(e) => setEvery(e.target.value)} className="w-20" aria-label="Interval" />
                  <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} aria-label="Frequency">
                    {FREQ.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Field>
              <Field label="Payment terms (days)" hint={`Blank = ${settings?.paymentTermsDays ?? 15} days (your default)`}>
                <Input type="number" min={0} value={terms} onChange={(e) => setTerms(e.target.value)} />
              </Field>
              <Field label="First invoice on" hint="Later invoices fall on the same day of the period">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" />
              </Field>
              <Field label="Stop after (optional)">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
              <div className="space-y-2 text-sm sm:col-span-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={autoIssue} onChange={(e) => setAutoIssue(e.target.checked)} />
                  Issue each invoice automatically (otherwise it's saved as a draft for you to check)
                </label>
                <label className={`flex items-center gap-2 ${autoIssue ? '' : 'opacity-50'}`}>
                  <input type="checkbox" checked={autoIssue && autoEmail} disabled={!autoIssue} onChange={(e) => setAutoEmail(e.target.checked)} />
                  Email it to the customer{customer && !customer.email ? ' (this customer has no email address yet)' : ''}
                </label>
              </div>
              {pending > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:col-span-2">
                  The first date is today or in the past, so {pending} invoice{pending === 1 ? ' is' : 's are'} created within the next 30 minutes, each dated on its own period.
                </p>
              )}
            </div>
          </Card>
          <LineItemsCard lines={lines} onLines={setLines} products={data.products} packs={data.packs} defaultTax={defaultTax} priceHint="Blank = catalog price on each run" />
          <Card title="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shown on every invoice (optional)" />
          </Card>
          {r?.invoices && r.invoices.length > 0 && (
            <Card title="Invoices created" bodyClassName="p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Date</Th>
                    <Th className="text-right">Total</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.invoices.map((i) => (
                    <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/invoices/${i.id}`)}>
                      <Td className="font-medium text-slate-900">{i.invoiceNumber}</Td>
                      <Td>{date(i.date)}</Td>
                      <Td className="text-right tabular-nums">{money(i.grandTotal)}</Td>
                      <Td>
                        <StatusBadge status={i.displayStatus} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <TotalsCard
            totals={totals}
            interState={interState}
            discount={discount}
            onDiscount={setDiscount}
            shipping={shipping}
            onShipping={setShipping}
            note="Per invoice. Lines with a blank price use the catalog price on the day each invoice is created."
          />
          {r && r.status !== 'ENDED' && <p className="text-sm text-slate-600">Next invoice: {date(r.nextRunDate)}</p>}
          <Button className="w-full" onClick={save} loading={saving}>
            {isEdit ? 'Save changes' : 'Create schedule'}
          </Button>
        </div>
      </div>
    </div>
  );
}
