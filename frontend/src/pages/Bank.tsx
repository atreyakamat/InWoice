import { useState, type ChangeEvent } from 'react';
import { Check, EyeOff, Link2Off, RotateCcw, Upload, Wand2 } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Stat, StatusBadge, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/toast';
import { get, http, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { date, money } from '../lib/format';
import { cn } from '../lib/utils';

interface Suggestion {
  type: 'PAYMENT' | 'BILL_PAYMENT' | 'EXPENSE' | 'INVOICE' | 'BILL';
  id: string;
  label: string;
  amount: number;
  date: string;
}

interface Txn {
  id: string;
  account: string;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
  status: 'UNMATCHED' | 'MATCHED' | 'IGNORED';
  matchType: string | null;
  suggestions: Suggestion[];
}

interface Mapping {
  headerRow: number;
  date: number;
  description: number;
  reference?: number | null;
  debit?: number | null;
  credit?: number | null;
  amount?: number | null;
  balance?: number | null;
  dateOrder: 'DMY' | 'MDY' | 'YMD';
}

interface Preview {
  headers: string[];
  mapping: Mapping | null;
  sample: { date: string; description: string; amount: number }[];
}

const TABS = [
  { label: 'To match', value: 'UNMATCHED' },
  { label: 'Matched', value: 'MATCHED' },
  { label: 'Ignored', value: 'IGNORED' },
  { label: 'All', value: '' },
];

const MATCH_LABEL: Record<string, string> = { PAYMENT: 'Customer payment', BILL_PAYMENT: 'Supplier payment', EXPENSE: 'Expense' };

export default function Bank() {
  const toast = useToast();
  const [status, setStatus] = useState('UNMATCHED');
  const { data, loading, error, reload } = useLoad(async () => {
    const res = await http.get('/bank', { params: { status: status || undefined, limit: 200 } });
    return { rows: res.data.data as Txn[], total: res.data.total as number, summary: res.data.summary as { byStatus: Record<string, { count: number; amount: number }> } };
  }, [status]);
  const [busy, setBusy] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [expenseFor, setExpenseFor] = useState<Txn | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>, message?: string) => {
    setBusy(key);
    try {
      await fn();
      if (message) toast.success(message);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const s = data?.summary.byStatus ?? {};
  return (
    <div>
      <PageHeader
        title="Bank"
        subtitle="Import your bank statement and match each line to payments, bills and expenses."
        actions={
          <>
            <Button variant="secondary" loading={busy === 'auto'} onClick={() => void act('auto', async () => toast.success(`Matched ${(await post<{ matched: number }>('/bank/auto-match')).matched} line(s)`))}>
              <Wand2 size={15} /> Auto-match
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Upload size={15} /> Import statement
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="To match" value={s.UNMATCHED?.count ?? 0} hint={s.UNMATCHED ? `Net ${money(s.UNMATCHED.amount)}` : 'All caught up'} tone={s.UNMATCHED?.count ? 'warn' : 'good'} />
        <Stat label="Matched" value={s.MATCHED?.count ?? 0} />
        <Stat label="Ignored" value={s.IGNORED?.count ?? 0} hint="Transfers, cash withdrawals…" />
      </div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={cn('rounded-md px-3 py-1.5 text-sm font-medium', status === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card bodyClassName="p-0">
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <Spinner />
        ) : !data?.rows.length ? (
          <EmptyState
            title={status === 'UNMATCHED' ? 'Nothing to match' : 'Nothing here'}
            description="Download your statement as CSV from net banking and import it. Payments you've already recorded are matched automatically."
            action={<Button onClick={() => setImportOpen(true)}>Import statement</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th className="text-right">Amount</Th>
                <Th>Match</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((t) => (
                <tr key={t.id} className="align-top">
                  <Td className="whitespace-nowrap">{date(t.date)}</Td>
                  <Td>
                    <div className="max-w-md break-words text-slate-900">{t.description}</div>
                    {t.reference && <div className="text-xs text-slate-500">Ref {t.reference}</div>}
                  </Td>
                  <Td className={cn('whitespace-nowrap text-right font-medium tabular-nums', t.amount > 0 ? 'text-emerald-700' : 'text-slate-800')}>{money(t.amount)}</Td>
                  <Td className="min-w-[16rem]">
                    {t.status === 'MATCHED' ? (
                      <div className="flex items-center gap-2">
                        <StatusBadge status="MATCHED" />
                        <span className="text-xs text-slate-500">{MATCH_LABEL[t.matchType ?? ''] ?? ''}</span>
                        <Button size="sm" variant="ghost" title="Undo match" aria-label="Undo match" loading={busy === `u-${t.id}`} onClick={() => void act(`u-${t.id}`, () => post(`/bank/${t.id}/unmatch`), 'Match undone')}>
                          <Link2Off size={13} />
                        </Button>
                      </div>
                    ) : t.status === 'IGNORED' ? (
                      <Button size="sm" variant="ghost" loading={busy === `r-${t.id}`} onClick={() => void act(`r-${t.id}`, () => post(`/bank/${t.id}/restore`))}>
                        <RotateCcw size={13} /> Restore
                      </Button>
                    ) : (
                      <div className="space-y-1.5">
                        {t.suggestions.map((sg) => (
                          <button
                            key={`${sg.type}-${sg.id}`}
                            onClick={() => void act(`m-${t.id}`, () => post(`/bank/${t.id}/match`, { type: sg.type, id: sg.id }), sg.type === 'INVOICE' || sg.type === 'BILL' ? 'Payment recorded and matched' : 'Matched')}
                            disabled={busy === `m-${t.id}`}
                            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs hover:border-brand-300 hover:bg-brand-50"
                          >
                            <Check size={13} className="shrink-0 text-brand-600" />
                            <span className="flex-1">
                              {sg.type === 'INVOICE' || sg.type === 'BILL' ? 'Record payment: ' : 'Match: '}
                              {sg.label}
                            </span>
                          </button>
                        ))}
                        <div className="flex flex-wrap gap-1">
                          {t.amount < 0 && (
                            <Button size="sm" variant="secondary" onClick={() => setExpenseFor(t)}>
                              Expense…
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" loading={busy === `i-${t.id}`} onClick={() => void act(`i-${t.id}`, () => post(`/bank/${t.id}/ignore`))} title="Not a business transaction (e.g. transfer between your accounts)">
                            <EyeOff size={13} /> Ignore
                          </Button>
                        </div>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={(msg) => {
            setImportOpen(false);
            toast.success(msg);
            void reload();
          }}
        />
      )}
      {expenseFor && (
        <ExpenseModal
          txn={expenseFor}
          onClose={() => setExpenseFor(null)}
          onDone={() => {
            setExpenseFor(null);
            toast.success('Expense recorded and matched');
            void reload();
          }}
        />
      )}
    </div>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [account, setAccount] = useState('Main');
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      setCsv(text);
      const p = (await http.post('/bank/preview', text, { headers: { 'Content-Type': 'text/csv' } })).data.data as Preview;
      setPreview(p);
      setMapping(p.mapping ?? { headerRow: 0, date: 0, description: 1, debit: null, credit: null, amount: null, balance: null, reference: null, dateOrder: 'DMY' });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!mapping) return;
    setBusy(true);
    try {
      const res = await http.post(`/bank/import?account=${encodeURIComponent(account)}&mapping=${encodeURIComponent(JSON.stringify(mapping))}`, csv, { headers: { 'Content-Type': 'text/csv' } });
      const r = res.data.data as { imported: number; duplicates: number; matched: number };
      onDone(`Imported ${r.imported} line(s)${r.duplicates ? `, skipped ${r.duplicates} already imported` : ''}. Matched ${r.matched} automatically.`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const col = (k: keyof Mapping, label: string, optional = true) =>
    mapping && preview ? (
      <Field label={label}>
        <Select
          value={mapping[k] === null || mapping[k] === undefined ? '' : String(mapping[k])}
          onChange={(e) => setMapping({ ...mapping, [k]: e.target.value === '' ? null : Number(e.target.value) })}
        >
          {optional && <option value="">—</option>}
          {preview.headers.map((h, i) => (
            <option key={i} value={i}>
              {h || `Column ${i + 1}`}
            </option>
          ))}
        </Select>
      </Field>
    ) : null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Import bank statement"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void doImport()} loading={busy} disabled={!mapping}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">Download the statement from net banking as CSV (most banks: Statement › Download › CSV or Excel → save as CSV). Lines already imported are skipped.</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e)} aria-label="Statement file" />
        {preview && !preview.mapping && <p className="text-amber-700">Couldn&apos;t recognise the columns. Choose them below.</p>}
        {mapping && preview && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {col('date', 'Date', false)}
              {col('description', 'Description', false)}
              {col('reference', 'Reference')}
              {col('debit', 'Money out (debit)')}
              {col('credit', 'Money in (credit)')}
              {col('amount', 'Or: one amount column')}
              {col('balance', 'Balance')}
              <Field label="Dates look like">
                <Select value={mapping.dateOrder} onChange={(e) => setMapping({ ...mapping, dateOrder: e.target.value as Mapping['dateOrder'] })}>
                  <option value="DMY">31/12/2026</option>
                  <option value="MDY">12/31/2026</option>
                  <option value="YMD">2026-12-31</option>
                </Select>
              </Field>
              <Field label="Account name" hint="If you have more than one">
                <Input value={account} onChange={(e) => setAccount(e.target.value)} />
              </Field>
            </div>
            {preview.sample.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-slate-700">First lines as read:</p>
                <ul className="space-y-0.5 text-xs text-slate-600">
                  {preview.sample.slice(0, 5).map((l, i) => (
                    <li key={i}>
                      {date(l.date)} · {l.description} · <span className={l.amount > 0 ? 'text-emerald-700' : ''}>{money(l.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ExpenseModal({ txn, onClose, onDone }: { txn: Txn; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const categories = useLoad(() => get<string[]>('/expenses/categories'));
  const [form, setForm] = useState({ category: /charge|fee/i.test(txn.description) ? 'Bank & payment charges' : '', description: txn.description.slice(0, 120), taxRate: '0' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.category.trim()) return toast.error('Pick a category');
    setSaving(true);
    try {
      await post(`/bank/${txn.id}/expense`, { ...form, taxRate: Number(form.taxRate) });
      onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Expense of ${money(-txn.amount)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Record expense
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Category">
          <Input list="bank-expense-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <datalist id="bank-expense-categories">
            {(categories.data ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="GST included" hint="e.g. 18% on bank charges">
          <Select value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })}>
            {['0', '5', '12', '18', '28'].map((r) => (
              <option key={r} value={r}>
                {r === '0' ? 'No GST' : `${r}%`}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-slate-500">Paid by bank transfer on {date(txn.date)}.</p>
      </div>
    </Modal>
  );
}
