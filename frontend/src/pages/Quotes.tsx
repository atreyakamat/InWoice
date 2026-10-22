import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, Stat, StatusBadge, Table, Td, Th } from '../components/ui';
import { http } from '../lib/api';
import { useDebounced, useLoad } from '../lib/useLoad';
import { date, money } from '../lib/format';
import { cn } from '../lib/utils';
import type { Quote } from '../lib/types';

const TABS = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Converted', value: 'CONVERTED' },
  { label: 'Declined', value: 'DECLINED' },
  { label: 'Expired', value: 'EXPIRED' },
];

export default function Quotes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [search, setSearch] = useState('');
  const q = useDebounced(search);

  const { data, loading, error, reload } = useLoad(async () => {
    const res = await http.get('/quotes', { params: { status: status || undefined, search: q || undefined, limit: 500 } });
    return { rows: res.data.data as Quote[], total: res.data.total as number, summary: res.data.summary as { openQuotes: number; openValue: number } };
  }, [status, q]);

  const setStatus = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('status', value);
    else next.delete('status');
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Quotations and estimates. Turn an accepted quote into an invoice in one click."
        actions={
          <Button onClick={() => navigate('/quotes/new')}>
            <Plus size={15} /> New quote
          </Button>
        }
      />
      {data && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Open quotes" value={money(data.summary.openValue, { decimals: 0 })} hint={`${data.summary.openQuotes} draft, sent or accepted, still valid`} />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', status === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search number or customer…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search quotes" />
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <Card bodyClassName="p-0">
          {loading && !data ? (
            <Spinner />
          ) : !data?.rows.length ? (
            <EmptyState
              title={status || q ? 'No quotes match' : 'No quotes yet'}
              description="Send a professional quotation, let the customer accept it online, then turn it into an invoice."
              action={!status && !q && <Button onClick={() => navigate('/quotes/new')}>New quote</Button>}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Number</Th>
                  <Th>Customer</Th>
                  <Th>Date</Th>
                  <Th>Valid until</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((x) => (
                  <tr key={x.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/quotes/${x.id}`)}>
                    <Td className="whitespace-nowrap font-medium text-slate-900">
                      {x.quoteNumber}
                      {x.invoice && <div className="text-xs font-normal text-slate-500">→ {x.invoice.invoiceNumber}</div>}
                    </Td>
                    <Td>{x.customer?.name}</Td>
                    <Td className="whitespace-nowrap">{date(x.date)}</Td>
                    <Td className={cn('whitespace-nowrap', x.displayStatus === 'EXPIRED' && 'text-amber-700')}>{date(x.validUntil)}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{money(x.grandTotal)}</Td>
                    <Td>
                      <StatusBadge status={x.displayStatus} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
