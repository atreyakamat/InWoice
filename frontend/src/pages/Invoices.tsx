import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Plus, Search } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, StatusBadge, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/toast';
import { downloadFile, http } from '../lib/api';
import { useDebounced, useLoad } from '../lib/useLoad';
import { date, money } from '../lib/format';
import { cn } from '../lib/utils';
import type { Invoice } from '../lib/types';

const TABS = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Unpaid', value: 'UNPAID' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function Invoices() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const customerId = params.get('customerId') ?? '';
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [exporting, setExporting] = useState(false);

  const { data, loading, error, reload } = useLoad(async () => {
    const res = await http.get('/invoices', {
      params: { status: status || undefined, search: q || undefined, customerId: customerId || undefined, limit: 500 },
    });
    return { rows: res.data.data as Invoice[], total: res.data.total as number };
  }, [status, q, customerId]);

  const setStatus = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('status', value);
    else next.delete('status');
    setParams(next, { replace: true });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile('/export/invoices', 'invoices.csv');
    } catch (err) {
      toast.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={data ? `${data.total} invoice${data.total === 1 ? '' : 's'}` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} loading={exporting}>
              <Download size={15} /> Export CSV
            </Button>
            <Button onClick={() => navigate('/invoices/new')}>
              <Plus size={15} /> New invoice
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                status === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search number or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {customerId && (
        <div className="mb-3 text-sm text-slate-600">
          Filtered by customer.{' '}
          <button
            className="font-medium text-brand-600 hover:underline"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('customerId');
              setParams(next, { replace: true });
            }}
          >
            Clear filter
          </button>
        </div>
      )}

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <Card bodyClassName="p-0">
          {loading && !data ? (
            <Spinner />
          ) : !data || data.rows.length === 0 ? (
            <EmptyState
              title="No invoices found"
              description={status || q ? 'Try a different filter or search.' : 'Create your first invoice to start getting paid.'}
              action={
                !status && !q ? (
                  <Button onClick={() => navigate('/invoices/new')}>
                    <Plus size={15} /> New invoice
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Number</Th>
                  <Th>Customer</Th>
                  <Th>Date</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Balance</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((inv) => (
                  <tr key={inv.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <Td className="whitespace-nowrap font-medium text-slate-900">{inv.invoiceNumber}</Td>
                    <Td>{inv.customer?.name}</Td>
                    <Td className="whitespace-nowrap">{date(inv.date)}</Td>
                    <Td className="whitespace-nowrap">{date(inv.dueDate)}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{money(inv.grandTotal)}</Td>
                    <Td className={cn('whitespace-nowrap text-right tabular-nums', inv.balanceDue > 0 && inv.status !== 'CANCELLED' ? 'font-medium text-slate-900' : 'text-slate-400')}>
                      {inv.status === 'CANCELLED' ? '—' : money(inv.balanceDue)}
                    </Td>
                    <Td>
                      <StatusBadge status={inv.displayStatus} />
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
