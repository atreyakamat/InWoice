import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, CheckCircle2, CreditCard, Globe, Minus, Plus, Printer, QrCode, Search, Trash2, UserRound, Wallet } from 'lucide-react';
import { Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { useToast } from '../components/toast';
import { get, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { money } from '../lib/format';
import { lineAmount, previewDocument } from '../lib/docmath';
import { useAuth } from '../context/AuthContext';
import type { Invoice } from '../lib/types';
import { SizeCalculator } from '../components/SizeCalculator';
import { UNITS, UNIT_KEYS, isArea, qtyText, unitLabel, unitOf, type Unit } from '../lib/units';

interface CatalogItem {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  price: number;
  unit?: string;
  minCharge?: number | null;
  taxRate: number | null;
  stock?: number;
}
interface Catalog {
  products: CatalogItem[];
  packs: CatalogItem[];
  defaultTaxRate: number;
  upiId: string | null;
  online: boolean;
}
interface CartLine {
  key: string;
  type: 'PRODUCT' | 'PACK' | 'CUSTOM';
  itemId?: string;
  name: string;
  price: number;
  taxRate: number;
  quantity: number;
  unit: Unit;
  details?: string;
  minCharge?: number | null;
  stock?: number;
}
interface Summary {
  sales: number;
  total: number;
  unpaid: number;
  byMethod: Record<string, number>;
}
type Method = 'CASH' | 'CARD' | 'UPI' | 'ONLINE' | 'LATER';

const QUICK_CASH = [100, 200, 500, 2000];

/** Counter billing for a stall, shop or event: tap items, take payment, print a receipt. */
export default function Pos() {
  const toast = useToast();
  const { data: cat, error, reload } = useLoad(() => get<Catalog>('/pos/catalog'));
  const { data: summary, reload: reloadSummary } = useLoad(() => get<Summary>('/pos/summary'));
  const [tab, setTab] = useState<'PRODUCT' | 'PACK'>('PRODUCT');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('');
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [paying, setPaying] = useState<Method | null>(null);
  const [custom, setCustom] = useState<{ name: string; price: string; tax: string; unit: Unit; quantity: string; details: string } | null>(null);
  // A product sold by measure (₹80 per sq ft): ask for the size or amount before adding it.
  const [measure, setMeasure] = useState<{ item: CatalogItem; quantity: string; details: string } | null>(null);
  const [done, setDone] = useState<{ invoice: Invoice; change: number; method: Method } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { settings } = useAuth();
  const roundUpTo = settings?.areaRoundUp ?? 0;

  const items = useMemo(() => {
    const list = (tab === 'PRODUCT' ? cat?.products : cat?.packs) ?? [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((i) => i.name.toLowerCase().includes(q) || i.sku?.toLowerCase() === q || i.category?.toLowerCase().includes(q)) : list;
  }, [cat, tab, search]);

  const totals = useMemo(
    () => previewDocument(cart.map((l) => ({ quantity: l.quantity, unitPrice: l.price, taxRate: l.taxRate, minCharge: l.minCharge })), { discount: Number(discount) || 0, interState: false }),
    [cart, discount],
  );

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!cat) return <Spinner />;

  const add = (item: CatalogItem, type: 'PRODUCT' | 'PACK') => {
    if (type === 'PRODUCT' && unitOf(item.unit) !== 'pcs') return setMeasure({ item, quantity: '', details: '' });
    setCart((c) => {
      const found = c.find((l) => l.type === type && l.itemId === item.id);
      if (found) return c.map((l) => (l === found ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { key: `${type}-${item.id}`, type, itemId: item.id, name: item.name, price: item.price, taxRate: item.taxRate ?? cat.defaultTaxRate, quantity: 1, unit: 'pcs', stock: item.stock }];
    });
  };
  const setQty = (key: string, q: number) => setCart((c) => (q <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, quantity: q } : l))));

  // A barcode scanner types the SKU and presses Enter.
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = search.trim().toLowerCase();
    const hit = cat.products.find((p) => p.sku?.toLowerCase() === q) ?? (items.length === 1 ? items[0] : undefined);
    if (hit) {
      add(hit, cat.products.includes(hit) ? 'PRODUCT' : 'PACK');
      setSearch('');
    }
  };

  const reset = () => {
    setCart([]);
    setDiscount('');
    setCustomer({ name: '', phone: '' });
    setDone(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const charge = async (method: Method, extra: { tendered?: number; reference?: string } = {}) => {
    const r = await post<{ invoice: Invoice; change: number; checkoutUrl: string | null }>('/pos/sale', {
      items: cart.map((l) =>
        l.type === 'CUSTOM'
          ? { type: 'CUSTOM', name: l.name, quantity: l.quantity, unit: l.unit, details: l.details, unitPrice: l.price, taxRate: l.taxRate }
          : { type: l.type, itemId: l.itemId, quantity: l.quantity, unit: l.unit, details: l.details },
      ),
      discount: Number(discount) || 0,
      method,
      customerName: customer.name || undefined,
      customerPhone: customer.phone || undefined,
      ...extra,
    });
    void reloadSummary();
    void reload(); // stock changed
    return r;
  };

  const lowStock = (l: CartLine) => l.type === 'PRODUCT' && l.stock !== undefined && l.quantity > l.stock;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Point of sale"
        subtitle={
          summary
            ? `Today: ${summary.sales} sale${summary.sales === 1 ? '' : 's'} · ${money(summary.total)}${Object.entries(summary.byMethod)
                .map(([m, v]) => ` · ${({ BANK_TRANSFER: 'Bank', UPI: 'UPI', CASH: 'Cash', CARD: 'Card' } as Record<string, string>)[m] ?? m} ${money(v)}`)
                .join('')}`
            : 'Quick billing at the counter'
        }
      />
      {done ? (
        <SaleDone done={done} onNew={reset} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  ref={searchRef}
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={onSearchKey}
                  placeholder="Search or scan a barcode"
                  className="pl-9"
                  aria-label="Search products"
                />
              </div>
              <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
                {(['PRODUCT', 'PACK'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 ${tab === t ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>
                    {t === 'PRODUCT' ? 'Products' : 'Packs'}
                  </button>
                ))}
              </div>
              <Button variant="secondary" onClick={() => setCustom({ name: '', price: '', tax: String(cat.defaultTaxRate), unit: 'pcs', quantity: '1', details: '' })}>
                <Plus size={14} /> Custom item
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                {search ? 'Nothing matches.' : (
                  <>
                    No {tab === 'PRODUCT' ? 'products' : 'packs'} yet. <Link to={tab === 'PRODUCT' ? '/products' : '/packs'} className="text-brand-700 hover:underline">Add some</Link> or use a custom item.
                  </>
                )}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((i) => (
                  <button
                    key={i.id}
                    data-testid="pos-tile"
                    onClick={() => add(i, tab)}
                    className="flex min-h-[84px] flex-col justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-brand-400 hover:bg-brand-50 active:scale-[0.98]"
                  >
                    <span className="line-clamp-2 text-sm font-medium text-slate-900">{i.name}</span>
                    <span className="mt-1 flex items-end justify-between gap-1">
                      <span className="font-semibold tabular-nums text-brand-700">
                        {money(i.price)}
                        {unitOf(i.unit) !== 'pcs' && <span className="text-xs font-normal">/{unitLabel(i.unit)}</span>}
                      </span>
                      {i.stock !== undefined && unitOf(i.unit) === 'pcs' && <span className={`text-xs ${i.stock <= 0 ? 'text-red-600' : 'text-slate-400'}`}>{i.stock} left</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title={`Bill${cart.length ? ` · ${cart.reduce((s, l) => s + (l.unit === 'pcs' ? l.quantity : 1), 0)} items` : ''}`}>
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Tap items to add them.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cart.map((l) => (
                  <li key={l.key} className="flex items-center gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{l.name}</div>
                      <div className={`text-xs ${lowStock(l) ? 'text-red-600' : 'text-slate-500'}`}>
                        {money(l.price)}
                        {l.unit !== 'pcs' ? `/${unitLabel(l.unit)}` : ''} · GST {l.taxRate}%{lowStock(l) ? ` · only ${l.stock} in stock` : ''}
                      </div>
                      {l.details && <div className="truncate text-xs text-slate-500">{l.details}</div>}
                      {l.minCharge && l.quantity * l.price < l.minCharge && <div className="text-xs text-amber-700">Minimum charge {money(l.minCharge)}</div>}
                    </div>
                    {l.unit !== 'pcs' ? (
                      <span className="whitespace-nowrap tabular-nums">{qtyText(l.quantity, l.unit)}</span>
                    ) : (
                    <div className="flex items-center gap-1">
                      <button className="rounded border border-slate-200 p-1 hover:bg-slate-50" onClick={() => setQty(l.key, l.quantity - 1)} aria-label={`Less ${l.name}`}>
                        <Minus size={13} />
                      </button>
                      <input
                        className="w-10 rounded border border-slate-200 py-0.5 text-center tabular-nums"
                        value={l.quantity}
                        inputMode="numeric"
                        onChange={(e) => setQty(l.key, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                        aria-label={`Quantity of ${l.name}`}
                      />
                      <button className="rounded border border-slate-200 p-1 hover:bg-slate-50" onClick={() => setQty(l.key, l.quantity + 1)} aria-label={`More ${l.name}`}>
                        <Plus size={13} />
                      </button>
                    </div>
                    )}
                    <div className="w-20 text-right tabular-nums">{money(lineAmount({ quantity: l.quantity, unitPrice: l.price, taxRate: l.taxRate, minCharge: l.minCharge }))}</div>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => setQty(l.key, 0)} aria-label={`Remove ${l.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Customer name">
                <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Walk-in" />
              </Field>
              <Field label="Phone">
                <Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} inputMode="tel" placeholder="Optional" />
              </Field>
              <Field label="Discount (₹)">
                <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
            </div>

            <dl className="mt-3 space-y-1 text-sm">
              <Row label="Subtotal" value={money(totals.subtotal)} />
              {totals.discount > 0 && <Row label="Discount" value={`− ${money(totals.discount)}`} />}
              <Row label="CGST" value={money(totals.cgst)} />
              <Row label="SGST" value={money(totals.sgst)} />
              <div className="flex justify-between border-t border-slate-200 pt-2 text-xl font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums" data-testid="pos-total">
                  {money(totals.grandTotal)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <PayButton icon={Banknote} label="Cash" onClick={() => setPaying('CASH')} disabled={!cart.length} primary />
              <PayButton icon={QrCode} label="UPI" onClick={() => setPaying('UPI')} disabled={!cart.length || !cat.upiId} title={cat.upiId ? undefined : 'Add your UPI ID in Settings › Payments'} />
              <PayButton icon={CreditCard} label="Card" onClick={() => setPaying('CARD')} disabled={!cart.length} />
              {cat.online ? (
                <PayButton icon={Globe} label="Pay online" onClick={() => setPaying('ONLINE')} disabled={!cart.length} />
              ) : (
                <PayButton icon={Wallet} label="Pay later" onClick={() => setPaying('LATER')} disabled={!cart.length} />
              )}
              {cat.online && <PayButton icon={Wallet} label="Pay later" onClick={() => setPaying('LATER')} disabled={!cart.length} />}
            </div>
            {cart.length > 0 && (
              <button className="mt-3 w-full text-center text-xs text-slate-500 hover:text-red-600" onClick={reset}>
                Clear bill
              </button>
            )}
          </Card>
        </div>
      )}

      {paying && (
        <PayDialog
          method={paying}
          total={totals.grandTotal}
          needsName={paying === 'LATER' && !customer.name.trim()}
          onClose={() => setPaying(null)}
          charge={charge}
          onDone={(invoice, change) => {
            setPaying(null);
            setDone({ invoice, change, method: paying });
          }}
          onError={(e) => toast.error(e)}
        />
      )}

      <Modal
        open={Boolean(custom)}
        onClose={() => setCustom(null)}
        title="Custom item"
        footer={
          <Button
            onClick={() => {
              if (!custom?.name.trim() || !(Number(custom.price) > 0)) return toast.error('Enter a name and a price');
              const q = Number(custom.quantity);
              if (!(q > 0) || (UNITS[custom.unit].whole && !Number.isInteger(q))) return toast.error(UNITS[custom.unit].whole ? 'Enter a whole number' : 'Enter the size or amount');
              setCart((c) => [
                ...c,
                { key: `CUSTOM-${Date.now()}`, type: 'CUSTOM', name: custom.name.trim(), price: Number(custom.price), taxRate: Number(custom.tax) || 0, quantity: q, unit: custom.unit, details: custom.details || undefined },
              ]);
              setCustom(null);
            }}
          >
            Add to bill
          </Button>
        }
      >
        {custom && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Item" className="sm:col-span-3">
              <Input autoFocus value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="e.g. Custom name sticker" />
            </Field>
            <Field label={custom.unit === 'pcs' ? 'Price (before GST)' : `Rate per ${unitLabel(custom.unit)}`}>
              <Input type="number" min={0} step="0.01" value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} />
            </Field>
            <Field label="Sold by">
              <Select value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: e.target.value as Unit, quantity: e.target.value === 'pcs' ? '1' : '', details: '' })}>
                {UNIT_KEYS.map((u) => (
                  <option key={u} value={u}>
                    {u === 'pcs' ? 'Piece' : `Per ${UNITS[u].label}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="GST %">
              <Input type="number" min={0} max={28} value={custom.tax} onChange={(e) => setCustom({ ...custom, tax: e.target.value })} />
            </Field>
            <div className="sm:col-span-3">
              {isArea(custom.unit) ? (
                <SizeCalculator
                  compact
                  roundUpTo={roundUpTo}
                  target={custom.unit as 'sqft' | 'sqm'}
                  onArea={(r) => setCustom((c) => (c ? { ...c, quantity: r ? String(r.quantity) : '', details: r ? r.details.replace(/ = .*$/, '') : '' } : c))}
                />
              ) : (
                <Field label={`Quantity (${unitLabel(custom.unit)})`}>
                  <Input type="number" min={0} step={UNITS[custom.unit].whole ? 1 : 'any'} value={custom.quantity} onChange={(e) => setCustom({ ...custom, quantity: e.target.value })} />
                </Field>
              )}
              {Number(custom.price) > 0 && Number(custom.quantity) > 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  {qtyText(Number(custom.quantity), custom.unit)} × {money(Number(custom.price))} = <strong>{money(Math.round(Number(custom.quantity) * Number(custom.price) * 100) / 100)}</strong> + GST
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(measure)}
        onClose={() => setMeasure(null)}
        title={measure ? `${measure.item.name} · ${money(measure.item.price)}/${unitLabel(measure.item.unit)}` : ''}
        footer={
          <Button
            onClick={() => {
              if (!measure) return;
              const q = Number(measure.quantity);
              if (!(q > 0)) return toast.error('Enter the size or amount');
              const it = measure.item;
              setCart((c) => [
                ...c,
                {
                  key: `PRODUCT-${it.id}-${Date.now()}`,
                  type: 'PRODUCT',
                  itemId: it.id,
                  name: it.name,
                  price: it.price,
                  taxRate: it.taxRate ?? cat.defaultTaxRate,
                  quantity: q,
                  unit: unitOf(it.unit),
                  details: measure.details || undefined,
                  minCharge: it.minCharge ?? null,
                },
              ]);
              setMeasure(null);
            }}
          >
            Add to bill
          </Button>
        }
      >
        {measure && (
          <div className="space-y-3">
            {isArea(measure.item.unit) ? (
              <SizeCalculator
                compact
                roundUpTo={roundUpTo}
                target={unitOf(measure.item.unit) as 'sqft' | 'sqm'}
                onArea={(r) => setMeasure((m) => (m ? { ...m, quantity: r ? String(r.quantity) : '', details: r ? r.details.replace(/ = .*$/, '') : '' } : m))}
              />
            ) : (
              <Field label={`How many ${unitLabel(measure.item.unit)}?`}>
                <Input autoFocus type="number" min={0} step="any" value={measure.quantity} onChange={(e) => setMeasure({ ...measure, quantity: e.target.value })} />
              </Field>
            )}
            {Number(measure.quantity) > 0 && (
              <p className="text-sm text-slate-600" data-testid="measure-amount">
                {qtyText(Number(measure.quantity), measure.item.unit)} × {money(measure.item.price)} ={' '}
                <strong>{money(lineAmount({ quantity: Number(measure.quantity), unitPrice: measure.item.price, taxRate: 0, minCharge: measure.item.minCharge }))}</strong> + GST
                {measure.item.minCharge && Number(measure.quantity) * measure.item.price < measure.item.minCharge && <span className="text-amber-700"> (minimum charge)</span>}
              </p>
            )}
          </div>
        )}
      </Modal>
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

function PayButton({ icon: Icon, label, onClick, disabled, primary, title }: { icon: typeof Banknote; label: string; onClick: () => void; disabled?: boolean; primary?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
      }`}
    >
      <Icon size={17} /> {label}
    </button>
  );
}

type Charge = (method: Method, extra?: { tendered?: number; reference?: string }) => Promise<{ invoice: Invoice; change: number; checkoutUrl: string | null }>;

function PayDialog({
  method,
  total,
  needsName,
  onClose,
  charge,
  onDone,
  onError,
}: {
  method: Method;
  total: number;
  needsName: boolean;
  onClose: () => void;
  charge: Charge;
  onDone: (invoice: Invoice, change: number) => void;
  onError: (e: unknown) => void;
}) {
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<{ invoiceId: string; url: string } | null>(null);
  // The parent re-creates these callbacks on every render; keep the latest without re-running effects.
  const cb = useRef({ onDone, onError });
  useEffect(() => {
    cb.current = { onDone, onError };
  });

  useEffect(() => {
    if (method !== 'UPI') return;
    post<{ dataUrl: string }>('/pos/upi-qr', { amount: total })
      .then((r) => setQr(r.dataUrl))
      .catch((e) => cb.current.onError(e));
  }, [method, total]);

  // Online: wait for the gateway to confirm (webhook), checking every 3 seconds.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const inv = await get<Invoice>(`/invoices/${waiting.invoiceId}`);
        if (inv.status === 'PAID') {
          clearInterval(t);
          cb.current.onDone(inv, 0);
        }
      } catch {
        /* keep waiting */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [waiting]);

  const cash = Number(tendered);
  const change = tendered ? Math.round((cash - total) * 100) / 100 : 0;

  const submit = async () => {
    setBusy(true);
    try {
      if (method === 'ONLINE') {
        const win = window.open('', '_blank');
        const r = await charge('ONLINE');
        if (win && r.checkoutUrl) win.location.href = r.checkoutUrl;
        else win?.close();
        setWaiting({ invoiceId: r.invoice.id, url: r.checkoutUrl ?? '' });
        return;
      }
      const r = await charge(method, method === 'CASH' ? { tendered: tendered ? cash : undefined } : { reference: reference || undefined });
      onDone(r.invoice, r.change);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Method, string> = { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', ONLINE: 'Pay online', LATER: 'Pay later' };
  const canSubmit = method === 'CASH' ? !tendered || cash >= total : method === 'LATER' ? !needsName : true;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${titles[method]} · ${money(total)}`}
      footer={
        waiting ? (
          <Button variant="secondary" onClick={() => window.open(waiting.url, '_blank')}>
            Open payment screen again
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Back
            </Button>
            <Button onClick={() => void submit()} loading={busy} disabled={!canSubmit}>
              {method === 'UPI' ? 'Payment received' : method === 'ONLINE' ? 'Open payment screen' : method === 'LATER' ? 'Save on account' : 'Complete sale'}
            </Button>
          </>
        )
      }
    >
      {method === 'CASH' && (
        <div className="space-y-3">
          <Field label="Cash received" hint="Leave blank if it's the exact amount">
            <Input autoFocus type="number" min={0} step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canSubmit && void submit()} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {QUICK_CASH.filter((n) => n >= total).slice(0, 3).concat([Math.ceil(total / 10) * 10]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((n) => (
              <Button key={n} size="sm" variant="secondary" onClick={() => setTendered(String(n))}>
                {money(n, { decimals: 0 })}
              </Button>
            ))}
          </div>
          {tendered && (
            <div className={`rounded-lg px-4 py-3 text-lg font-bold ${change >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} data-testid="pos-change">
              {change >= 0 ? `Change: ${money(change)}` : `Short by ${money(-change)}`}
            </div>
          )}
        </div>
      )}
      {method === 'UPI' && (
        <div className="space-y-3 text-center">
          {qr ? <img src={qr} alt="UPI QR code" className="mx-auto h-56 w-56" /> : <Spinner />}
          <p className="text-sm text-slate-600">Ask the customer to scan and pay {money(total)}. Press &ldquo;Payment received&rdquo; once you see it on your phone.</p>
          <Field label="UPI reference (optional)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="12-digit UTR" />
          </Field>
        </div>
      )}
      {method === 'CARD' && (
        <Field label="Card slip / approval number (optional)">
          <Input autoFocus value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      )}
      {method === 'ONLINE' &&
        (waiting ? (
          <div className="py-4 text-center text-sm text-slate-600">
            <Spinner />
            Waiting for the payment to be confirmed… This closes by itself when YouPI confirms it.
          </div>
        ) : (
          <p className="text-sm text-slate-600">Opens your YouPI payment screen in a new window for the customer to scan. The sale completes as soon as the payment is confirmed.</p>
        ))}
      {method === 'LATER' && (
        <p className={`text-sm ${needsName ? 'text-red-600' : 'text-slate-600'}`}>
          {needsName ? 'Enter the customer name (and phone) on the bill first, so you know who owes it.' : 'The bill is saved as an unpaid invoice on the customer’s account.'}
        </p>
      )}
    </Modal>
  );
}

function SaleDone({ done, onNew }: { done: { invoice: Invoice; change: number; method: Method }; onNew: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Enter' && onNew();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNew]);
  const inv = done.invoice;
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 size={48} className="text-emerald-600" />
        <div className="text-2xl font-bold">{inv.status === 'PAID' ? 'Paid' : 'Saved on account'} · {money(inv.grandTotal)}</div>
        {done.change > 0 && (
          <div className="rounded-lg bg-emerald-50 px-5 py-3 text-xl font-bold text-emerald-800" data-testid="pos-done-change">
            Give change: {money(done.change)}
          </div>
        )}
        <div className="text-sm text-slate-500">
          <Link to={`/invoices/${inv.id}`} className="text-brand-700 hover:underline">
            {inv.invoiceNumber}
          </Link>{' '}
          · <UserRound size={12} className="inline" /> {inv.customer.name}
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={() => window.open(`/pos/receipt/${inv.id}`, '_blank', 'width=420,height=700')}>
            <Printer size={15} /> Print receipt
          </Button>
          <Button onClick={onNew}>New sale (Enter)</Button>
        </div>
      </div>
    </Card>
  );
}
