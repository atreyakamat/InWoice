import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Pause, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, PageHeader, Spinner, StatusBadge, Table, Td, Th, useConfirm } from '../components/ui';
import { useToast } from '../components/toast';
import { get, http, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, money } from '../lib/format';
import type { Frequency, RecurringInvoice } from '../lib/types';

const UNIT: Record<Frequency, [string, string]> = {
  WEEKLY: ['week', 'weeks'],
  MONTHLY: ['month', 'months'],
  QUARTERLY: ['quarter', 'quarters'],
  YEARLY: ['year', 'years'],
};
const describeSchedule = (f: Frequency, n: number) => (n === 1 ? `Every ${UNIT[f][0]}` : `Every ${n} ${UNIT[f][1]}`);

/** Rough per-run amount from the lines (catalog-priced lines show as "+ catalog"). */
const amountOf = (r: RecurringInvoice) => {
  const fixed = r.items.reduce((s, i) => s + (i.unitPrice ?? 0) * i.quantity * (1 + (i.taxRate ?? 0) / 100), 0);
  return { fixed: fixed - r.discount + r.shippingCost, catalog: r.items.some((i) => i.unitPrice === null) };
};

export default function Recurring() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useLoad(() => get<RecurringInvoice[]>('/recurring'));
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const runNow = async (r: RecurringInvoice) => {
    const ok = await confirm({
      title: `Create the next invoice for ${r.name} now?`,
      message: `It is dated today and the schedule moves on one period (the next run after this is the one after ${date(r.nextRunDate)}).`,
      confirmLabel: 'Create invoice',
    });
    if (!ok) return;
    await act(`run-${r.id}`, async () => {
      const res = await http.post(`/recurring/${r.id}/run`);
      toast.success(res.data.message);
    });
  };

  const remove = async (r: RecurringInvoice) => {
    if (!(await confirm({ title: `Delete ${r.name}?`, message: 'No more invoices will be created. Invoices it already created are kept.', confirmLabel: 'Delete', danger: true }))) return;
    await act(`del-${r.id}`, async () => {
      await http.delete(`/recurring/${r.id}`);
      toast.success('Schedule deleted');
    });
  };

  return (
    <div>
      <PageHeader
        title="Recurring invoices"
        subtitle="Retainers, rent, AMCs and subscriptions: created (and emailed if you like) automatically every period."
        actions={
          <Button onClick={() => navigate('/recurring/new')}>
            <Plus size={15} /> New schedule
          </Button>
        }
      />
      <Card bodyClassName="p-0">
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState
            title="No recurring invoices yet"
            description="Set up a schedule once and InWoice creates the invoice every week, month, quarter or year."
            action={<Button onClick={() => navigate('/recurring/new')}>New schedule</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Schedule</Th>
                <Th>Customer</Th>
                <Th>Repeats</Th>
                <Th>Next invoice</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Created</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r) => {
                const amt = amountOf(r);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <button className="text-left font-medium text-slate-900 hover:underline" onClick={() => navigate(`/recurring/${r.id}/edit`)}>
                        {r.name}
                      </button>
                      <div className="text-xs text-slate-500">
                        {r.autoIssue ? (r.autoEmail ? 'Issued and emailed' : 'Issued automatically') : 'Saved as drafts'}
                      </div>
                      {r.lastError && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-red-600">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {r.lastError}
                        </div>
                      )}
                    </Td>
                    <Td>{r.customer.name}</Td>
                    <Td className="whitespace-nowrap">{describeSchedule(r.frequency, r.interval)}</Td>
                    <Td className="whitespace-nowrap">{r.status === 'ENDED' ? '—' : date(r.nextRunDate)}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {money(amt.fixed)}
                      {amt.catalog && <div className="text-xs text-slate-500">+ catalog prices</div>}
                    </Td>
                    <Td className="text-right tabular-nums">{r._count?.invoices ?? r.runCount}</Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {r.status !== 'ENDED' && (
                        <Button size="sm" variant="ghost" title="Create the next invoice now" aria-label="Create next invoice now" onClick={() => runNow(r)} loading={busy === `run-${r.id}`}>
                          <Zap size={14} />
                        </Button>
                      )}
                      {r.status === 'ACTIVE' && (
                        <Button size="sm" variant="ghost" title="Pause" aria-label="Pause" onClick={() => act(`p-${r.id}`, async () => void (await post(`/recurring/${r.id}/pause`)))} loading={busy === `p-${r.id}`}>
                          <Pause size={14} />
                        </Button>
                      )}
                      {r.status === 'PAUSED' && (
                        <Button size="sm" variant="ghost" title="Resume" aria-label="Resume" onClick={() => act(`p-${r.id}`, async () => void (await post(`/recurring/${r.id}/resume`)))} loading={busy === `p-${r.id}`}>
                          <Play size={14} />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" title="Edit" aria-label="Edit" onClick={() => navigate(`/recurring/${r.id}/edit`)}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" title="Delete" aria-label="Delete" className="hover:text-red-600" onClick={() => remove(r)} loading={busy === `del-${r.id}`}>
                        <Trash2 size={14} />
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {confirm.dialog}
    </div>
  );
}
