import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Input, PageHeader, Select, Spinner, Table, Td, Th } from '../components/ui';
import { http } from '../lib/api';
import { useDebounced, useLoad } from '../lib/useLoad';
import { dateTime, titleCase } from '../lib/format';
import { cn } from '../lib/utils';

interface Entry {
  id: string;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  label: string | null;
  path: string | null;
  ip: string | null;
  createdAt: string;
}

const ENTITIES = ['invoices', 'quotes', 'credit-notes', 'customers', 'bills', 'expenses', 'recurring', 'products', 'inventory', 'purchase-orders', 'settings', 'auth', 'portal', 'backups'];
const PAGE = 100;

const tone = (action: string) =>
  action.includes('FAILED') ? 'text-red-600' : action.includes('DELETE') || action === 'CANCEL' ? 'text-amber-700' : action === 'LOGIN' ? 'text-slate-500' : 'text-slate-800';

/** Who changed what, and when. Admins and accountants only. */
export default function ActivityLog() {
  const [entity, setEntity] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useLoad(async () => {
    const res = await http.get('/audit', { params: { entity: entity || undefined, q: q || undefined, limit: PAGE, offset: page * PAGE } });
    return { rows: res.data.data as Entry[], total: res.data.total as number };
  }, [entity, q, page]);

  return (
    <div>
      <PageHeader title="Activity log" subtitle="Every change made in InWoice: who, what and when. Kept for three years." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={entity} onChange={(e) => {
            setEntity(e.target.value);
            setPage(0);
          }} className="w-48" aria-label="Filter by area">
          <option value="">Everything</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {titleCase(e.replace(/-/g, ' '))}
            </option>
          ))}
        </Select>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }} placeholder="Person, number, email…" className="pl-9" aria-label="Search activity" />
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
          <EmptyState title="Nothing recorded yet" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>What</Th>
                  <Th>Reference</Th>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-slate-100', loading && 'opacity-60')}>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap text-slate-500">{dateTime(r.createdAt)}</Td>
                    <Td className="whitespace-nowrap">{r.userName ?? <span className="text-slate-400">Unknown</span>}</Td>
                    <Td className={cn('whitespace-nowrap font-medium', tone(r.action))}>
                      {titleCase(r.action)} <span className="font-normal text-slate-500">· {titleCase(r.entity.replace(/-/g, ' '))}</span>
                    </Td>
                    <Td className="text-slate-600">
                      {r.label ?? <span className="font-mono text-xs text-slate-400">{r.path}</span>}
                      {r.ip && <div className="text-xs text-slate-400">{r.ip}</div>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
              <span>
                {page * PAGE + 1}–{page * PAGE + data.rows.length} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Newer
                </Button>
                <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage((p) => p + 1)}>
                  Older
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
