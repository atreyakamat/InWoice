import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, PageHeader, Spinner, Stat, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/toast';
import { BarChart } from '../components/BarChart';
import { usePeriod } from '../components/PeriodPicker';
import { downloadFile, get, http, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, money } from '../lib/format';
import { cn } from '../lib/utils';

interface Split {
  igst: number;
  cgst: number;
  sgst: number;
}

interface Pnl {
  period: { label: string };
  income: { sales: number; shipping: number; creditNotes: number; net: number; invoices: number };
  purchases: { rows: { category: string; amount: number }[]; total: number; bills: number };
  grossProfit: number;
  grossMarginPct: number | null;
  expenses: { rows: { category: string; amount: number }[]; total: number; count: number };
  netProfit: number;
  netMarginPct: number | null;
  stock: { opening: number; closing: number; change: number; costOfSales: number; netProfitAfterStock: number } | null;
  debitNotes: number;
  months: { month: string; income: number; purchases: number; expenses: number; profit: number }[];
}

interface Tds {
  receivable: { total: number; rows: { date: string; customer: string; invoice: string; settled: number; tds: number }[] };
  payable: {
    total: number;
    bySection: { section: string; payments: number; amount: number; tds: number }[];
    byMonth: { month: string; tds: number }[];
    rows: { date: string; supplier: string; bill: string; section: string | null; settled: number; tds: number }[];
  };
}

interface TwoBResult {
  portalPeriod: string | null;
  summary: { portalInvoices: number; portalTax: number; matched: number; mismatched: number; missingInBooks: number; missingInBooksTax: number; notInPortal: number; taxAtRisk: number };
  matched: { bill: string; supplier: string; number: string; ok: boolean; taxDifference: number; portal: { taxable: number }; books: { taxable: number; tax: number } }[];
  missingInBooks: { gstin: string; supplierName: string | null; number: string; date: string | null; taxable: number; igst: number; cgst: number; sgst: number }[];
  notInPortal: { bill: string; supplier: string; gstin: string; number: string; date: string; tax: number }[];
}

interface Gstr3b {
  period: { label: string };
  business: { gstin: string | null };
  outward: Split & { taxable: number; totalTax: number };
  nilRated: { taxable: number };
  interStateUnregistered: { placeOfSupply: string; taxable: number; igst: number }[];
  itc: { fromBills: Split & { documents: number }; fromExpenses: Split & { documents: number }; total: Split & { totalTax: number } };
  ineligibleItc: Split & { totalTax: number };
  creditUsed: Split;
  cashPayable: Split & { total: number };
  creditCarriedForward: Split & { total: number };
  warnings: string[];
}

interface AgeSide {
  total: number;
  overdue: number;
  count: number;
  buckets: Record<'current' | '1-30' | '31-60' | '61-90' | '90+', number>;
  parties: { id: string; name: string; documents: number; total: number; overdue: number }[];
  oldest: { id: string; number: string; party: string; balance: number; dueDate: string; daysOverdue: number }[];
}

interface Cash {
  moneyIn: number;
  moneyOut: { supplierPayments: number; expenses: number; total: number };
  net: number;
  months: { month: string; moneyIn: number; supplierPayments: number; expenses: number; net: number }[];
  upcoming: Record<'toReceive' | 'toPay', { overdue: number; next7Days: number; next30Days: number; total: number }>;
}

type Tab = 'pnl' | 'gstr3b' | 'cash' | 'tds';

const pctText = (p: number | null) => (p === null ? '—' : `${p}%`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function Accounts() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('pnl');
  const { params, query, month, picker } = usePeriod();
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (key: string, url: string, name: string) => {
    setDownloading(key);
    try {
      await downloadFile(`${url}?${query}`, `${name}-${params.month ?? `${params.from}_${params.to}`}.csv`);
    } catch (err) {
      toast.error(err);
    } finally {
      setDownloading(null);
    }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pnl', label: 'Profit & loss' },
    { key: 'gstr3b', label: 'GSTR-3B' },
    { key: 'cash', label: 'Cash & dues' },
    { key: 'tds', label: 'TDS' },
  ];

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Profit, GST payable and cash, from your invoices, bills and expenses."
        actions={
          <Button variant="secondary" onClick={() => download('register', '/reports/purchase-register', 'purchase-register')} loading={downloading === 'register'}>
            <FileSpreadsheet size={15} /> Purchase register
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        {picker}
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'pnl' && <PnlView params={params} query={query} onCsv={() => download('pnl', '/reports/pnl/csv', 'profit-and-loss')} csvLoading={downloading === 'pnl'} />}
      {tab === 'gstr3b' && <Gstr3bView params={params} query={query} />}
      {tab === 'cash' && <CashView params={params} query={query} month={month} />}
      {tab === 'tds' && <TdsView params={params} query={query} />}
    </div>
  );
}

