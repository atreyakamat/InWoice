import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Download, FileText, QrCode, X } from 'lucide-react';
import { Badge, Button, Modal, Spinner } from '../components/ui';
import { errorMessage, http } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, money, setCurrency } from '../lib/format';
import { cn } from '../lib/utils';

interface PortalData {
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    gstNumber: string | null;
    currency: string;
    currencySymbol: string;
    upiId: string | null;
    bankName: string | null;
    accountNumber: string | null;
    ifscCode: string | null;
  };
  customer: { name: string };
  outstanding: number;
  overdue: number;
  payAllLink: string | null;
  payOnline?: boolean;
  invoices: { id: string; invoiceNumber: string; date: string; dueDate: string | null; grandTotal: number; balance: number; status: string; payLink: string | null }[];
  quotes: { id: string; quoteNumber: string; date: string; validUntil: string | null; grandTotal: number; status: string }[];
}

const LABEL: Record<string, [string, 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'indigo']> = {
  PAID: ['Paid', 'green'],
  OVERDUE: ['Overdue', 'red'],
  PARTIAL: ['Part paid', 'amber'],
  PENDING: ['Due', 'blue'],
  CREDITED: ['Credited', 'green'],
  SENT: ['Awaiting your reply', 'blue'],
  ACCEPTED: ['Accepted', 'green'],
  DECLINED: ['Declined', 'gray'],
  CONVERTED: ['Invoiced', 'indigo'],
  EXPIRED: ['Expired', 'amber'],
};
const StatusPill = ({ status }: { status: string }) => {
  const [text, tone] = LABEL[status] ?? [status, 'gray'];
  return <Badge tone={tone}>{text}</Badge>;
};

