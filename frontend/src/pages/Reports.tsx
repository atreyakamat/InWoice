import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Download, FileSpreadsheet } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, PageHeader, Spinner, Stat, Table, Td, Th } from '../components/ui';
import { usePeriod } from '../components/PeriodPicker';
import { useToast } from '../components/toast';
import { downloadFile, get } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { money } from '../lib/format';
import { cn } from '../lib/utils';

interface Split {
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  rate: number;
}

interface GstReport {
  period: { label: string };
  business: { name: string; gstin: string | null; state: string };
  summary: {
    invoices: number;
    creditNotes: number;
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
    totalTax: number;
    b2bTaxable: number;
    b2cTaxable: number;
  };
  b2b: (Split & { gstin: string; receiverName: string; invoiceNumber: string; invoiceDate: string; invoiceValue: number; placeOfSupply: string })[];
  b2cl: (Split & { invoiceNumber: string; invoiceDate: string; invoiceValue: number; placeOfSupply: string })[];
  b2cs: (Split & { placeOfSupply: string })[];
  cdnr: (Split & { gstin: string; receiverName: string; noteNumber: string; noteDate: string; noteValue: number; invoiceNumber: string })[];
  cdnur: (Split & { noteNumber: string; noteDate: string; noteValue: number; invoiceNumber: string; placeOfSupply: string })[];
  hsn: (Split & { hsn: string; description: string; quantity: number; totalValue: number; supplyType: 'B2B' | 'B2C' })[];
  docs: { nature: string; from: string; to: string; total: number; cancelled: number }[];
  warnings: string[];
}

type Tab = 'b2b' | 'b2cl' | 'b2cs' | 'notes' | 'hsn' | 'docs';

