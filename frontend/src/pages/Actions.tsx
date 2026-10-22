import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, PackagePlus, Send, Sparkles } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, Textarea } from '../components/ui';
import { useToast } from '../components/toast';
import { get, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, money, num } from '../lib/format';

interface Suggestions {
  reminders: { title: string; total: number; items: { id: string; invoiceNumber: string; customer: string; email: string; balance: number; daysOverdue: number }[] };
  reorder: { title: string; items: { id: string; name: string; unit: string; stock: number; reorderLevel: number; quantity: number; unitPrice: number; supplierId: string | null; supplierName: string | null }[] };
  followUps: { title: string; items: { id: string; quoteNumber: string; customer: string; email: string; total: number; validUntil: string }[] };
}

interface Draft {
  invoiceId: string;
  customer: string;
  invoice: string;
  amountDue: string;
  message: string;
  source: 'AI' | 'TEMPLATE';
}

/**
 * Suggested actions: InWoice proposes, you check the exact list (and edit the emails),
 * and only then does anything happen.
 */
export default function Actions() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => get<Suggestions>('/actions'));
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});

  const run = async (key: string, fn: () => Promise<{ done: string[]; failed: { error: string }[] } | void>) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r) {
        if (r.done.length) toast.success(r.done.join('. '));
        if (r.failed.length) toast.error(r.failed.map((f) => f.error).join('. '));
      }
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  const isOn = (id: string) => picked[id] !== false; // everything starts ticked
  const toggle = (id: string) => setPicked((p) => ({ ...p, [id]: !isOn(id) }));
  const nothing = !data.reminders.items.length && !data.reorder.items.length && !data.followUps.items.length;

  return (
    <div className="space-y-5">
      <PageHeader title="Actions" subtitle="Things InWoice suggests doing now. Nothing happens until you approve it." />
      {nothing && (
        <Card>
          <EmptyState title="Nothing needs doing right now" description="Overdue invoices to chase, materials to reorder and quotes about to expire show up here." />
        </Card>
      )}

      {data.reminders.items.length > 0 && (
        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <BellRing size={15} /> {data.reminders.title} · {money(data.reminders.total, { decimals: 0 })}
            </span>
          }
        >
          {!drafts ? (
            <>
              <ul className="divide-y divide-slate-100 text-sm">
                {data.reminders.items.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <input type="checkbox" checked={isOn(r.id)} onChange={() => toggle(r.id)} aria-label={`Include ${r.invoiceNumber}`} />
                    <Link to={`/invoices/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.invoiceNumber}
                    </Link>
                    <span className="flex-1 truncate">{r.customer}</span>
                    <span className="text-red-600">{r.daysOverdue}d overdue</span>
                    <span className="w-24 text-right font-medium tabular-nums">{money(r.balance)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-end">
                <Button
                  loading={busy === 'draft'}
                  onClick={() =>
                    void run('draft', async () => {
                      const ids = data.reminders.items.filter((r) => isOn(r.id)).map((r) => r.id);
                      if (!ids.length) throw new Error('Tick at least one invoice');
                      setDrafts(await post<Draft[]>('/actions/reminders/draft', { ids }));
                    })
                  }
                >
                  <Sparkles size={15} /> Draft the emails
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4">
                {drafts.map((d, i) => (
                  <div key={d.invoiceId}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="font-medium">{d.customer}</span>
                      <span className="text-slate-500">
                        {d.invoice} · {d.amountDue}
                      </span>
                      <Badge tone={d.source === 'AI' ? 'indigo' : 'gray'}>{d.source === 'AI' ? 'Written by AI' : 'Template'}</Badge>
                    </div>
                    <Textarea
                      value={d.message}
                      onChange={(e) => setDrafts((list) => list!.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)))}
                      className="min-h-[120px]"
                      aria-label={`Reminder for ${d.customer}`}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">The invoice PDF with your UPI QR code is attached to each email.</p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setDrafts(null)}>
                  Back
                </Button>
                <Button
                  loading={busy === 'send'}
                  onClick={() =>
                    void run('send', async () => {
                      const r = await post<{ done: string[]; failed: { error: string }[] }>('/actions/run', { kind: 'reminders', items: drafts.map((d) => ({ id: d.invoiceId, message: d.message })) });
                      setDrafts(null);
                      return r;
                    })
                  }
                >
                  <Send size={15} /> Send {drafts.length} reminder{drafts.length === 1 ? '' : 's'}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {data.reorder.items.length > 0 && (
        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <PackagePlus size={15} /> {data.reorder.title}
            </span>
          }
        >
          <ul className="divide-y divide-slate-100 text-sm">
            {data.reorder.items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
                <input type="checkbox" checked={isOn(m.id) && Boolean(m.supplierId)} disabled={!m.supplierId} onChange={() => toggle(m.id)} aria-label={`Include ${m.name}`} />
                <span className="min-w-[8rem] flex-1">
                  <span className="font-medium">{m.name}</span>
                  <span className="block text-xs text-slate-500">
                    {num(m.stock)} {m.unit} left (reorder at {num(m.reorderLevel)}) · {m.supplierName ?? <span className="text-amber-700">no supplier set</span>}
                  </span>
                </span>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={qty[m.id] ?? String(m.quantity)}
                  onChange={(e) => setQty((q) => ({ ...q, [m.id]: e.target.value }))}
                  className="w-24 text-right"
                  aria-label={`Quantity of ${m.name}`}
                  disabled={!m.supplierId}
                />
                <span className="w-10 text-xs text-slate-500">{m.unit}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button
              loading={busy === 'reorder'}
              onClick={() =>
                void run('reorder', async () => {
                  const items = data.reorder.items.filter((m) => m.supplierId && isOn(m.id)).map((m) => ({ id: m.id, quantity: Number(qty[m.id] ?? m.quantity) }));
                  if (!items.length) throw new Error('Tick at least one material that has a supplier');
                  return post('/actions/run', { kind: 'reorder', items });
                })
              }
            >
              Create draft purchase orders
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Orders are saved as drafts in Purchase Orders. Check them and mark them ordered when you send them.</p>
        </Card>
      )}

      {data.followUps.items.length > 0 && (
        <Card title={data.followUps.title}>
          <ul className="divide-y divide-slate-100 text-sm">
            {data.followUps.items.map((q) => (
              <li key={q.id} className="flex items-center gap-3 py-2">
                <input type="checkbox" checked={isOn(q.id)} onChange={() => toggle(q.id)} aria-label={`Include ${q.quoteNumber}`} />
                <Link to={`/quotes/${q.id}`} className="font-medium text-brand-700 hover:underline">
                  {q.quoteNumber}
                </Link>
                <span className="flex-1 truncate">{q.customer}</span>
                <span className="text-amber-700">valid until {date(q.validUntil)}</span>
                <span className="w-24 text-right tabular-nums">{money(q.total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button
              loading={busy === 'follow'}
              onClick={() =>
                void run('follow', async () => {
                  const items = data.followUps.items.filter((q) => isOn(q.id)).map((q) => ({ id: q.id }));
                  if (!items.length) throw new Error('Tick at least one quote');
                  return post('/actions/run', { kind: 'followUps', items });
                })
              }
            >
              <Send size={15} /> Re-send quotes
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
