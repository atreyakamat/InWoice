import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner, Textarea } from '../components/ui';
import { useToast } from '../components/toast';
import { CustomerSelect, LineItemsCard, TotalsCard } from '../components/SalesForm';
import { blankLine, isInterState, lineError, linesBody, linesFrom, salesTotals, toNum, type Line } from '../lib/salesLines';
import { get, post, put } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { useAuth } from '../context/AuthContext';
import { isoDate } from '../lib/format';
import type { Customer, Pack, Product, Quote } from '../lib/types';

interface Loaded {
  customers: Customer[];
  products: Product[];
  packs: Pack[];
  quote: Quote | null;
}

export default function QuoteEditor() {
  const { id } = useParams();
  const { data, loading, error, reload } = useLoad(async (): Promise<Loaded> => {
    const [customers, products, packs, quote] = await Promise.all([
      get<Customer[]>('/customers', { limit: 500 }),
      get<Product[]>('/products'),
      get<Pack[]>('/packs'),
      id ? get<Quote>(`/quotes/${id}`) : Promise.resolve(null),
    ]);
    return { customers, products, packs, quote };
  }, [id]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  if (id && data.quote && !['DRAFT', 'SENT'].includes(data.quote.status)) {
    return (
      <div className="max-w-xl">
        <PageHeader title={`Quote ${data.quote.quoteNumber}`} />
        <Card>
          <p className="text-sm text-slate-600">This quote is {data.quote.status.toLowerCase()} and can no longer be edited. Duplicate it to make a new version.</p>
          <Link to={`/quotes/${data.quote.id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            <ArrowLeft size={14} /> Back to quote
          </Link>
        </Card>
      </div>
    );
  }
  return <QuoteForm key={id ?? 'new'} data={data} id={id} />;
}

function QuoteForm({ data, id }: { data: Loaded; id?: string }) {
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useAuth();
  const defaultTax = settings?.defaultTaxRate ?? 0;
  const q = data.quote;
  const pre = params.get('customerId');

  const [customers, setCustomers] = useState<Customer[]>(data.customers);
  const [customerId, setCustomerId] = useState(q?.customerId ?? (pre && data.customers.some((c) => c.id === pre) ? pre : ''));
  const [quoteDate, setQuoteDate] = useState(q ? isoDate(q.date) : isoDate(new Date()));
  const [validUntil, setValidUntil] = useState(q ? isoDate(q.validUntil) : '');
  const [discount, setDiscount] = useState(String(q?.discount ?? 0));
  const [shipping, setShipping] = useState(String(q?.shippingCost ?? 0));
  const [notes, setNotes] = useState(q?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() => (q ? linesFrom(q.items ?? []) : [blankLine(defaultTax)]));
  const [saving, setSaving] = useState(false);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const interState = isInterState(settings, customer);
  const totals = salesTotals(lines, discount, shipping, interState, () => null);

  const save = async () => {
    if (!customerId) return toast.error('Choose a customer');
    const problem = lineError(lines);
    if (problem) return toast.error(problem);
    setSaving(true);
    const body = {
      customerId,
      date: quoteDate || null,
      validUntil: validUntil || undefined,
      discount: toNum(discount),
      shippingCost: toNum(shipping),
      notes: notes.trim() || null,
      items: linesBody(lines),
    };
    try {
      const saved = isEdit ? await put<Quote>(`/quotes/${id}`, body) : await post<Quote>('/quotes', body);
      toast.success(isEdit ? 'Quote updated' : `Quote ${saved.quoteNumber} saved`);
      navigate(`/quotes/${saved.id}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link to={isEdit ? `/quotes/${id}` : '/quotes'} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> {isEdit ? 'Back to quote' : 'Quotes'}
      </Link>
      <PageHeader title={isEdit ? `Edit ${q?.quoteNumber ?? 'quote'}` : 'New quote'} subtitle="A quote doesn't affect stock or your accounts until it becomes an invoice." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Customer & dates">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer *" className="sm:col-span-2">
                <CustomerSelect customers={customers} onCustomers={setCustomers} value={customerId} onChange={setCustomerId} />
              </Field>
              <Field label="Quote date">
                <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
              </Field>
              <Field label="Valid until" hint={isEdit ? 'Blank keeps the current date' : `Blank = ${settings?.quoteValidityDays ?? 15} days after the quote date`}>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
            </div>
          </Card>
          <LineItemsCard lines={lines} onLines={setLines} products={data.products} packs={data.packs} defaultTax={defaultTax} />
          <Card title="Notes & terms">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope, delivery time, payment terms… (shown on the quote)" />
          </Card>
        </div>
        <div className="space-y-6">
          <TotalsCard totals={totals} interState={interState} discount={discount} onDiscount={setDiscount} shipping={shipping} onShipping={setShipping} />
          <Button className="w-full" onClick={save} loading={saving}>
            {isEdit ? 'Save changes' : 'Save quote'}
          </Button>
        </div>
      </div>
    </div>
  );
}
