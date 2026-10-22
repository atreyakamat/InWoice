import { Link } from 'react-router-dom';
import { AlertTriangle, Plus } from 'lucide-react';
import { get } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, money } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { BarChart } from '../components/BarChart';
import { Button, Card, EmptyState, ErrorBox, PageHeader, Spinner, Stat, StatusBadge, Table, Td, Th } from '../components/ui';

interface DashboardData {
  kpis: {
    collectedThisMonth: number;
    invoicedThisMonth: number;
    invoicesThisMonth: number;
    outstanding: number;
    outstandingCount: number;
    overdue: number;
    overdueCount: number;
    customers: number;
    products: number;
    pendingFulfillments: number;
    payables: number;
    payablesCount: number;
    payablesOverdue: number;
    payablesOverdueCount: number;
    spentThisMonth: number;
    profitThisMonth: number;
    tracksCosts: boolean;
    showMoneyOut: boolean;
  };
  monthly: { month: string; invoiced: number; collected: number }[];
  topCustomers: { id: string; name: string; revenue: number; invoices: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  recentInvoices: {
    id: string;
    invoiceNumber: string;
    date: string;
    dueDate: string | null;
    grandTotal: number;
    amountPaid: number;
    status: string;
    customer: { name: string };
  }[];
  lowStock: {
    products: { id: string; name: string; stock: number }[];
    materials: { id: string; name: string; stock: number; unit: string }[];
  };
}

const derived = (i: DashboardData['recentInvoices'][number]) =>
  ['PENDING', 'PARTIAL'].includes(i.status) && i.dueDate && new Date(i.dueDate) < new Date(new Date().toDateString()) ? 'OVERDUE' : i.status;

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(() => get<DashboardData>('/dashboard'));

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const { kpis } = data;
  const hasData = data.monthly.some((m) => m.invoiced > 0 || m.collected > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${user?.name.split(' ')[0] ?? 'there'}`}
        subtitle="Here's how the business is doing this month."
        actions={
          <Link to="/invoices/new">
            <Button>
              <Plus size={16} /> New invoice
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Collected this month" value={money(kpis.collectedThisMonth, { decimals: 0 })} tone="good" />
        <Stat label="Invoiced this month" value={money(kpis.invoicedThisMonth, { decimals: 0 })} hint={`${kpis.invoicesThisMonth} invoices`} />
        <Stat label="Outstanding" value={money(kpis.outstanding, { decimals: 0 })} hint={`${kpis.outstandingCount} unpaid invoices`} />
        <Stat
          label="Overdue"
          value={money(kpis.overdue, { decimals: 0 })}
          hint={kpis.overdueCount ? <Link className="text-red-600 underline" to="/invoices?status=OVERDUE">{kpis.overdueCount} overdue — follow up</Link> : 'Nothing overdue'}
          tone={kpis.overdueCount ? 'bad' : undefined}
        />
      </div>

      {!kpis.showMoneyOut ? null : kpis.tracksCosts ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Profit this month"
            value={<Link to="/accounts" className="hover:underline">{money(kpis.profitThisMonth, { decimals: 0 })}</Link>}
            hint="Sales less bills and expenses"
            tone={kpis.profitThisMonth < 0 ? 'bad' : 'good'}
          />
          <Stat label="Spent this month" value={money(kpis.spentThisMonth, { decimals: 0 })} hint="Supplier payments + expenses" />
          <Stat label="You owe suppliers" value={money(kpis.payables, { decimals: 0 })} hint={`${kpis.payablesCount} unpaid bill${kpis.payablesCount === 1 ? '' : 's'}`} />
          <Stat
            label="Bills overdue"
            value={money(kpis.payablesOverdue, { decimals: 0 })}
            hint={kpis.payablesOverdueCount ? <Link className="text-red-600 underline" to="/bills?status=OVERDUE">{kpis.payablesOverdueCount} to pay now</Link> : 'Nothing overdue'}
            tone={kpis.payablesOverdueCount ? 'bad' : undefined}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          See your real profit: record <Link to="/bills/new" className="font-medium underline">supplier bills</Link> and{' '}
          <Link to="/expenses" className="font-medium underline">expenses</Link>, and InWoice will track what you owe and the GST you can claim back.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Last 12 months" className="lg:col-span-2">
          {hasData ? (
            <BarChart
              data={data.monthly}
              series={[
                { key: 'invoiced', label: 'Invoiced', color: '#a5b4fc' },
                { key: 'collected', label: 'Collected', color: '#4f46e5' },
              ]}
              format={(n) => money(n, { decimals: 0 })}
            />
          ) : (
            <EmptyState title="No sales yet" description="Create your first invoice to see revenue trends here." />
          )}
        </Card>

        <Card title="Needs attention">
          <div className="space-y-3 text-sm">
            {kpis.pendingFulfillments > 0 && (
              <Link to="/fulfillment" className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-blue-800 hover:bg-blue-100">
                <span>Orders to pack & ship</span>
                <span className="font-semibold">{kpis.pendingFulfillments}</span>
              </Link>
            )}
            {data.lowStock.products.map((p) => (
              <Link key={p.id} to="/products" className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 hover:bg-amber-100">
                <AlertTriangle size={14} className="shrink-0" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-semibold">{p.stock <= 0 ? 'Out' : `${p.stock} left`}</span>
              </Link>
            ))}
            {data.lowStock.materials.map((m) => (
              <Link key={m.id} to="/inventory" className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 hover:bg-amber-100">
                <AlertTriangle size={14} className="shrink-0" />
                <span className="flex-1 truncate">{m.name}</span>
                <span className="font-semibold">
                  {m.stock} {m.unit}
                </span>
              </Link>
            ))}
            {!kpis.pendingFulfillments && !data.lowStock.products.length && !data.lowStock.materials.length && (
              <p className="py-6 text-center text-slate-500">All clear. Nothing needs attention.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Recent invoices" className="lg:col-span-2" bodyClassName="p-0" actions={<Link to="/invoices" className="text-xs font-medium text-brand-600">View all</Link>}>
          {data.recentInvoices.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Customer</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentInvoices.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/invoices/${i.id}`} className="font-medium text-brand-700 hover:underline">
                        {i.invoiceNumber}
                      </Link>
                    </Td>
                    <Td>{i.customer.name}</Td>
                    <Td className="whitespace-nowrap">{date(i.date)}</Td>
                    <Td className="text-right tabular-nums">{money(i.grandTotal)}</Td>
                    <Td>
                      <StatusBadge status={derived(i)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No invoices yet" action={<Link to="/invoices/new"><Button size="sm">Create invoice</Button></Link>} />
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Top customers">
            {data.topCustomers.length ? (
              <ul className="space-y-2 text-sm">
                {data.topCustomers.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <Link to={`/customers/${c.id}`} className="truncate text-slate-700 hover:text-brand-700">
                      {c.name}
                    </Link>
                    <span className="font-medium tabular-nums">{money(c.revenue, { decimals: 0 })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No sales yet.</p>
            )}
          </Card>
          <Card title="Best sellers">
            {data.topProducts.length ? (
              <ul className="space-y-2 text-sm">
                {data.topProducts.map((p) => (
                  <li key={p.name} className="flex justify-between gap-2">
                    <span className="truncate text-slate-700">{p.name}</span>
                    <span className="whitespace-nowrap tabular-nums text-slate-500">
                      {p.quantity} sold · <span className="font-medium text-slate-800">{money(p.revenue, { decimals: 0 })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No sales yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