/** Public page for one customer, opened from the secret link in their emails. */
export default function Portal() {
  const { token = '' } = useParams();
  const base = `/api/portal/${encodeURIComponent(token)}`;
  const { data, setData, loading, error } = useLoad(async () => {
    const d = (await http.get(`/portal/${encodeURIComponent(token)}`)).data.data as PortalData;
    setCurrency(d.business.currencySymbol, d.business.currency);
    return d;
  }, [token]);
  const [qr, setQr] = useState<{ title: string; src: string; link: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Coming back from the online checkout: ?paid=<invoice> or ?payError=<message>.
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('paid')) return { ok: true, text: `Thank you! Your payment for ${q.get('paid')} will show here as soon as it is confirmed.` };
    if (q.get('payError')) return { ok: false, text: q.get('payError')! };
    return null;
  });

  if (loading && !data) return <Spinner label="Loading your account…" />;
  if (error || !data) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          <p className="font-medium text-slate-900">This link isn&apos;t working</p>
          <p className="mt-1">It may have been replaced or switched off. Please ask the business for a new link.</p>
        </div>
      </div>
    );
  }

  const b = data.business;
  const respond = async (id: string, action: 'accept' | 'decline') => {
    setBusy(`${action}-${id}`);
    setNotice(null);
    try {
      const res = await http.post(`/portal/${encodeURIComponent(token)}/quotes/${id}/${action}`);
      setNotice({ ok: true, text: res.data.message });
      setData((await http.get(`/portal/${encodeURIComponent(token)}`)).data.data);
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };
  const open = data.invoices.filter((i) => i.balance > 0);
  const paid = data.invoices.filter((i) => i.balance <= 0);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          {b.logoUrl ? <img src={b.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">{b.name.slice(0, 1)}</div>}
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{b.name}</div>
            <div className="truncate text-xs text-slate-500">{[b.phone, b.email].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Hi {data.customer.name}</h1>
          <p className="text-sm text-slate-500">Your invoices and quotes from {b.name}.</p>
        </div>

        {notice && <div className={cn('rounded-lg px-4 py-3 text-sm', notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>{notice.text}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount due</div>
              <div className={cn('text-3xl font-bold tabular-nums', data.outstanding > 0 ? 'text-slate-900' : 'text-emerald-600')}>{money(data.outstanding)}</div>
              {data.overdue > 0 && <div className="text-sm text-red-600">{money(data.overdue)} is overdue</div>}
              {data.outstanding <= 0 && <div className="text-sm text-emerald-700">You&apos;re all paid up. Thank you!</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {data.payAllLink && (
                <>
                  <a href={data.payAllLink} className="sm:hidden">
                    <Button>Pay {money(data.outstanding, { decimals: 0 })} with UPI</Button>
                  </a>
                  <Button className="hidden sm:inline-flex" onClick={() => setQr({ title: `Pay ${money(data.outstanding)}`, src: `${base}/qr.png`, link: data.payAllLink })}>
                    <QrCode size={16} /> Pay with UPI
                  </Button>
                </>
              )}
              <a href={`${base}/statement/pdf`} target="_blank" rel="noopener">
                <Button variant="secondary">
                  <FileText size={15} /> Statement
                </Button>
              </a>
            </div>
          </div>
          {(b.bankName || b.accountNumber || b.upiId) && (
            <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {[b.upiId && `UPI: ${b.upiId}`, b.bankName && `Bank: ${b.bankName}`, b.accountNumber && `A/C: ${b.accountNumber}`, b.ifscCode && `IFSC: ${b.ifscCode}`].filter(Boolean).join('  ·  ')}
            </div>
          )}
        </section>

        {data.quotes.some((q) => q.status === 'SENT') && (
          <Section title="Quotes waiting for you">
            {data.quotes
              .filter((q) => q.status === 'SENT')
              .map((q) => (
                <Row key={q.id}>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{q.quoteNumber}</div>
                    <div className="text-xs text-slate-500">
                      {date(q.date)} · valid until {date(q.validUntil)}
                    </div>
                  </div>
                  <div className="text-right font-semibold tabular-nums">{money(q.grandTotal)}</div>
                  <div className="flex flex-wrap justify-end gap-2 sm:col-span-1">
                    <a href={`${base}/quotes/${q.id}/pdf`} target="_blank" rel="noopener">
                      <Button size="sm" variant="secondary">
                        <FileText size={13} /> View
                      </Button>
                    </a>
                    <Button size="sm" onClick={() => respond(q.id, 'accept')} loading={busy === `accept-${q.id}`}>
                      <Check size={13} /> Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => respond(q.id, 'decline')} loading={busy === `decline-${q.id}`}>
                      <X size={13} /> Decline
                    </Button>
                  </div>
                </Row>
              ))}
          </Section>
        )}

        {open.length > 0 && (
          <Section title="Unpaid invoices">
            {open.map((i) => (
              <Row key={i.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {i.invoiceNumber} <StatusPill status={i.status} />
                  </div>
                  <div className="text-xs text-slate-500">
                    {date(i.date)} · due {date(i.dueDate)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{money(i.balance)}</div>
                  {i.balance < i.grandTotal && <div className="text-xs text-slate-500">of {money(i.grandTotal)}</div>}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <a href={`${base}/invoices/${i.id}/pdf`} target="_blank" rel="noopener">
                    <Button size="sm" variant="secondary">
                      <Download size={13} /> PDF
                    </Button>
                  </a>
                  {data.payOnline && (
                    <a href={`${base}/invoices/${i.id}/pay`}>
                      <Button size="sm">Pay now</Button>
                    </a>
                  )}
                  {i.payLink && (
                    <>
                      <a href={i.payLink} className="sm:hidden">
                        <Button size="sm" variant={data.payOnline ? 'secondary' : 'primary'}>
                          {data.payOnline ? 'UPI app' : 'Pay'}
                        </Button>
                      </a>
                      <Button
                        size="sm"
                        variant={data.payOnline ? 'secondary' : 'primary'}
                        className="hidden sm:inline-flex"
                        onClick={() => setQr({ title: `Pay ${i.invoiceNumber}: ${money(i.balance)}`, src: `${base}/qr.png?invoice=${i.id}`, link: i.payLink })}
                      >
                        <QrCode size={13} /> {data.payOnline ? 'UPI QR' : 'Pay'}
                      </Button>
                    </>
                  )}
                </div>
              </Row>
            ))}
          </Section>
        )}

        {paid.length > 0 && (
          <Section title="Paid invoices">
            {paid.map((i) => (
              <Row key={i.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {i.invoiceNumber} <StatusPill status={i.status} />
                  </div>
                  <div className="text-xs text-slate-500">{date(i.date)}</div>
                </div>
                <div className="text-right tabular-nums text-slate-600">{money(i.grandTotal)}</div>
                <div className="flex justify-end">
                  <a href={`${base}/invoices/${i.id}/pdf`} target="_blank" rel="noopener">
                    <Button size="sm" variant="secondary">
                      <Download size={13} /> PDF
                    </Button>
                  </a>
                </div>
              </Row>
            ))}
          </Section>
        )}

        {data.quotes.some((q) => q.status !== 'SENT') && (
          <Section title="Past quotes">
            {data.quotes
              .filter((q) => q.status !== 'SENT')
              .map((q) => (
                <Row key={q.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      {q.quoteNumber} <StatusPill status={q.status} />
                    </div>
                    <div className="text-xs text-slate-500">{date(q.date)}</div>
                  </div>
                  <div className="text-right tabular-nums text-slate-600">{money(q.grandTotal)}</div>
                  <div className="flex justify-end">
                    <a href={`${base}/quotes/${q.id}/pdf`} target="_blank" rel="noopener">
                      <Button size="sm" variant="secondary">
                        <FileText size={13} /> PDF
                      </Button>
                    </a>
                  </div>
                </Row>
              ))}
          </Section>
        )}

        {!data.invoices.length && !data.quotes.length && <p className="text-center text-sm text-slate-500">Nothing here yet.</p>}

        <footer className="pt-4 text-center text-xs text-slate-400">
          {b.name}
          {b.gstNumber && ` · GSTIN ${b.gstNumber}`}
          {b.address && <div>{b.address}</div>}
          <div className="mt-2">Powered by InWoice</div>
        </footer>
      </main>

      <Modal open={qr !== null} onClose={() => setQr(null)} title={qr?.title ?? ''}>
        {qr && (
          <div className="flex flex-col items-center gap-3 text-center text-sm text-slate-600">
            <img src={qr.src} alt="UPI QR code" className="h-56 w-56" />
            <p>Scan with any UPI app (Google Pay, PhonePe, Paytm, your bank). The amount is filled in for you.</p>
            <p className="text-xs text-slate-500">After paying, the business will mark the invoice as paid.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">{title}</h2>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 text-sm sm:grid-cols-[1fr_auto_auto]">{children}</div>;
}
