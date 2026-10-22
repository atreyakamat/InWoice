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
import type { Customer, Invoice, Pack, Product } from '../lib/types';

interface Loaded {
  customers: Customer[];
  products: Product[];
  packs: Pack[];
  invoice: Invoice | null;
}

export default function InvoiceEditor() {
  const { id } = useParams();
  const { data, loading, error, reload } = useLoad(async (): Promise<Loaded> => {
    const [customers, products, packs, invoice] = await Promise.all([
      get<Customer[]>('/customers', { limit: 500 }),
      get<Product[]>('/products'),
      get<Pack[]>('/packs'),
      id ? get<Invoice>(`/invoices/${id}`) : Promise.resolve(null),
    ]);
    return { customers, products, packs, invoice };
  }, [id]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  if (id && data.invoice && data.invoice.status !== 'DRAFT') {
    return (
      <div className="max-w-xl">
        <PageHeader title={`Invoice ${data.invoice.invoiceNumber}`} />
        <Card>
          <p className="text-sm text-slate-600">
            Only draft invoices can be edited. Issued invoices are locked so your records stay consistent — cancel this invoice and
            duplicate it to make changes.
          </p>
          <Link to={`/invoices/${data.invoice.id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            <ArrowLeft size={14} /> Back to invoice
          </Link>
        </Card>
      </div>
    );
  }
  return <InvoiceForm key={id ?? 'new'} data={data} id={id} />;
}

function InvoiceForm({ data, id }: { data: Loaded; id?: string }) {
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useAuth();
  const defaultTax = settings?.defaultTaxRate ?? 0;
  const inv = data.invoice;
  const pre = params.get('customerId');

  const [customers, setCustomers] = useState<Customer[]>(data.customers);
  const [customerId, setCustomerId] = useState(inv?.customerId ?? (pre && data.customers.some((c) => c.id === pre) ? pre : ''));
  const [invDate, setInvDate] = useState(inv ? isoDate(inv.date) : isoDate(new Date()));
  const [dueDate, setDueDate] = useState(inv ? isoDate(inv.dueDate) : '');
  const [discount, setDiscount] = useState(String(inv?.discount ?? 0));
  const [shipping, setShipping] = useState(String(inv?.shippingCost ?? 0));
  const [notes, setNotes] = useState(inv?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() => (inv ? linesFrom(inv.items ?? []) : [blankLine(defaultTax)]));
  const [saving, setSaving] = useState<null | 'draft' | 'issue'>(null);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const interState = isInterState(settings, customer);
  const totals = salesTotals(lines, discount, shipping, interState, () => null);

  const save = async (issue: boolean) => {
    if (!customerId) return toast.error('Choose a customer');
    const problem = lineError(lines);
    if (problem) return toast.error(problem);
    const body = {
      customerId,
      date: invDate || null,
      dueDate: dueDate || null,
      discount: toNum(discount),
      shippingCost: toNum(shipping),
      notes: notes.trim() || null,
      issue,
      items: linesBody(lines),
    };
    setSaving(issue ? 'issue' : 'draft');
    try {
      const saved = isEdit ? await put<Invoice>(`/invoices/${id}`, body) : await post<Invoice>('/invoices', body);
      toast.success(issue ? `Invoice ${saved.invoiceNumber} issued` : `Draft ${saved.invoiceNumber} saved`);
      navigate(`/invoices/${saved.id}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <Link to={isEdit ? `/invoices/${id}` : '/invoices'} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> {isEdit ? 'Back to invoice' : 'Invoices'}
      </Link>
      <PageHeader
        title={isEdit ? `Edit ${inv?.invoiceNumber ?? 'invoice'}` : 'New invoice'}
        subtitle={isEdit ? 'Draft — not yet sent to the customer' : 'Invoice number is assigned when you save'}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Customer & dates">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer *" className="sm:col-span-2">
                <CustomerSelect customers={customers} onCustomers={setCustomers} value={customerId} onChange={setCustomerId} />
              </Field>
              <Field label="Invoice date">
                <Input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
              </Field>
              <Field label="Due date" hint={isEdit ? 'Blank keeps the current due date' : `Blank = ${settings?.paymentTermsDays ?? 15} days after invoice date`}>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            </div>
          </Card>

          <LineItemsCard lines={lines} onLines={setLines} products={data.products} packs={data.packs} defaultTax={defaultTax} />

          <Card title="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shown on the invoice (optional)" />
          </Card>
        </div>

        <div className="space-y-6">
          <TotalsCard totals={totals} interState={interState} discount={discount} onDiscount={setDiscount} shipping={shipping} onShipping={setShipping} />
          <div className="flex flex-col gap-2">
            <Button onClick={() => save(true)} loading={saving === 'issue'} disabled={saving !== null}>
              Save &amp; issue
            </Button>
            <Button variant="secondary" onClick={() => save(false)} loading={saving === 'draft'} disabled={saving !== null}>
              Save draft
            </Button>
            <p className="text-xs text-slate-500">Issuing locks the invoice, reserves stock and creates a fulfillment order.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
