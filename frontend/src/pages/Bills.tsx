import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, Stat, StatusBadge, Table, Td, Th } from '../components/ui';
import { http } from '../lib/api';
import { useDebounced, useLoad } from '../lib/useLoad';
import { date, money } from '../lib/format';
import { cn } from '../lib/utils';
import type { Bill } from '../lib/types';

const TABS = [
  { label: 'All', value: '' },
  { label: 'Unpaid', value: 'OPEN' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function Bills() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [search, setSearch] = useState('');
  const q = useDebounced(search);

  const { data, loading, error, reload } = useLoad(async () => {
    const res = await http.get('/bills', { params: { status: status || undefined, q: q || undefined, limit: 500 } });
    return { rows: res.data.data as Bill[], total: res.data.total as number, summary: res.data.summary as { openBills: number; owed: number } };
  }, [status, q]);

  const setStatus = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('status', value);
    else next.delete('status');
    setParams(next, { replace: true });
  };

  const overdue = (data?.rows ?? []).filter((b) => b.displayStatus === 'OVERDUE');

  return (
    <div>
      <PageHeader
        title="Bills"
        subtitle="Supplier invoices: what you owe and the GST you can claim back."
        actions={
          <Button onClick={() => navigate('/bills/new')}>
            <Plus size={15} /> New bill
          </Button>
        }
      />

      {data && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="You owe suppliers" value={money(data.summary.owed, { decimals: 0 })} hint={`${data.summary.openBills} unpaid bill${data.summary.openBills === 1 ? '' : 's'}`} />
          {status === 'OVERDUE' && <Stat label="Overdue (shown)" value={money(overdue.reduce((s, b) => s + b.balanceDue, 0), { decimals: 0 })} tone="bad" />}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="relative sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bill number or supplier" className="pl-9" aria-label="Search bills" />
        </div>
      </div>

      <Card bodyClassName="p-0">
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <Spinner />
        ) : !data?.rows.length ? (
          <EmptyState
            title={status || q ? 'No bills match' : 'No bills yet'}
            description="Record supplier invoices here to track what you owe, claim GST input credit and see your real profit."
            action={!status && !q && <Button onClick={() => navigate('/bills/new')}>Record a bill</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Bill</Th>
                <Th>Supplier</Th>
                <Th>Date</Th>
                <Th>Due</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((b) => (
                <tr key={b.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/bills/${b.id}`)}>
                  <Td className="font-medium text-slate-900">
                    {b.billNumber}
                    {b.purchaseOrder && <div className="text-xs font-normal text-slate-500">{b.purchaseOrder.poNumber}</div>}
                  </Td>
                  <Td>{b.supplier.name}</Td>
                  <Td className="whitespace-nowrap">{date(b.date)}</Td>
                  <Td className={cn('whitespace-nowrap', b.displayStatus === 'OVERDUE' && 'font-medium text-red-600')}>{date(b.dueDate)}</Td>
                  <Td className="text-right tabular-nums">{money(b.grandTotal)}</Td>
                  <Td className="text-right tabular-nums">{b.status === 'CANCELLED' ? '—' : money(b.balanceDue)}</Td>
                  <Td>
                    <StatusBadge status={b.displayStatus} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
