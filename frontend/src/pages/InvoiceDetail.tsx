import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  BellRing,
  Copy,
  Download,
  Eye,
  IndianRupee,
  Mail,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  Truck,
  Undo2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  StatusBadge,
  Table,
  Td,
  Th,
  useConfirm,
} from '../components/ui';
import { useToast } from '../components/toast';
import { CreditNoteModal, CreditNotesCard } from '../components/CreditNotes';
import { del, downloadFile, get, http, openPdf, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { MailComposer } from '../components/MailComposer';
import { OnlinePaymentCard } from '../components/OnlinePaymentCard';
import { qtyText, unitLabel, unitOf } from '../lib/units';
import { useAuth } from '../context/AuthContext';
import { date, isoDate, money, titleCase } from '../lib/format';
import type { Invoice } from '../lib/types';

const METHODS = ['UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'OTHER'];

export default function InvoiceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: inv, setData, loading, error, reload } = useLoad(() => get<Invoice>(`/invoices/${id}`), [id]);

  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: '', tdsAmount: '', paymentMethod: 'UPI', paymentDate: isoDate(new Date()), referenceId: '', notes: '' });
  const [mailOpen, setMailOpen] = useState(false);
  const { settings } = useAuth();
  const [cnOpen, setCnOpen] = useState(false);

  if (loading && !inv) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!inv) return null;

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

  const isDraft = inv.status === 'DRAFT';
  const isCancelled = inv.status === 'CANCELLED';
  const canPay = !isCancelled && inv.balanceDue > 0;
  const activeCredits = (inv.creditNotes ?? []).filter((c) => c.status === 'ISSUED').length;
  const canCredit = !isDraft && !isCancelled && inv.amountCredited < inv.grandTotal - 0.005;

  const issue = () =>
    run('issue', async () => {
      setData(await post<Invoice>(`/invoices/${id}/issue`));
      toast.success('Invoice issued');
    });

  const duplicate = () =>
    run('duplicate', async () => {
      const copy = await post<Invoice>(`/invoices/${id}/duplicate`);
      toast.success(`Draft ${copy.invoiceNumber} created`);
      navigate(`/invoices/${copy.id}`);
    });

  const cancel = async () => {
    const ok = await confirm({
      title: `Cancel ${inv.invoiceNumber}?`,
      message: 'The invoice will be marked cancelled and any reserved stock returned. This cannot be undone.',
      confirmLabel: 'Cancel invoice',
      danger: true,
    });
    if (!ok) return;
    await run('cancel', async () => {
      setData(await post<Invoice>(`/invoices/${id}/cancel`));
      toast.success('Invoice cancelled');
    });
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Delete this draft?', message: 'The draft will be permanently deleted.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await run('delete', async () => {
      await del(`/invoices/${id}`);
      toast.success('Draft deleted');
      navigate('/invoices');
    });
  };

  const canRemind = (inv.status === 'PENDING' || inv.status === 'PARTIAL') && inv.balanceDue > 0;
  const remind = () =>
    run('remind', async () => {
      const res = await http.post(`/invoices/${id}/remind`, {});
      toast.success(res.data.message ?? 'Reminder sent');
      await reload();
    });

  const whatsapp = () =>
    run('whatsapp', async () => {
      const res = await get<{ url: string }>(`/invoices/${id}/whatsapp`);
      window.open(res.url, '_blank', 'noopener');
    });

  const openPay = () => {
    setPay({ amount: String(inv.balanceDue), tdsAmount: '', paymentMethod: 'UPI', paymentDate: isoDate(new Date()), referenceId: '', notes: '' });
    setPayOpen(true);
  };

  const submitPay = (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(pay.amount);
    if (!(amount > 0)) return toast.error('Enter an amount above 0');
    void run('pay', async () => {
      setData(
        await post<Invoice>(`/invoices/${id}/payments`, {
          amount,
          tdsAmount: Number(pay.tdsAmount) || 0,
          paymentMethod: pay.paymentMethod,
          paymentDate: pay.paymentDate || null,
          referenceId: pay.referenceId || null,
          notes: pay.notes || null,
        }),
      );
      setPayOpen(false);
      toast.success('Payment recorded');
    });
  };

  const deletePayment = async (paymentId: string, amount: number) => {
    const ok = await confirm({ title: 'Delete payment?', message: `Remove the ${money(amount)} payment from this invoice?`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await run(`delpay-${paymentId}`, async () => {
      setData(await (await http.delete(`/invoices/${id}/payments/${paymentId}`)).data.data);
      toast.success('Payment removed');
    });
  };


  return (
    <div>
      <Link to="/invoices" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Invoices
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{inv.invoiceNumber}</h1>
            <StatusBadge status={inv.displayStatus} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <Link to={`/customers/${inv.customerId}`} className="font-medium text-brand-600 hover:underline">
              {inv.customer.name}
            </Link>{' '}
            · Issued {date(inv.date)} · Due {date(inv.dueDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <Button variant="secondary" onClick={() => navigate(`/invoices/${id}/edit`)}>
                <Pencil size={15} /> Edit
              </Button>
              <Button onClick={issue} loading={busy === 'issue'}>
                <Send size={15} /> Issue
              </Button>
            </>
          )}
          {canPay && (
            <Button onClick={openPay}>
              <IndianRupee size={15} /> Record payment
            </Button>
          )}
          <Button variant="secondary" onClick={() => run('pdf', () => openPdf(`/invoices/${id}/pdf`))} loading={busy === 'pdf'}>
            <Eye size={15} /> View PDF
          </Button>
          <Button
            variant="secondary"
            onClick={() => run('download', () => downloadFile(`/invoices/${id}/pdf?download=1`, `${inv.invoiceNumber}.pdf`))}
            loading={busy === 'download'}
          >
            <Download size={15} /> Download
          </Button>
          {!isCancelled && (
            <>
              <Button variant="secondary" onClick={() => setMailOpen(true)}>
                <Mail size={15} /> Email
              </Button>
              <Button variant="secondary" onClick={whatsapp} loading={busy === 'whatsapp'}>
                <MessageCircle size={15} /> WhatsApp
              </Button>
              {canRemind && inv.customer.email && (
                <Button variant="secondary" onClick={remind} loading={busy === 'remind'} title={`Email a payment reminder to ${inv.customer.email}`}>
                  <BellRing size={15} /> Send reminder
                </Button>
              )}
            </>
          )}
          <Button variant="secondary" onClick={duplicate} loading={busy === 'duplicate'}>
            <Copy size={15} /> Duplicate
          </Button>
          {canCredit && (
            <Button variant="secondary" onClick={() => setCnOpen(true)}>
              <Undo2 size={15} /> Credit note
            </Button>
          )}
          {!isDraft && !isCancelled && inv.amountPaid === 0 && activeCredits === 0 && (
            <Button variant="ghost" onClick={cancel} loading={busy === 'cancel'} className="text-red-600 hover:bg-red-50">
              <Ban size={15} /> Cancel
            </Button>
          )}
          {isDraft && (
            <Button variant="ghost" onClick={remove} loading={busy === 'delete'} className="text-red-600 hover:bg-red-50">
              <Trash2 size={15} /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Items" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>HSN</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Tax</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(inv.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <Td className="font-medium text-slate-900">
                      {item.name}
                      {item.type === 'PACK' && (
                        <span className="ml-2">
                          <Badge tone="indigo">Pack</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="text-slate-500">{item.hsnCode ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {qtyText(item.quantity, item.unit)}
                      {item.details && <div className="text-xs font-normal text-slate-500">{item.details}</div>}
                      {item.minCharge && <div className="text-xs font-normal text-amber-700">Minimum charge</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {money(item.unitPrice)}
                      {unitOf(item.unit) !== 'pcs' && <span className="text-xs text-slate-500">/{unitLabel(item.unit)}</span>}
                    </Td>
                    <Td className="text-right tabular-nums">{item.taxRate}%</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{money(item.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card
            title="Payments"
            actions={
              canPay ? (
                <Button size="sm" variant="secondary" onClick={openPay}>
                  Record payment
                </Button>
              ) : undefined
            }
            bodyClassName="p-0"
          >
            {!inv.payments?.length ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No payments recorded yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Method</Th>
                    <Th>Reference</Th>
                    <Th className="text-right">Amount</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inv.payments.map((p) => (
                    <tr key={p.id}>
                      <Td className="whitespace-nowrap">{date(p.paymentDate)}</Td>
                      <Td>{p.paymentMethod === 'UPI' ? 'UPI' : titleCase(p.paymentMethod)}</Td>
                      <Td className="text-slate-500">{p.referenceId ?? p.notes ?? '—'}</Td>
                      <Td className="whitespace-nowrap text-right font-medium tabular-nums text-emerald-700">
                        {money(p.amount)}
                        {p.tdsAmount > 0 && <div className="text-xs font-normal text-slate-500">incl. TDS {money(p.tdsAmount)}</div>}
                      </Td>
                      <Td className="text-right">
                        <button
                          onClick={() => deletePayment(p.id, p.amount)}
                          disabled={busy === `delpay-${p.id}`}
                          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          aria-label="Delete payment"
                          title="Delete payment"
                        >
                          <Trash2 size={15} />
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <CreditNotesCard inv={inv} onChanged={setData} />

          {inv.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{inv.notes}</p>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Summary">
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={money(inv.subtotal)} />
              {inv.discount > 0 && <Row label="Discount" value={`− ${money(inv.discount)}`} />}
              {inv.igst > 0 && <Row label="IGST" value={money(inv.igst)} />}
              {inv.cgst > 0 && <Row label="CGST" value={money(inv.cgst)} />}
              {inv.sgst > 0 && <Row label="SGST" value={money(inv.sgst)} />}
              {inv.shippingCost > 0 && <Row label="Shipping" value={money(inv.shippingCost)} />}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(inv.grandTotal)}</dd>
              </div>
              {inv.amountCredited > 0 && <Row label="Credit notes" value={<span className="text-emerald-700">− {money(inv.amountCredited)}</span>} />}
              <Row label="Paid" value={<span className="text-emerald-700">{money(inv.amountPaid)}</span>} />
              {!isCancelled && (
                <div className="flex justify-between font-semibold">
                  <dt>Balance due</dt>
                  <dd className={inv.balanceDue > 0 ? 'tabular-nums text-brand-700' : 'tabular-nums text-emerald-700'}>{money(inv.balanceDue)}</dd>
                </div>
              )}
            </dl>
            {inv.placeOfSupply && <p className="mt-3 text-xs text-slate-500">Place of supply: {inv.placeOfSupply}</p>}
            {inv.lastReminderAt && (
              <p className="mt-1 text-xs text-slate-500">
                Last reminder emailed {date(inv.lastReminderAt)}
                {inv.remindersSent > 0 ? ` · ${inv.remindersSent} automatic step${inv.remindersSent === 1 ? '' : 's'} done` : ''}
              </p>
            )}
          </Card>

          {settings?.youpiEnabled && !isDraft && <OnlinePaymentCard inv={inv} onPaid={setData} />}

          <Card title="Customer">
            <div className="text-sm">
              <Link to={`/customers/${inv.customerId}`} className="font-medium text-brand-600 hover:underline">
                {inv.customer.name}
              </Link>
              {inv.customer.email && <div className="text-slate-600">{inv.customer.email}</div>}
              {inv.customer.phone && <div className="text-slate-600">{inv.customer.phone}</div>}
              {(inv.customer.city || inv.customer.state) && (
                <div className="text-slate-500">{[inv.customer.city, inv.customer.state].filter(Boolean).join(', ')}</div>
              )}
              {inv.customer.gstin && <div className="mt-1 font-mono text-xs text-slate-500">GSTIN {inv.customer.gstin}</div>}
            </div>
          </Card>

          <Card title="Fulfillment">
            {inv.fulfillment ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Truck size={16} className="text-slate-400" />
                  <StatusBadge status={inv.fulfillment.status} />
                  {inv.fulfillment.courier && <span className="text-slate-500">{inv.fulfillment.courier}</span>}
                </div>
                <Link to="/fulfillment" className="font-medium text-brand-600 hover:underline">
                  Manage
                </Link>
              </div>
            ) : (
              <p className="text-sm text-slate-500">{isDraft ? 'A fulfillment order is created when the invoice is issued.' : 'No fulfillment record.'}</p>
            )}
            {inv.fulfillment?.trackingNumber && <p className="mt-2 text-xs text-slate-500">Tracking: {inv.fulfillment.trackingNumber}</p>}
          </Card>
        </div>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record payment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="pay-form" loading={busy === 'pay'}>
              Save payment
            </Button>
          </>
        }
      >
        <form id="pay-form" onSubmit={submitPay} className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount settled *" hint={`Balance due: ${money(inv.balanceDue)}`}>
            <Input type="number" min={0.01} step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} autoFocus required />
          </Field>
          <Field
            label="TDS deducted by customer"
            hint={Number(pay.tdsAmount) > 0 ? `Cash received: ${money((Number(pay.amount) || 0) - Number(pay.tdsAmount))}` : 'Leave blank if none'}
          >
            <Input type="number" min={0} step="0.01" value={pay.tdsAmount} onChange={(e) => setPay({ ...pay, tdsAmount: e.target.value })} aria-label="TDS deducted" />
          </Field>
          <Field label="Method">
            <Select value={pay.paymentMethod} onChange={(e) => setPay({ ...pay, paymentMethod: e.target.value })}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m === 'UPI' ? 'UPI' : titleCase(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} />
          </Field>
          <Field label="Reference" hint="UTR / transaction ID">
            <Input value={pay.referenceId} onChange={(e) => setPay({ ...pay, referenceId: e.target.value })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
          </Field>
        </form>
      </Modal>

      <MailComposer open={mailOpen} onClose={() => setMailOpen(false)} kind="invoices" id={id!} onDone={reload} />
      {cnOpen && <CreditNoteModal inv={inv} open={cnOpen} onClose={() => setCnOpen(false)} onSaved={setData} />}
      {confirm.dialog}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}
