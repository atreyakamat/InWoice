import { useState } from 'react';
import { Copy, Download, Eye, Link2, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import { Button, Card, Input, useConfirm } from './ui';
import { useToast } from './toast';
import { downloadFile, get, http, openPdf, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { money } from '../lib/format';
import type { Statement } from '../lib/types';

/** Customer portal link: turn on, copy, share on WhatsApp, replace or switch off. */
export function PortalCard({ customerId, customerName, phone }: { customerId: string; customerName: string; phone: string | null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, setData, loading, error } = useLoad(() => get<{ enabled: boolean; url: string | null }>(`/customers/${customerId}/portal`), [customerId]);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!data?.url) return;
    try {
      await navigator.clipboard.writeText(data.url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  };

  const whatsapp = () => {
    if (!data?.url) return;
    const text = `Hi ${customerName}, you can see your invoices and pay online here: ${data.url}`;
    window.open(`https://wa.me/${(phone ?? '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <Card title="Customer portal">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading && !data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !data?.enabled ? (
        <div className="space-y-3 text-sm text-slate-600">
          <p>A private page where {customerName} can see their invoices and quotes, download PDFs, accept quotes and pay by UPI. No login needed.</p>
          <Button size="sm" onClick={() => run('on', async () => setData(await post(`/customers/${customerId}/portal`)))} loading={busy === 'on'}>
            <Link2 size={14} /> Create portal link
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          {data.url ? (
            <Input readOnly value={data.url} onFocus={(e) => e.target.select()} aria-label="Portal link" className="font-mono text-xs" />
          ) : (
            <p className="text-amber-700">Set your public web address in Settings › Business to get a shareable link.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={copy} disabled={!data.url}>
              <Copy size={14} /> Copy
            </Button>
            <Button size="sm" variant="secondary" onClick={() => data.url && window.open(data.url, '_blank', 'noopener')} disabled={!data.url}>
              <Eye size={14} /> Open
            </Button>
            {phone && (
              <Button size="sm" variant="secondary" onClick={whatsapp} disabled={!data.url}>
                <MessageCircle size={14} /> WhatsApp
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-3 pt-1 text-xs">
            <button
              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
              onClick={async () => {
                if (!(await confirm({ title: 'Replace the portal link?', message: 'The current link stops working straight away.', confirmLabel: 'Replace link' }))) return;
                await run('regen', async () => setData(await post(`/customers/${customerId}/portal/regenerate`)));
              }}
            >
              <RefreshCw size={12} /> New link
            </button>
            <button
              className="text-red-600 hover:underline"
              onClick={async () => {
                if (!(await confirm({ title: 'Turn the portal off?', message: 'The link stops working. You can create a new one any time.', confirmLabel: 'Turn off', danger: true }))) return;
                await run('off', async () => setData((await http.delete(`/customers/${customerId}/portal`)).data.data));
              }}
            >
              Turn off
            </button>
          </div>
          <p className="text-xs text-slate-500">Invoice, quote and reminder emails include this link automatically.</p>
        </div>
      )}
      {confirm.dialog}
    </Card>
  );
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Statement of account: last 12 months or one month, view, download or email. */
export function StatementCard({ customerId, hasEmail }: { customerId: string; hasEmail: boolean }) {
  const toast = useToast();
  const [month, setMonth] = useState('');
  const query = month ? `?month=${month}` : '';
  const { data, loading, error } = useLoad(() => get<Statement>(`/customers/${customerId}/statement${query}`), [customerId, query]);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Statement of account">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} className="w-40" aria-label="Statement month" />
        {month && (
          <button className="text-brand-600 hover:underline" onClick={() => setMonth('')}>
            Last 12 months
          </button>
        )}
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data ? (
        <p className="text-sm text-slate-500">{loading ? 'Loading…' : ''}</p>
      ) : (
        <dl className="space-y-1.5 text-sm">
          <Row label="Opening balance" value={money(data.opening)} />
          <Row label="Invoiced" value={money(data.totals.invoiced)} />
          <Row label="Received" value={`− ${money(data.totals.received)}`} />
          {data.totals.credited > 0 && <Row label="Credit notes" value={`− ${money(data.totals.credited)}`} />}
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
            <dt>Closing balance</dt>
            <dd className="tabular-nums">{money(data.closing)}</dd>
          </div>
          <p className="pt-1 text-xs text-slate-500">
            Due now: {money(data.amountDue)}
            {data.overdue > 0 && <span className="text-red-600"> ({money(data.overdue)} overdue)</span>}
          </p>
        </dl>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => run('view', () => openPdf(`/customers/${customerId}/statement/pdf${query}`))} loading={busy === 'view'}>
          <Eye size={14} /> View
        </Button>
        <Button size="sm" variant="secondary" onClick={() => run('dl', () => downloadFile(`/customers/${customerId}/statement/pdf${query}${query ? '&' : '?'}download=1`, 'statement.pdf'))} loading={busy === 'dl'}>
          <Download size={14} /> PDF
        </Button>
        {hasEmail && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              run('mail', async () => {
                const res = await http.post(`/customers/${customerId}/statement/send${query}`, {});
                toast.success(res.data.message);
              })
            }
            loading={busy === 'mail'}
          >
            <Mail size={14} /> Email
          </Button>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}