function PnlView({ params, query, onCsv, csvLoading }: { params: Record<string, string>; query: string; onCsv: () => void; csvLoading: boolean }) {
  const { data: p, loading, error, reload } = useLoad(() => get<Pnl>('/reports/pnl', params), [query]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!p) return <Spinner />;
  const nothing = p.income.invoices + p.purchases.bills + p.expenses.count === 0;
  const noCosts = p.purchases.bills + p.expenses.count === 0;

  return (
    <div className={cn('space-y-5', loading && 'opacity-60')}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net sales" value={money(p.income.net, { decimals: 0 })} hint={`${plural(p.income.invoices, 'invoice')}, before GST`} />
        <Stat
          label="Purchases"
          value={money(p.purchases.total, { decimals: 0 })}
          hint={`${plural(p.purchases.bills, 'bill')}${p.debitNotes ? `, less ${plural(p.debitNotes, 'debit note')}` : ''}`}
        />
        <Stat label="Expenses" value={money(p.expenses.total, { decimals: 0 })} hint={plural(p.expenses.count, 'expense')} />
        <Stat label="Net profit" value={money(p.netProfit, { decimals: 0 })} hint={`Margin ${pctText(p.netMarginPct)}`} tone={p.netProfit < 0 ? 'bad' : p.netProfit > 0 ? 'good' : undefined} />
      </div>

      {noCosts && !nothing && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          No bills or expenses recorded for this period, so profit equals sales. Add <Link to="/bills/new" className="font-medium underline">supplier bills</Link> and{' '}
          <Link to="/expenses" className="font-medium underline">expenses</Link> to see your real profit.
        </div>
      )}

      {nothing ? (
        <Card>
          <EmptyState title="Nothing recorded for this period" description="Invoices, bills and expenses dated in this period will appear here." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <Card title={`Profit & loss · ${p.period.label}`} className="lg:col-span-3" actions={<Button size="sm" variant="secondary" onClick={onCsv} loading={csvLoading}><Download size={14} /> CSV</Button>} bodyClassName="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <Heading>Income</Heading>
                <Line label="Sales (before GST)" v={p.income.sales} />
                {p.income.shipping > 0 && <Line label="Shipping charged" v={p.income.shipping} />}
                {p.income.creditNotes > 0 && <Line label="Less: credit notes" v={-p.income.creditNotes} />}
                <Line label="Net sales" v={p.income.net} strong />
                <Heading>Purchases</Heading>
                {p.purchases.rows.map((r) => (
                  <Line key={r.category} label={r.category} v={-r.amount} />
                ))}
                {!p.purchases.rows.length && <Line label="No bills in this period" v={0} muted />}
                <Line label="Gross profit" v={p.grossProfit} strong hint={`Margin ${pctText(p.grossMarginPct)}`} />
                <Heading>Expenses</Heading>
                {p.expenses.rows.map((r) => (
                  <Line key={r.category} label={r.category} v={-r.amount} />
                ))}
                {!p.expenses.rows.length && <Line label="No expenses in this period" v={0} muted />}
                <Line label="Net profit" v={p.netProfit} strong big hint={`Margin ${pctText(p.netMarginPct)}`} />
                {p.stock && (
                  <>
                    <Heading>Stock</Heading>
                    <Line label={`Stock at start ${money(p.stock.opening, { decimals: 0 })}, at end ${money(p.stock.closing, { decimals: 0 })}`} v={p.stock.change} />
                    <Line label="Cost of goods sold" v={-p.stock.costOfSales} muted />
                    <Line label="Net profit after stock change" v={p.stock.netProfitAfterStock} strong />
                  </>
                )}
              </tbody>
            </table>
          </Card>
          <div className="space-y-5 lg:col-span-2">
            {p.months.length > 1 && (
              <Card title="By month">
                <BarChart
                  data={p.months}
                  series={[
                    { key: 'income', label: 'Net sales', color: '#4f46e5' },
                    { key: 'purchases', label: 'Purchases', color: '#f59e0b' },
                    { key: 'expenses', label: 'Expenses', color: '#ef4444' },
                  ]}
                  format={(n) => money(n, { decimals: 0 })}
                />
              </Card>
            )}
            <StockCard />
            <Card title="How this is worked out">
              <ul className="list-disc space-y-1.5 pl-4 text-xs text-slate-600">
                <li>All amounts exclude GST you can claim back. It isn&apos;t income or cost; it shows up in GSTR-3B.</li>
                <li>GST you can&apos;t claim (marked on the bill or expense) is part of the cost.</li>
                <li>
                  Purchases count in the month of the bill. InWoice records the value of your stock (at cost) every day; when it has the value at both ends of the
                  period it also shows the change in stock and the profit after it.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Gstr3bView({ params, query }: { params: Record<string, string>; query: string }) {
  const { data: r, loading, error, reload } = useLoad(() => get<Gstr3b>('/reports/gstr3b', params), [query]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!r) return <Spinner />;
  const heads = (s: Split, extra?: ReactNode) => (
    <>
      <MoneyTd v={s.igst} />
      <MoneyTd v={s.cgst} />
      <MoneyTd v={s.sgst} />
      {extra}
    </>
  );

  return (
    <div className={cn('space-y-5', loading && 'opacity-60')}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Output tax" value={money(r.outward.totalTax, { decimals: 0 })} hint={`On ${money(r.outward.taxable, { decimals: 0 })} taxable sales`} />
        <Stat label="Input tax credit" value={money(r.itc.total.totalTax, { decimals: 0 })} hint={`${plural(r.itc.fromBills.documents, 'bill')} · ${plural(r.itc.fromExpenses.documents, 'expense')}`} tone="good" />
        <Stat label="GST to pay in cash" value={money(r.cashPayable.total, { decimals: 0 })} tone={r.cashPayable.total > 0 ? 'warn' : undefined} />
        <Stat label="Credit carried forward" value={money(r.creditCarriedForward.total, { decimals: 0 })} />
      </div>

      {r.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {r.warnings.map((w) => (
            <p key={w} className="flex gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      <Card title={`GSTR-3B summary · ${r.period.label}`} bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Table</Th>
              <Th className="text-right">Taxable value</Th>
              <Th className="text-right">IGST</Th>
              <Th className="text-right">CGST</Th>
              <Th className="text-right">SGST</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <Td>3.1(a) Outward taxable supplies</Td>
              <MoneyTd v={r.outward.taxable} />
              {heads(r.outward)}
            </tr>
            <tr>
              <Td>3.1(c) Nil-rated / exempt</Td>
              <MoneyTd v={r.nilRated.taxable} />
              <Td />
              <Td />
              <Td />
            </tr>
            <tr>
              <Td>4(A)(5) Eligible ITC: bills</Td>
              <Td />
              {heads(r.itc.fromBills)}
            </tr>
            <tr>
              <Td>4(A)(5) Eligible ITC: expenses</Td>
              <Td />
              {heads(r.itc.fromExpenses)}
            </tr>
            <tr className="bg-slate-50 font-medium">
              <Td>Net ITC available</Td>
              <Td />
              {heads(r.itc.total)}
            </tr>
            <tr>
              <Td className="text-slate-500">4(D) Ineligible ITC (not claimed)</Td>
              <Td />
              {heads(r.ineligibleItc)}
            </tr>
            <tr>
              <Td>6.1 Paid through ITC</Td>
              <Td />
              {heads(r.creditUsed)}
            </tr>
            <tr className="bg-amber-50 font-semibold">
              <Td>6.1 Tax payable in cash</Td>
              <MoneyTd v={r.cashPayable.total} />
              {heads(r.cashPayable)}
            </tr>
            <tr>
              <Td className="text-slate-500">ITC left over (carried forward)</Td>
              <Td />
              {heads(r.creditCarriedForward)}
            </tr>
          </tbody>
        </Table>
      </Card>

      {r.interStateUnregistered.length > 0 && (
        <Card title="3.2 Inter-state supplies to unregistered persons" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Place of supply</Th>
                <Th className="text-right">Taxable value</Th>
                <Th className="text-right">IGST</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.interStateUnregistered.map((x) => (
                <tr key={x.placeOfSupply}>
                  <Td>{x.placeOfSupply}</Td>
                  <MoneyTd v={x.taxable} />
                  <MoneyTd v={x.igst} />
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <TwoBCheck params={params} />

      <p className="text-xs text-slate-500">
        Credit is set off in the legal order: IGST credit first (IGST, then CGST, then SGST), then CGST credit (CGST, then IGST) and SGST credit (SGST, then
        IGST). Output tax uses the same data as your <Link to="/reports" className="underline">GSTR-1 report</Link>. Have your accountant review before filing.
      </p>
    </div>
  );
}

function CashView({ params, query, month }: { params: Record<string, string>; query: string; month: string }) {
  const cash = useLoad(() => get<Cash>('/reports/cash', params), [query]);
  const age = useLoad(() => get<{ receivables: AgeSide; payables: AgeSide }>('/reports/ageing'));
  const c = cash.data;
  if (cash.error) return <ErrorBox message={cash.error} onRetry={cash.reload} />;
  if (!c) return <Spinner />;

  return (
    <div className={cn('space-y-5', cash.loading && 'opacity-60')}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Money in" value={money(c.moneyIn, { decimals: 0 })} hint="Customer payments" tone="good" />
        <Stat label="Money out" value={money(c.moneyOut.total, { decimals: 0 })} hint={`Suppliers ${money(c.moneyOut.supplierPayments, { decimals: 0 })} · expenses ${money(c.moneyOut.expenses, { decimals: 0 })}`} />
        <Stat label="Net cash flow" value={money(c.net, { decimals: 0 })} tone={c.net < 0 ? 'bad' : undefined} hint={params.month === month ? 'This period' : undefined} />
        <Stat
          label="Next 30 days"
          value={money(c.upcoming.toReceive.next30Days - c.upcoming.toPay.next30Days, { decimals: 0 })}
          hint={`To receive ${money(c.upcoming.toReceive.next30Days, { decimals: 0 })} · to pay ${money(c.upcoming.toPay.next30Days, { decimals: 0 })}`}
        />
      </div>

      {c.months.length > 1 && (
        <Card title="Cash by month">
          <BarChart
            data={c.months.map((m) => ({ month: m.month, moneyIn: m.moneyIn, moneyOut: m.supplierPayments + m.expenses }))}
            series={[
              { key: 'moneyIn', label: 'In', color: '#10b981' },
              { key: 'moneyOut', label: 'Out', color: '#ef4444' },
            ]}
            format={(n) => money(n, { decimals: 0 })}
          />
        </Card>
      )}

      {age.error ? (
        <ErrorBox message={age.error} onRetry={age.reload} />
      ) : !age.data ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <AgeCard title="Customers owe you" side={age.data.receivables} link={(id) => `/invoices/${id}`} partyLink={(id) => `/customers/${id}`} />
          <AgeCard title="You owe suppliers" side={age.data.payables} link={(id) => `/bills/${id}`} />
        </div>
      )}
    </div>
  );
}

const BUCKETS: { key: keyof AgeSide['buckets']; label: string }[] = [
  { key: 'current', label: 'Not due' },
  { key: '1-30', label: '1–30 days' },
  { key: '31-60', label: '31–60' },
  { key: '61-90', label: '61–90' },
  { key: '90+', label: '90+' },
];

function AgeCard({ title, side, link, partyLink }: { title: string; side: AgeSide; link: (id: string) => string; partyLink?: (id: string) => string }) {
  return (
    <Card title={`${title} · ${money(side.total, { decimals: 0 })}`} bodyClassName="p-0">
      <div className="grid grid-cols-5 border-b border-slate-100 text-center">
        {BUCKETS.map((b) => (
          <div key={b.key} className="px-1 py-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{b.label}</div>
            <div className={cn('mt-0.5 text-sm font-semibold tabular-nums', b.key !== 'current' && side.buckets[b.key] > 0 ? 'text-red-600' : 'text-slate-800')}>
              {money(side.buckets[b.key], { decimals: 0 })}
            </div>
          </div>
        ))}
      </div>
      {!side.parties.length ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing outstanding.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th className="text-right">Overdue</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {side.parties.slice(0, 10).map((p) => (
              <tr key={p.id}>
                <Td>
                  {partyLink ? (
                    <Link to={partyLink(p.id)} className="hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    p.name
                  )}
                  <div className="text-xs text-slate-500">
                    {p.documents} open
                  </div>
                </Td>
                <MoneyTd v={p.overdue} className={p.overdue > 0 ? 'text-red-600' : undefined} />
                <MoneyTd v={p.total} />
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {side.oldest.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
          <div className="mb-1 font-medium text-slate-700">Most overdue</div>
          {side.oldest.slice(0, 5).map((o) => (
            <div key={o.id} className="flex justify-between gap-2 py-0.5">
              <Link to={link(o.id)} className="truncate hover:underline">
                {o.number} · {o.party}
              </Link>
              <span className="whitespace-nowrap tabular-nums">
                {money(o.balance, { decimals: 0 })} · {o.daysOverdue}d (due {date(o.dueDate)})
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <tr className="bg-slate-50">
      <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {children}
      </td>
    </tr>
  );
}

function Line({ label, v, strong, big, muted, hint }: { label: string; v: number; strong?: boolean; big?: boolean; muted?: boolean; hint?: string }) {
  return (
    <tr className={cn(strong && 'font-semibold text-slate-900', big && 'text-base')}>
      <td className={cn('px-4 py-2', muted ? 'text-slate-400' : 'text-slate-700', strong && 'text-slate-900')}>
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}
      </td>
      <td className={cn('whitespace-nowrap px-4 py-2 text-right tabular-nums', v < 0 && !strong && 'text-slate-600', strong && v < 0 && 'text-red-600')}>{money(v)}</td>
    </tr>
  );
}

function MoneyTd({ v, className }: { v: number; className?: string }) {
  return <Td className={cn('whitespace-nowrap text-right tabular-nums', className)}>{money(v)}</Td>;
}

function TdsView({ params, query }: { params: Record<string, string>; query: string }) {
  const { data: t, loading, error, reload } = useLoad(() => get<Tds>('/reports/tds', params), [query]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!t) return <Spinner />;
  return (
    <div className={cn('space-y-5', loading && 'opacity-60')}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="TDS deducted by customers" value={money(t.receivable.total, { decimals: 0 })} hint="Claim it on your tax return (check Form 26AS)" tone="good" />
        <Stat label="TDS you deducted" value={money(t.payable.total, { decimals: 0 })} hint="Deposit by the 7th of next month" tone={t.payable.total > 0 ? 'warn' : undefined} />
      </div>
      {t.payable.bySection.length > 0 && (
        <Card title="TDS to deposit, by section" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Section</Th>
                <Th className="text-right">Payments</Th>
                <Th className="text-right">Amount paid</Th>
                <Th className="text-right">TDS</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.payable.bySection.map((r) => (
                <tr key={r.section}>
                  <Td className="font-medium">{r.section}</Td>
                  <Td className="text-right tabular-nums">{r.payments}</Td>
                  <MoneyTd v={r.amount} />
                  <MoneyTd v={r.tds} />
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Deducted by customers" bodyClassName="p-0">
          {!t.receivable.rows.length ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">None in this period.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Customer</Th>
                  <Th className="text-right">TDS</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.receivable.rows.map((r, i) => (
                  <tr key={i}>
                    <Td className="whitespace-nowrap">{date(r.date)}</Td>
                    <Td>
                      {r.customer}
                      <div className="text-xs text-slate-500">{r.invoice}</div>
                    </Td>
                    <MoneyTd v={r.tds} />
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Deducted by you" bodyClassName="p-0">
          {!t.payable.rows.length ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">None in this period.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Supplier</Th>
                  <Th className="text-right">TDS</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.payable.rows.map((r, i) => (
                  <tr key={i}>
                    <Td className="whitespace-nowrap">{date(r.date)}</Td>
                    <Td>
                      {r.supplier}
                      <div className="text-xs text-slate-500">
                        {r.bill}
                        {r.section ? ` · ${r.section}` : ''}
                      </div>
                    </Td>
                    <MoneyTd v={r.tds} />
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Upload GSTR-2B from the GST portal and compare it with your bills. */
function TwoBCheck({ params }: { params: Record<string, string> }) {
  const toast = useToast();
  const [result, setResult] = useState<TwoBResult | null>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const json = JSON.parse(await file.text());
      setResult((await http.post('/reports/gstr2b/match', json, { params })).data.data);
    } catch (err) {
      toast.error(err instanceof SyntaxError ? 'That file is not valid JSON. Download GSTR-2B from the GST portal as JSON.' : err);
    } finally {
      setBusy(false);
    }
  };
  const r = result;
  return (
    <Card
      title="Check input credit against GSTR-2B"
      actions={
        <label className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50', busy && 'opacity-60')}>
          <Upload size={13} /> {busy ? 'Checking…' : 'Upload GSTR-2B JSON'}
          <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onFile(e)} disabled={busy} />
        </label>
      }
      bodyClassName={r ? 'p-0' : undefined}
    >
      {!r ? (
        <p className="text-sm text-slate-500">
          Download GSTR-2B for the month from the GST portal (Returns › GSTR-2B › Download JSON) and upload it here. InWoice shows which bills your suppliers have
          reported, which they haven&apos;t (credit at risk) and which they reported that you haven&apos;t recorded.
        </p>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
            <Stat label="Matched" value={r.summary.matched} tone="good" />
            <Stat label="Amounts differ" value={r.summary.mismatched} tone={r.summary.mismatched ? 'warn' : undefined} />
            <Stat label="Not in your books" value={r.summary.missingInBooks} hint={money(r.summary.missingInBooksTax, { decimals: 0 }) + ' GST'} />
            <Stat label="Credit at risk" value={money(r.summary.taxAtRisk, { decimals: 0 })} hint={`${r.summary.notInPortal} bill(s) not reported by supplier`} tone={r.summary.taxAtRisk ? 'bad' : undefined} />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>Number</Th>
                <Th>Result</Th>
                <Th className="text-right">GST</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.matched
                .filter((m) => !m.ok)
                .map((m) => (
                  <tr key={m.bill}>
                    <Td>{m.supplier}</Td>
                    <Td>{m.number}</Td>
                    <Td className="text-amber-700">Supplier reported {money(m.taxDifference)} {m.taxDifference > 0 ? 'more' : 'less'} GST than your bill</Td>
                    <MoneyTd v={m.books.tax} />
                  </tr>
                ))}
              {r.notInPortal.map((b) => (
                <tr key={b.bill}>
                  <Td>{b.supplier}</Td>
                  <Td>{b.number}</Td>
                  <Td className="text-red-700">Not reported by the supplier yet: don&apos;t claim this credit until it appears</Td>
                  <MoneyTd v={b.tax} />
                </tr>
              ))}
              {r.missingInBooks.map((p) => (
                <tr key={`${p.gstin}-${p.number}`}>
                  <Td>{p.supplierName ?? p.gstin}</Td>
                  <Td>{p.number}</Td>
                  <Td className="text-slate-600">Reported by the supplier but not in your bills: record the bill to claim it</Td>
                  <MoneyTd v={p.igst + p.cgst + p.sgst} />
                </tr>
              ))}
              {r.summary.mismatched + r.summary.notInPortal + r.summary.missingInBooks === 0 && (
                <tr>
                  <Td colSpan={4} className="text-center text-emerald-700">
                    Everything matches.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}

/** Stock value at cost right now, and a button to record it for the P&L. */
function StockCard() {
  const toast = useToast();
  const { data, reload } = useLoad(() => get<{ now: { materialsValue: number; productsValue: number; total: number }; snapshots: { date: string; total: number }[] }>('/reports/stock'));
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  return (
    <Card
      title="Stock value (at cost)"
      actions={
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await post('/reports/stock/snapshot');
              toast.success("Today's stock value recorded");
              await reload();
            } catch (err) {
              toast.error(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          Record now
        </Button>
      }
    >
      <div className="text-2xl font-bold tabular-nums text-slate-900">{money(data.now.total, { decimals: 0 })}</div>
      <p className="text-xs text-slate-500">
        Materials {money(data.now.materialsValue, { decimals: 0 })} · finished goods {money(data.now.productsValue, { decimals: 0 })}.{' '}
        {data.snapshots.length ? `Recorded daily since ${date(data.snapshots[data.snapshots.length - 1]!.date)}.` : 'Recorded automatically every day.'}
      </p>
    </Card>
  );
}