export default function Reports() {
  const toast = useToast();
  const { params, query, month, picker } = usePeriod();
  const [tab, setTab] = useState<Tab>('b2b');
  const [downloading, setDownloading] = useState<string | null>(null);
  const { data: r, loading, error, reload } = useLoad(() => get<GstReport>('/reports/gst', params), [query]);

  const download = async (key: string, url: string, name: string) => {
    setDownloading(key);
    try {
      await downloadFile(`${url}?${query}`, `${name}-${r?.period.label.replace(/\s+/g, '') ?? month}.csv`);
    } catch (err) {
      toast.error(err);
    } finally {
      setDownloading(null);
    }
  };
  const csvButton = (section: string, label = 'CSV') => (
    <Button size="sm" variant="secondary" onClick={() => download(section, `/reports/gst/csv/${section}`, `gstr1-${section}`)} loading={downloading === section}>
      <Download size={14} /> {label}
    </Button>
  );

  const tabs: { key: Tab; label: string; count?: number }[] = r
    ? [
        { key: 'b2b', label: 'B2B', count: r.b2b.length },
        { key: 'b2cl', label: 'B2C large', count: r.b2cl.length },
        { key: 'b2cs', label: 'B2C small', count: r.b2cs.length },
        { key: 'notes', label: 'Credit notes', count: r.cdnr.length + r.cdnur.length },
        { key: 'hsn', label: 'HSN summary', count: r.hsn.length },
        { key: 'docs', label: 'Documents', count: r.docs.length },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="GST reports"
        subtitle={<>GSTR-1 data for the period, ready for your accountant or the GST offline tool. GSTR-3B is under <Link to="/accounts" className="underline">Accounts</Link>.</>}
        actions={
          <>
            {params.month && (
              <Button
                variant="secondary"
                loading={downloading === 'json'}
                title="GSTR-1 JSON for the GST offline tool: import it there to check, then upload"
                onClick={async () => {
                  setDownloading('json');
                  try {
                    await downloadFile(`/reports/gst/json?month=${params.month}`, `GSTR1_${params.month}.json`);
                  } catch (err) {
                    toast.error(err);
                  } finally {
                    setDownloading(null);
                  }
                }}
              >
                <Download size={15} /> GSTR-1 JSON
              </Button>
            )}
            <Button variant="secondary" onClick={() => download('register', '/reports/sales-register', 'sales-register')} loading={downloading === 'register'}>
              <FileSpreadsheet size={15} /> Sales register
            </Button>
          </>
        }
      />

      <div className="mb-5">{picker}</div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !r ? (
        <Spinner />
      ) : (
        <div className={cn('space-y-5', loading && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Taxable value" value={money(r.summary.taxableValue, { decimals: 0 })} hint={`B2B ${money(r.summary.b2bTaxable, { decimals: 0 })} · B2C ${money(r.summary.b2cTaxable, { decimals: 0 })}`} />
            <Stat
              label="Output tax"
              value={money(r.summary.totalTax, { decimals: 0 })}
              hint={`IGST ${money(r.summary.igst, { decimals: 0 })} · CGST ${money(r.summary.cgst, { decimals: 0 })} · SGST ${money(r.summary.sgst, { decimals: 0 })}`}
            />
            <Stat label="Invoices" value={r.summary.invoices} hint="Issued in the period (not cancelled)" />
            <Stat label="Credit notes" value={r.summary.creditNotes} hint="Netted off the totals" />
          </div>

          {r.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {r.warnings.map((w) => (
                <p key={w} className="flex gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium', tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
              >
                {t.label} <span className="text-slate-400">{t.count}</span>
              </button>
            ))}
          </div>

          {tab === 'b2b' && (
            <Section title="B2B invoices (registered buyers)" actions={csvButton('b2b')} empty={!r.b2b.length}>
              <Table>
                <thead>
                  <tr>
                    <Th>GSTIN</Th>
                    <Th>Buyer</Th>
                    <Th>Invoice</Th>
                    <Th>Place of supply</Th>
                    <Th className="text-right">Rate</Th>
                    <Th className="text-right">Taxable</Th>
                    <Th className="text-right">Tax</Th>
                    <Th className="text-right">Invoice value</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.b2b.map((x) => (
                    <tr key={`${x.invoiceNumber}-${x.rate}`}>
                      <Td className="font-mono text-xs">{x.gstin}</Td>
                      <Td>{x.receiverName}</Td>
                      <Td className="whitespace-nowrap">
                        {x.invoiceNumber}
                        <div className="text-xs text-slate-500">{x.invoiceDate}</div>
                      </Td>
                      <Td className="text-slate-600">{x.placeOfSupply}</Td>
                      <Td className="text-right tabular-nums">{x.rate}%</Td>
                      <Money v={x.taxable} />
                      <Money v={x.igst + x.cgst + x.sgst} />
                      <Money v={x.invoiceValue} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}

          {tab === 'b2cl' && (
            <Section title="B2C large: inter-state invoices above ₹1,00,000 to unregistered buyers" actions={csvButton('b2cl')} empty={!r.b2cl.length}>
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Place of supply</Th>
                    <Th className="text-right">Rate</Th>
                    <Th className="text-right">Taxable</Th>
                    <Th className="text-right">IGST</Th>
                    <Th className="text-right">Invoice value</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.b2cl.map((x) => (
                    <tr key={`${x.invoiceNumber}-${x.rate}`}>
                      <Td className="whitespace-nowrap">
                        {x.invoiceNumber}
                        <div className="text-xs text-slate-500">{x.invoiceDate}</div>
                      </Td>
                      <Td className="text-slate-600">{x.placeOfSupply}</Td>
                      <Td className="text-right tabular-nums">{x.rate}%</Td>
                      <Money v={x.taxable} />
                      <Money v={x.igst} />
                      <Money v={x.invoiceValue} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}

          {tab === 'b2cs' && (
            <Section title="B2C small: other sales to unregistered buyers, by state and rate (net of their credit notes)" actions={csvButton('b2cs')} empty={!r.b2cs.length}>
              <Table>
                <thead>
                  <tr>
                    <Th>Place of supply</Th>
                    <Th className="text-right">Rate</Th>
                    <Th className="text-right">Taxable</Th>
                    <Th className="text-right">IGST</Th>
                    <Th className="text-right">CGST</Th>
                    <Th className="text-right">SGST</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.b2cs.map((x) => (
                    <tr key={`${x.placeOfSupply}-${x.rate}`}>
                      <Td>{x.placeOfSupply || <span className="text-amber-700">Unknown state</span>}</Td>
                      <Td className="text-right tabular-nums">{x.rate}%</Td>
                      <Money v={x.taxable} />
                      <Money v={x.igst} />
                      <Money v={x.cgst} />
                      <Money v={x.sgst} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}

          {tab === 'notes' && (
            <Section
              title="Credit notes"
              actions={
                <>
                  {csvButton('cdnr', 'Registered (CDNR)')}
                  {csvButton('cdnur', 'Unregistered (CDNUR)')}
                </>
              }
              empty={!r.cdnr.length && !r.cdnur.length}
              emptyText="No credit notes to registered buyers or against B2C large invoices. Credit notes on small B2C sales are already netted into B2C small."
            >
              <Table>
                <thead>
                  <tr>
                    <Th>Note</Th>
                    <Th>Buyer</Th>
                    <Th>Against invoice</Th>
                    <Th className="text-right">Rate</Th>
                    <Th className="text-right">Taxable</Th>
                    <Th className="text-right">Tax</Th>
                    <Th className="text-right">Note value</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...r.cdnr.map((x) => ({ ...x, buyer: `${x.receiverName} (${x.gstin})` })), ...r.cdnur.map((x) => ({ ...x, buyer: `Unregistered · ${x.placeOfSupply}` }))].map((x) => (
                    <tr key={`${x.noteNumber}-${x.rate}`}>
                      <Td className="whitespace-nowrap">
                        {x.noteNumber}
                        <div className="text-xs text-slate-500">{x.noteDate}</div>
                      </Td>
                      <Td>{x.buyer}</Td>
                      <Td>{x.invoiceNumber}</Td>
                      <Td className="text-right tabular-nums">{x.rate}%</Td>
                      <Money v={x.taxable} />
                      <Money v={x.igst + x.cgst + x.sgst} />
                      <Money v={x.noteValue} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}

          {tab === 'hsn' && (
            <Section title="HSN-wise summary (net of credit notes)" actions={csvButton('hsn')} empty={!r.hsn.length}>
              <Table>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th>HSN</Th>
                    <Th>Description</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Rate</Th>
                    <Th className="text-right">Taxable</Th>
                    <Th className="text-right">IGST</Th>
                    <Th className="text-right">CGST</Th>
                    <Th className="text-right">SGST</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.hsn.map((x) => (
                    <tr key={`${x.supplyType}-${x.hsn}-${x.rate}`}>
                      <Td>{x.supplyType}</Td>
                      <Td className={cn('font-mono text-xs', x.hsn === 'NA' && 'text-amber-700')}>{x.hsn}</Td>
                      <Td className="text-slate-600">{x.description}</Td>
                      <Td className="text-right tabular-nums">{x.quantity}</Td>
                      <Td className="text-right tabular-nums">{x.rate}%</Td>
                      <Money v={x.taxable} />
                      <Money v={x.igst} />
                      <Money v={x.cgst} />
                      <Money v={x.sgst} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}

          {tab === 'docs' && (
            <Section title="Documents issued" actions={csvButton('docs')} empty={!r.docs.length}>
              <Table>
                <thead>
                  <tr>
                    <Th>Document</Th>
                    <Th>From</Th>
                    <Th>To</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Cancelled</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.docs.map((d) => (
                    <tr key={d.nature}>
                      <Td>{d.nature}</Td>
                      <Td>{d.from}</Td>
                      <Td>{d.to}</Td>
                      <Td className="text-right tabular-nums">{d.total}</Td>
                      <Td className="text-right tabular-nums">{d.cancelled}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}

          <p className="text-xs text-slate-500">
            CSV columns follow the GST offline tool templates. Shipping charges are part of the invoice value but are not taxed by InWoice. Have your
            accountant review the figures before filing.
          </p>
        </div>
      )}
    </div>
  );
}

function Money({ v }: { v: number }) {
  return <Td className="whitespace-nowrap text-right tabular-nums">{money(v)}</Td>;
}

function Section({ title, actions, empty, emptyText, children }: { title: string; actions: ReactNode; empty: boolean; emptyText?: string; children: ReactNode }) {
  return (
    <Card title={title} actions={<div className="flex flex-wrap gap-2">{actions}</div>} bodyClassName="p-0">
      {empty ? <EmptyState title="Nothing in this section for the period" description={emptyText} /> : children}
    </Card>
  );
}
