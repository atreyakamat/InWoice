import { useState } from 'react';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { Button, Card, StatusBadge } from './ui';
import { useToast } from './toast';
import { get, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { dateTime, money } from '../lib/format';
import type { Invoice } from '../lib/types';

interface Session {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  checkoutUrl: string | null;
  utr: string | null;
  note: string | null;
  createdAt: string;
}

/**
 * Online payment (YouPI) on an invoice: the Pay now link to share, a checkout to show a
 * customer at the counter, and every attempt with its result. Shown when YouPI is set up.
 */
export function OnlinePaymentCard({ inv, onPaid }: { inv: Invoice; onPaid: (inv: Invoice) => void }) {
  const toast = useToast();
  const { data, reload, setData } = useLoad(() => get<{ link: string | null; sessions: Session[] }>(`/invoices/${inv.id}/online-payments`), [inv.id, inv.status]);
  const [busy, setBusy] = useState<string | null>(null);
  const open = inv.status === 'PENDING' || inv.status === 'PARTIAL';
  if (!data || (!open && !data.sessions.length)) return null;

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
    <Card title="Online payment">
      {open && (
        <div className="mb-3 flex flex-wrap gap-2">
          {data.link && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void run('copy', async () => {
                  await navigator.clipboard.writeText(data.link!);
                  toast.success('Pay now link copied');
                })
              }
            >
              <Copy size={13} /> Copy Pay now link
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'checkout'}
            onClick={() => {
              // Open the tab inside the click so it isn't blocked as a pop-up.
              const win = window.open('', '_blank');
              void run('checkout', async () => {
                try {
                  const s = await post<Session>(`/invoices/${inv.id}/online-payments`);
                  if (win) win.location.href = s.checkoutUrl!;
                  await reload();
                } catch (err) {
                  win?.close();
                  throw err;
                }
              });
            }}
          >
            <ExternalLink size={13} /> Open checkout
          </Button>
        </div>
      )}
      {data.sessions.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {data.sessions.slice(0, 5).map((s) => (
            <li key={s.id} className="rounded-lg border border-slate-100 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="tabular-nums">{money(s.amount)}</span>
                <StatusBadge status={s.status === 'SUCCESS' ? 'PAID' : s.status} />
              </div>
              <div className="text-xs text-slate-500">
                {dateTime(s.createdAt)}
                {s.utr ? ` · UTR ${s.utr}` : ''}
              </div>
              {s.note && <div className="mt-1 text-xs text-amber-700">{s.note}</div>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">The customer can pay by UPI from the Pay now link in the email, WhatsApp message or portal. It is recorded here automatically.</p>
      )}
      {data.sessions.some((s) => s.status === 'ACTIVE') && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          loading={busy === 'sync'}
          onClick={() =>
            void run('sync', async () => {
              const r = await post<{ updated: number; sessions: Session[]; invoice: Invoice }>(`/invoices/${inv.id}/online-payments/sync`);
              setData((d) => (d ? { ...d, sessions: r.sessions } : d));
              if (r.updated) {
                toast.success('Payment status updated');
                onPaid(r.invoice);
              } else toast.success('No change yet');
            })
          }
        >
          <RefreshCw size={13} /> Check status
        </Button>
      )}
    </Card>
  );
}
