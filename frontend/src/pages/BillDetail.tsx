import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, IndianRupee, Pencil, Trash2, Undo2 } from 'lucide-react';
import { Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Td, Textarea, Th, useConfirm } from '../components/ui';
import { useToast } from '../components/toast';
import { get, http, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, isoDate, money, num, titleCase } from '../lib/format';
import type { Bill } from '../lib/types';
import { DebitNoteModal, DebitNotesCard } from '../components/DebitNotes';

const METHODS = ['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD', 'OTHER'];
const methodLabel = (m: string) => (m === 'UPI' ? 'UPI' : titleCase(m));

export default function BillDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: bill, setData, loading, error, reload } = useLoad(() => get<Bill>(`/bills/${id}`), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [dnOpen, setDnOpen] = useState(false);
  const [pay, setPay] = useState({ amount: '', tdsAmount: '', tdsSection: '194C', paymentMethod: 'BANK_TRANSFER', paymentDate: isoDate(new Date()), referenceId: '', notes: '' });

  if (loading && !bill) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!bill) return null;

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

  const openPay = () => {
    setPay({ amount: String(bill.balanceDue), tdsAmount: '', tdsSection: '194C', paymentMethod: 'BANK_TRANSFER', paymentDate: isoDate(new Date()), referenceId: '', notes: '' });
    setPayOpen(true);
  };

  const savePayment = () =>
    run('pay', async () => {
      const amount = Number(pay.amount);
      if (!(amount > 0)) throw new Error('Enter an amount above zero');
      setData(await post<Bill>(`/bills/${id}/payments`, { ...pay, amount, tdsAmount: Number(pay.tdsAmount) || 0, paymentDate: pay.paymentDate || null }));
      setPayOpen(false);
      toast.success('Payment recorded');
    });

  const deletePayment = async (paymentId: string, amount: number) => {
    if (!(await confirm({ title: 'Delete payment?', message: `Remove the ${money(amount)} payment from this bill?`, confirmLabel: 'Delete', danger: true }))) return;
    await run(`del-${paymentId}`, async () => {
      setData((await http.delete(`/bills/${id}/payments/${paymentId}`)).data.data);
      toast.success('Payment removed');
    });
  };

  const cancel = async () => {
    const ok = await confirm({
      title: `Cancel bill ${bill.billNumber}?`,
      message: bill.addToStock ? 'The materials this bill added to stock will be taken out again.' : 'It will no longer count towards what you owe, your costs or GST credit.',
      confirmLabel: 'Cancel bill',
      danger: true,
    });
    if (!ok) return;
    await run('cancel', async () => {
      setData(await post<Bill>(`/bills/${id}/cancel`));
      toast.success('Bill cancelled');
    });
  };

  const open = bill.status === 'PENDING' || bill.status === 'PARTIAL';
  const editable = bill.status !== 'CANCELLED' && bill.amountPaid === 0 && bill.amountDebited === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Bill ${bill.billNumber}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={bill.displayStatus} />
            <span>
              from{' '}
              <Link to="/suppliers" className="font-medium text-slate-700 hover:underline">
                {bill.supplier.name}
              </Link>
            </span>
            {bill.purchaseOrder && <span>· {bill.purchaseOrder.poNumber}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/bills')}>
              <ArrowLeft size={15} /> Bills
            </Button>
            {open && (
              <Button onClick={openPay}>
                <IndianRupee size={15} /> Record payment
              </Button>
            )}
            {bill.status !== 'CANCELLED' && (
              <Button variant="secondary" onClick={() => setDnOpen(true)}>
                <Undo2 size={15} /> Debit note
              </Button>
            )}
            {editable && (
              <Link to={`/bills/${bill.id}/edit`}>
                <Button variant="secondary">
                  <Pencil size={15} /> Edit
                </Button>
              </Link>
            )}
            {editable && (
              <Button variant="ghost" onClick={cancel} loading={busy === 'cancel'} className="hover:text-red-600">
                <Ban size={15} /> Cancel bill
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Lines" className="lg:col-span-2" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">GST</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(bill.items ?? []).map((i) => (
                <tr key={i.id}>
                  <Td>
                    <div className="font-medium text-slate-900">{i.description}</div>
                    {i.inventoryItem && <div className="text-xs text-slate-500">Material · {i.inventoryItem.unit}</div>}
                  </Td>
                  <Td className="text-slate-600">{i.category}</Td>
                  <Td className="text-right tabular-nums">{num(i.quantity)}</Td>
                  <Td className="text-right tabular-nums">{money(i.unitPrice)}</Td>
                  <Td className="text-right tabular-nums">{i.taxRate}%</Td>
                  <Td className="text-right tabular-nums">{money(i.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Summary">
          <dl className="space-y-2 text-sm">
            <Row label="Bill date" value={date(bill.date)} />
            <Row label="Due date" value={date(bill.dueDate)} tone={bill.displayStatus === 'OVERDUE' ? 'bad' : undefined} />
            <Row label="Subtotal" value={money(bill.subtotal)} />
            {bill.discount > 0 && <Row label="Discount" value={`-${money(bill.discount)}`} />}
            {bill.igst > 0 && <Row label="IGST" value={money(bill.igst)} />}
            {bill.cgst > 0 && <Row label="CGST" value={money(bill.cgst)} />}
            {bill.sgst > 0 && <Row label="SGST" value={money(bill.sgst)} />}
            {bill.shippingCost > 0 && <Row label="Freight" value={money(bill.shippingCost)} />}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span className="tabular-nums">{money(bill.grandTotal)}</span>
            </div>
            {bill.amountDebited > 0 && <Row label="Debit notes" value={`- ${money(bill.amountDebited)}`} />}
            <Row label="Paid" value={money(bill.amountPaid)} />
            {bill.status !== 'CANCELLED' && <Row label="Balance due" value={money(bill.balanceDue)} tone={bill.balanceDue > 0 ? 'bad' : 'good'} strong />}
            {bill.taxAmount > 0 && (
              <p className="pt-2 text-xs text-slate-500">
                {bill.itcEligible ? `GST of ${money(bill.taxAmount)} counts as input tax credit in GSTR-3B.` : `GST of ${money(bill.taxAmount)} is not claimable, so it is part of the cost.`}
              </p>
            )}
            {bill.addToStock && <p className="text-xs text-slate-500">Material lines were added to stock.</p>}
          </dl>
        </Card>
      </div>

      <Card title="Payments to the supplier" bodyClassName="p-0">
        {!bill.payments?.length ? (
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
              {bill.payments.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{date(p.paymentDate)}</Td>
                  <Td>{methodLabel(p.paymentMethod)}</Td>
                  <Td className="text-slate-500">{p.referenceId ?? '—'}</Td>
                  <Td className="text-right tabular-nums">
                    {money(p.amount)}
                    {p.tdsAmount > 0 && (
                      <div className="text-xs text-slate-500">
                        incl. TDS {money(p.tdsAmount)}
                        {p.tdsSection ? ` (${p.tdsSection})` : ''}
                      </div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => deletePayment(p.id, p.amount)} loading={busy === `del-${p.id}`} aria-label="Delete payment" title="Delete payment" className="hover:text-red-600">
                      <Trash2 size={14} />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <DebitNotesCard bill={bill} onChanged={() => void reload()} />

      {bill.notes && (
        <Card title="Notes">
          <p className="whitespace-pre-line text-sm text-slate-700">{bill.notes}</p>
        </Card>
      )}

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record payment to supplier"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePayment} loading={busy === 'pay'}>
              Save payment
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount settled" hint={`Balance due ${money(bill.balanceDue)}`}>
            <Input type="number" min="0" step="any" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} aria-label="Payment amount" autoFocus />
          </Field>
          <Field label="TDS you deducted" hint={Number(pay.tdsAmount) > 0 ? `You pay ${money((Number(pay.amount) || 0) - Number(pay.tdsAmount))} now` : 'Leave blank if none'}>
            <Input type="number" min="0" step="any" value={pay.tdsAmount} onChange={(e) => setPay({ ...pay, tdsAmount: e.target.value })} aria-label="TDS deducted" />
          </Field>
          {Number(pay.tdsAmount) > 0 && (
            <Field label="TDS section">
              <Select value={pay.tdsSection} onChange={(e) => setPay({ ...pay, tdsSection: e.target.value })}>
                {['194C', '194J', '194H', '194I', '194Q', '194O', 'Other'].map((sct) => (
                  <option key={sct} value={sct}>
                    {sct}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Method">
            <Select value={pay.paymentMethod} onChange={(e) => setPay({ ...pay, paymentMethod: e.target.value })}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} />
          </Field>
          <Field label="Reference" hint="UTR, cheque no.">
            <Input value={pay.referenceId} onChange={(e) => setPay({ ...pay, referenceId: e.target.value })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>
      <DebitNoteModal
        bill={bill}
        open={dnOpen}
        onClose={() => setDnOpen(false)}
        onSaved={() => {
          setDnOpen(false);
          void reload();
        }}
      />
      {confirm.dialog}
    </div>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: 'good' | 'bad'; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''} ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</dd>
    </div>
  );
}
