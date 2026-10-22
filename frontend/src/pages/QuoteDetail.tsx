import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Download, Eye, FileText, Mail, Pencil, Trash2, X } from 'lucide-react';
import { Button, Card, ErrorBox, Field, Input, Modal, Spinner, StatusBadge, Table, Td, Textarea, Th, useConfirm } from '../components/ui';
import { useToast } from '../components/toast';
import { downloadFile, get, http, openPdf, patch, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, dateTime, money } from '../lib/format';
import type { Invoice, Quote } from '../lib/types';

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: q, setData, loading, error, reload } = useLoad(() => get<Quote>(`/quotes/${id}`), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [mail, setMail] = useState({ to: '', subject: '', message: '' });

  if (loading && !q) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!q) return null;

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

  const open = q.status === 'DRAFT' || q.status === 'SENT';
  const converted = q.status === 'CONVERTED';
  const setStatus = (status: string, msg: string) =>
    run(status, async () => {
      setData(await patch<Quote>(`/quotes/${id}/status`, { status }));
      toast.success(msg);
    });

  const convert = async () => {
    const ok = await confirm({
      title: `Create an invoice from ${q.quoteNumber}?`,
      message: 'A draft invoice is created with the same lines and prices. You can check it, then issue it.',
      confirmLabel: 'Create invoice',
    });
    if (!ok) return;
    await run('convert', async () => {
      const inv = await post<Invoice>(`/quotes/${id}/convert`, { issue: false });
      toast.success(`Draft invoice ${inv.invoiceNumber} created`);
      navigate(`/invoices/${inv.id}`);
    });
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${q.quoteNumber}?`, confirmLabel: 'Delete', danger: true }))) return;
    await run('delete', async () => {
      await http.delete(`/quotes/${id}`);
      toast.success('Quote deleted');
      navigate('/quotes');
    });
  };

  const submitMail = (e: FormEvent) => {
    e.preventDefault();
    void run('mail', async () => {
      const res = await http.post(`/quotes/${id}/send`, { to: mail.to.trim() || undefined, subject: mail.subject.trim() || undefined, message: mail.message.trim() || undefined });
      setData(res.data.data);
      setMailOpen(false);
      toast.success(res.data.message ?? 'Quote emailed');
    });
  };

  return (
    <div>
      <Link to="/quotes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Quotes
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{q.quoteNumber}</h1>
            <StatusBadge status={q.displayStatus} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <Link to={`/customers/${q.customerId}`} className="font-medium text-brand-600 hover:underline">
              {q.customer.name}
            </Link>{' '}
            · {date(q.date)} · Valid until {date(q.validUntil)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!converted && q.status !== 'DECLINED' && (
            <Button onClick={convert} loading={busy === 'convert'}>
              <FileText size={15} /> Convert to invoice
            </Button>
          )}
          {open && (
            <Button variant="secondary" onClick={() => navigate(`/quotes/${id}/edit`)}>
              <Pencil size={15} /> Edit
            </Button>
          )}
          <Button variant="secondary" onClick={() => run('pdf', () => openPdf(`/quotes/${id}/pdf`))} loading={busy === 'pdf'}>
            <Eye size={15} /> View PDF
          </Button>
          <Button variant="secondary" onClick={() => run('download', () => downloadFile(`/quotes/${id}/pdf?download=1`, `${q.quoteNumber}.pdf`))} loading={busy === 'download'}>
            <Download size={15} /> Download
          </Button>
          {!converted && (
            <Button
              variant="secondary"
              onClick={() => {
                setMail({ to: q.customer.email ?? '', subject: '', message: '' });
                setMailOpen(true);
              }}
            >
              <Mail size={15} /> Email
            </Button>
          )}
          {(q.status === 'SENT' || q.status === 'DRAFT') && (
            <>
              <Button variant="secondary" onClick={() => setStatus('ACCEPTED', 'Marked as accepted')} loading={busy === 'ACCEPTED'}>
                <Check size={15} /> Accepted
              </Button>
              <Button variant="secondary" onClick={() => setStatus('DECLINED', 'Marked as declined')} loading={busy === 'DECLINED'}>
                <X size={15} /> Declined
              </Button>
            </>
          )}
          {(q.status === 'ACCEPTED' || q.status === 'DECLINED') && (
            <Button variant="ghost" onClick={() => setStatus('SENT', 'Reopened')} loading={busy === 'SENT'}>
              Reopen
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              run('duplicate', async () => {
                const dup = await post<Quote>(`/quotes/${id}/duplicate`);
                toast.success(`Copied to ${dup.quoteNumber}`);
                navigate(`/quotes/${dup.id}`);
              })
            }
            loading={busy === 'duplicate'}
          >
            <Copy size={15} /> Duplicate
          </Button>
          {!converted && (
            <Button variant="ghost" onClick={remove} loading={busy === 'delete'} className="text-red-600 hover:bg-red-50">
              <Trash2 size={15} /> Delete
            </Button>
          )}
        </div>
      </div>

      {converted && q.invoice && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Converted to invoice{' '}
          <Link to={`/invoices/${q.invoice.id}`} className="font-semibold underline">
            {q.invoice.invoiceNumber}
          </Link>
          .
        </div>
      )}
      {q.displayStatus === 'EXPIRED' && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This quote passed its validity date. Edit the date to extend it, or duplicate it with current prices.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Items" className="lg:col-span-2" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">Tax</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(q.items ?? []).map((i) => (
                <tr key={i.id}>
                  <Td>
                    <div className="font-medium text-slate-900">{i.name}</div>
                    {i.hsnCode && <div className="text-xs text-slate-500">HSN {i.hsnCode}</div>}
                  </Td>
                  <Td className="text-right tabular-nums">{i.quantity}</Td>
                  <Td className="text-right tabular-nums">{money(i.unitPrice)}</Td>
                  <Td className="text-right tabular-nums">{i.taxRate}%</Td>
                  <Td className="text-right tabular-nums">{money(i.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card title="Summary">
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={money(q.subtotal)} />
              {q.discount > 0 && <Row label="Discount" value={`− ${money(q.discount)}`} />}
              {q.igst > 0 && <Row label="IGST" value={money(q.igst)} />}
              {q.cgst > 0 && <Row label="CGST" value={money(q.cgst)} />}
              {q.sgst > 0 && <Row label="SGST" value={money(q.sgst)} />}
              {q.shippingCost > 0 && <Row label="Shipping" value={money(q.shippingCost)} />}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(q.grandTotal)}</dd>
              </div>
            </dl>
          </Card>
          <Card title="History">
            <ul className="space-y-1 text-sm text-slate-600">
              <li>Created {date(q.date)}</li>
              {q.sentAt && <li>Sent {dateTime(q.sentAt)}</li>}
              {q.respondedAt && (
                <li>
                  {q.status === 'DECLINED' ? 'Declined' : 'Accepted'} {dateTime(q.respondedAt)}
                </li>
              )}
            </ul>
          </Card>
          {q.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-line text-sm text-slate-700">{q.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        title={`Email ${q.quoteNumber}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMailOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="quote-mail" loading={busy === 'mail'}>
              Send
            </Button>
          </>
        }
      >
        <form id="quote-mail" onSubmit={submitMail} className="space-y-3">
          <Field label="To">
            <Input type="email" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} required />
          </Field>
          <Field label="Subject" hint="Blank = standard subject">
            <Input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
          </Field>
          <Field label="Message" hint="Blank = standard message with a link for the customer to accept online">
            <Textarea value={mail.message} onChange={(e) => setMail({ ...mail, message: e.target.value })} />
          </Field>
        </form>
      </Modal>
      {confirm.dialog}
    </div>
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
