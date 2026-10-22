import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, ScanText, Trash2 } from 'lucide-react';
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import { useToast } from '../components/toast';
import { get, http, post, put } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { useAuth } from '../context/AuthContext';
import { isoDate, money } from '../lib/format';
import { gstinState, previewDocument } from '../lib/docmath';
import type { Bill, InventoryItem, PurchaseOrder, Supplier } from '../lib/types';

interface Line {
  key: number;
  inventoryItemId: string;
  description: string;
  category: string;
  hsnCode: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

const CATEGORIES = ['Purchases', 'Raw materials', 'Packaging', 'Stock for resale', 'Tools & equipment', 'Furniture', 'Repairs & maintenance', 'Services', 'Other'];

let keySeq = 1;
type TaxType = 'AUTO' | 'INTRA' | 'INTER';
const toNum = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? 0 : Number(v));

interface Loaded {
  suppliers: Supplier[];
  materials: InventoryItem[];
  bill: Bill | null;
  po: PurchaseOrder | null;
}

const blankLine = (defaultTax: number): Line => ({
  key: keySeq++,
  inventoryItemId: '',
  description: '',
  category: 'Purchases',
  hsnCode: '',
  quantity: '1',
  unitPrice: '',
  taxRate: String(defaultTax),
});

/** Starting values: an existing bill, a purchase order to bill, or a blank bill. */
function initialForm(data: Loaded, defaultTax: number, preSupplierId: string | null) {
  const b = data.bill;
  if (b) {
    return {
      supplierId: b.supplierId,
      billNumber: b.billNumber,
      billDate: isoDate(b.date),
      dueDate: isoDate(b.dueDate),
      discount: String(b.discount),
      shipping: String(b.shippingCost),
      taxType: (b.igst > 0 ? 'INTER' : b.cgst > 0 ? 'INTRA' : 'AUTO') as TaxType,
      itcEligible: b.itcEligible || b.taxAmount === 0,
      addToStock: b.addToStock,
      purchaseOrderId: b.purchaseOrderId,
      notes: b.notes ?? '',
      lines: (b.items ?? []).map((i) => ({
        key: keySeq++,
        inventoryItemId: i.inventoryItemId ?? '',
        description: i.description,
        category: i.category,
        hsnCode: i.hsnCode ?? '',
        quantity: String(i.quantity),
        unitPrice: String(i.unitPrice),
        taxRate: String(i.taxRate),
      })),
    };
  }
  const base = {
    supplierId: preSupplierId && data.suppliers.some((s) => s.id === preSupplierId) ? preSupplierId : '',
    billNumber: '',
    billDate: isoDate(new Date()),
    dueDate: '',
    discount: '0',
    shipping: '0',
    taxType: 'AUTO' as TaxType,
    itcEligible: true,
    addToStock: true,
    purchaseOrderId: null as string | null,
    notes: '',
    lines: [blankLine(defaultTax)],
  };
  if (!data.po) return base;
  // Bill for a purchase order: what was received (or ordered, if nothing yet) at the PO price.
  return {
    ...base,
    supplierId: data.po.supplierId,
    purchaseOrderId: data.po.id,
    lines: data.po.items.map((i) => ({
      key: keySeq++,
      inventoryItemId: i.inventoryItemId,
      description: i.inventoryItem.name,
      category: 'Purchases',
      hsnCode: '',
      quantity: String(i.quantityReceived > 0 ? i.quantityReceived : i.quantityOrdered),
      unitPrice: String(i.unitPrice),
      taxRate: String(defaultTax),
    })),
  };
}

export default function BillEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const poId = params.get('po');

  const { data, loading, error, reload } = useLoad(async (): Promise<Loaded> => {
    const [suppliers, materials, bill, po] = await Promise.all([
      get<Supplier[]>('/suppliers'),
      get<InventoryItem[]>('/inventory'),
      id ? get<Bill>(`/bills/${id}`) : Promise.resolve(null),
      !id && poId ? get<PurchaseOrder>(`/purchase-orders/${poId}`) : Promise.resolve(null),
    ]);
    return { suppliers, materials, bill, po };
  }, [id, poId]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  if (id && data.bill && (data.bill.amountPaid > 0 || data.bill.status === 'CANCELLED')) {
    return (
      <div className="max-w-xl">
        <PageHeader title={`Bill ${data.bill.billNumber}`} />
        <Card>
          <p className="text-sm text-slate-600">
            {data.bill.status === 'CANCELLED'
              ? 'This bill is cancelled and can no longer be edited.'
              : 'This bill has payments recorded. Delete the payments first if you need to correct it.'}
          </p>
          <Link to={`/bills/${data.bill.id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            <ArrowLeft size={14} /> Back to bill
          </Link>
        </Card>
      </div>
    );
  }

  return <BillForm key={id ?? poId ?? 'new'} data={data} id={id} preSupplierId={params.get('supplierId')} />;
}

function BillForm({ data, id, preSupplierId }: { data: Loaded; id?: string; preSupplierId: string | null }) {
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useAuth();
  const defaultTax = settings?.defaultTaxRate ?? 0;
  const [init] = useState(() => initialForm(data, defaultTax, preSupplierId));

  const [supplierId, setSupplierId] = useState(init.supplierId);
  const [billNumber, setBillNumber] = useState(init.billNumber);
  const [billDate, setBillDate] = useState(init.billDate);
  const [dueDate, setDueDate] = useState(init.dueDate);
  const [discount, setDiscount] = useState(init.discount);
  const [shipping, setShipping] = useState(init.shipping);
  const [taxType, setTaxType] = useState<TaxType>(init.taxType);
  const [itcEligible, setItcEligible] = useState(init.itcEligible);
  const [addToStock, setAddToStock] = useState(init.addToStock);
  const purchaseOrderId = init.purchaseOrderId;
  const [notes, setNotes] = useState(init.notes);
  const [lines, setLines] = useState<Line[]>(init.lines);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>(data.suppliers);
  const { aiEnabled } = useAuth();
  const [reading, setReading] = useState(false);
  const [readNotes, setReadNotes] = useState<{ warnings: string[]; suggested: { name: string; gstin: string | null } | null } | null>(null);

  /** Fill the form from a photo or PDF of the bill (AI). Nothing is saved until you press Save. */
  const readFromFile = async (file: File) => {
    setReading(true);
    try {
      const res = await http.post('/bills/read', file, { headers: { 'Content-Type': file.type || 'application/octet-stream' }, timeout: 300_000 });
      const r = res.data.data as {
        supplier: { id: string } | null;
        suggestedSupplier: { name: string; gstin: string | null };
        draft: { billNumber: string; date: string | null; dueDate: string | null; discount: number; shippingCost: number; interState: boolean; items: { description: string; hsnCode: string | null; quantity: number; unitPrice: number; taxRate: number }[] };
        warnings: string[];
      };
      if (r.supplier) setSupplierId(r.supplier.id);
      if (r.draft.billNumber) setBillNumber(r.draft.billNumber);
      if (r.draft.date) setBillDate(r.draft.date);
      if (r.draft.dueDate) setDueDate(r.draft.dueDate);
      setDiscount(String(r.draft.discount));
      setShipping(String(r.draft.shippingCost));
      setTaxType(r.draft.interState ? 'INTER' : 'AUTO');
      if (r.draft.items.length) {
        setLines(
          r.draft.items.map((i) => ({ ...blankLine(defaultTax), description: i.description, hsnCode: i.hsnCode ?? '', quantity: String(i.quantity), unitPrice: String(i.unitPrice), taxRate: String(i.taxRate) })),
        );
      }
      setReadNotes({ warnings: r.warnings, suggested: r.supplier ? null : r.suggestedSupplier });
      toast.success(r.warnings.length ? 'Bill read. Check the highlighted points.' : 'Bill read. Check it, then save.');
    } catch (err) {
      toast.error(err);
    } finally {
      setReading(false);
    }
  };

  const addSuggestedSupplier = async () => {
    const sg = readNotes?.suggested;
    if (!sg?.name) return;
    try {
      const created = await post<Supplier>('/suppliers', { name: sg.name, gst: sg.gstin ?? '' });
      setSuppliers((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(created.id);
      setReadNotes((n) => (n ? { ...n, suggested: null, warnings: n.warnings.filter((w) => !/isn't in your suppliers/.test(w)) } : n));
      toast.success(`${created.name} added`);
    } catch (err) {
      toast.error(err);
    }
  };

  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const materialById = new Map(data.materials.map((m) => [m.id, m]));

  // Preview only; the server decides AUTO from GST state codes.
  const autoInter = (() => {
    const ours = gstinState(settings?.gstNumber);
    const theirs = gstinState(supplier?.gst);
    if (ours && theirs) return ours !== theirs;
    const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
    return Boolean(settings?.state && supplier?.state && norm(settings.state) !== norm(supplier.state));
  })();
  const interState = taxType === 'AUTO' ? autoInter : taxType === 'INTER';

  const totals = previewDocument(
    lines.map((l) => ({ quantity: toNum(l.quantity), unitPrice: toNum(l.unitPrice), taxRate: toNum(l.taxRate) })),
    { discount: toNum(discount), shippingCost: toNum(shipping), interState },
  );

  const updateLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickMaterial = (key: number, materialId: string) => {
    const m = materialById.get(materialId);
    updateLine(key, m ? { inventoryItemId: m.id, description: m.name, unitPrice: m.costPerUnit ? String(m.costPerUnit) : '' } : { inventoryItemId: '' });
  };
  const activeSuppliers = suppliers.filter((s) => s.status === 'ACTIVE' || s.id === supplierId);
  const hasMaterials = lines.some((l) => l.inventoryItemId);
  const poNumber = data.bill?.purchaseOrder?.poNumber ?? data.po?.poNumber;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId) return toast.error('Choose the supplier');
    if (!billNumber.trim()) return toast.error('Enter the bill number from the supplier invoice');
    const items = lines
      .filter((l) => l.description.trim() || l.inventoryItemId)
      .map((l) => ({
        inventoryItemId: l.inventoryItemId || null,
        description: l.description,
        category: l.category,
        hsnCode: l.hsnCode,
        quantity: toNum(l.quantity),
        unitPrice: toNum(l.unitPrice),
        taxRate: toNum(l.taxRate),
      }));
    if (!items.length) return toast.error('Add at least one line');
    if (items.some((i) => i.quantity <= 0)) return toast.error('Every line needs a quantity above zero');
    setSaving(true);
    const body = {
      supplierId,
      billNumber: billNumber.trim(),
      purchaseOrderId,
      date: billDate || null,
      dueDate: dueDate || undefined,
      discount: toNum(discount),
      shippingCost: toNum(shipping),
      interState: taxType === 'AUTO' ? null : taxType === 'INTER',
      itcEligible,
      addToStock,
      notes,
      items,
    };
    try {
      const saved = isEdit ? await put<Bill>(`/bills/${id}`, body) : await post<Bill>('/bills', body);
      toast.success(isEdit ? 'Bill updated' : `Bill ${saved.billNumber} recorded`);
      navigate(`/bills/${saved.id}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <PageHeader
        title={isEdit ? `Edit bill ${data.bill?.billNumber ?? ''}` : 'New bill'}
        subtitle={poNumber ? `For purchase order ${poNumber}` : 'Enter the supplier invoice exactly as printed.'}
        actions={
          <>
            {!isEdit && !purchaseOrderId && aiEnabled && (
              <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 ${reading ? 'opacity-60' : ''}`}>
                <ScanText size={15} /> {reading ? 'Reading…' : 'Read from photo or PDF'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  capture="environment"
                  className="hidden"
                  disabled={reading}
                  aria-label="Bill photo or PDF"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void readFromFile(f);
                  }}
                />
              </label>
            )}
            <Link to={isEdit ? `/bills/${id}` : '/bills'}>
              <Button variant="secondary">
                <ArrowLeft size={15} /> Back
              </Button>
            </Link>
          </>
        }
      />

      {readNotes && (readNotes.warnings.length > 0 || readNotes.suggested) && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {readNotes.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          {readNotes.suggested?.name && (
            <Button size="sm" variant="secondary" onClick={() => void addSuggestedSupplier()}>
              <Plus size={14} /> Add supplier &ldquo;{readNotes.suggested.name}&rdquo;
            </Button>
          )}
        </div>
      )}

      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier" className="sm:col-span-2" hint={supplier && !supplier.gst ? 'No GSTIN on file: GST on this bill cannot be claimed.' : undefined}>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={Boolean(purchaseOrderId)} aria-label="Supplier">
              <option value="">Choose a supplier…</option>
              {activeSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bill number" hint="As printed on their invoice">
            <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="e.g. PP/2026/118" aria-label="Bill number" />
          </Field>
          <Field label="Bill date">
            <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </Field>
          <Field label="Due date" hint={supplier?.paymentTerms ? `Blank = from terms (${supplier.paymentTerms})` : 'Blank = no due date'}>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="GST type" hint={taxType === 'AUTO' ? (autoInter ? 'Looks inter-state: IGST' : 'Looks same-state: CGST + SGST') : undefined}>
            <Select value={taxType} onChange={(e) => setTaxType(e.target.value as TaxType)}>
              <option value="AUTO">Automatic</option>
              <option value="INTRA">CGST + SGST (same state)</option>
              <option value="INTER">IGST (other state)</option>
            </Select>
          </Field>
          <div className="space-y-2 pt-5 text-sm sm:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={itcEligible} onChange={(e) => setItcEligible(e.target.checked)} />
              I can claim the GST on this bill (input tax credit)
            </label>
            {!purchaseOrderId && hasMaterials && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={addToStock} onChange={(e) => setAddToStock(e.target.checked)} />
                Add the material lines to stock
              </label>
            )}
            {purchaseOrderId && <p className="text-xs text-slate-500">Stock was added when goods were received on the purchase order, so this bill won&apos;t add it again.</p>}
          </div>
        </div>
      </Card>

      <Card title="Lines" bodyClassName="p-0" actions={<Button size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, blankLine(defaultTax)])}><Plus size={14} /> Add line</Button>}>
        <div className="divide-y divide-slate-100">
          {lines.map((l, idx) => (
            <div key={l.key} className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-12 sm:items-end">
              <Field label={idx === 0 ? 'Material (optional)' : ' '} className="col-span-2 sm:col-span-3">
                <Select value={l.inventoryItemId} onChange={(e) => pickMaterial(l.key, e.target.value)} aria-label={`Line ${idx + 1} material`}>
                  <option value="">Not a stock item</option>
                  {data.materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unit})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={idx === 0 ? 'Description' : ' '} className="col-span-2 sm:col-span-3">
                <Input value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} placeholder="What you bought" aria-label={`Line ${idx + 1} description`} />
              </Field>
              <Field label={idx === 0 ? 'Category' : ' '} className="col-span-2 sm:col-span-2">
                <Input list="bill-categories" value={l.category} onChange={(e) => updateLine(l.key, { category: e.target.value })} aria-label={`Line ${idx + 1} category`} />
              </Field>
              <Field label={idx === 0 ? 'Qty' : ' '} className="sm:col-span-1">
                <Input type="number" min="0" step="any" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} aria-label={`Line ${idx + 1} quantity`} />
              </Field>
              <Field label={idx === 0 ? 'Rate' : ' '} className="sm:col-span-1">
                <Input type="number" min="0" step="any" value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })} aria-label={`Line ${idx + 1} unit price`} />
              </Field>
              <Field label={idx === 0 ? 'GST %' : ' '} className="sm:col-span-1">
                <Input type="number" min="0" max="100" step="any" value={l.taxRate} onChange={(e) => updateLine(l.key, { taxRate: e.target.value })} aria-label={`Line ${idx + 1} GST rate`} />
              </Field>
              <div className="flex items-center justify-end gap-2 sm:col-span-1">
                <span className="text-sm tabular-nums text-slate-600">{money(toNum(l.quantity) * toNum(l.unitPrice))}</span>
                <Button size="sm" variant="ghost" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine(defaultTax)]))}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <datalist id="bill-categories">
          {CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Notes" className="lg:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: delivery note, what it was for…" />
        </Card>
        <Card title="Totals">
          <div className="space-y-2 text-sm">
            <Row label="Subtotal" value={money(totals.subtotal)} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600">Discount</span>
              <Input type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-28 text-right" aria-label="Discount" />
            </div>
            {interState ? (
              <Row label="IGST" value={money(totals.igst)} />
            ) : (
              <>
                <Row label="CGST" value={money(totals.cgst)} />
                <Row label="SGST" value={money(totals.sgst)} />
              </>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600">Freight / shipping</span>
              <Input type="number" min="0" step="any" value={shipping} onChange={(e) => setShipping(e.target.value)} className="w-28 text-right" aria-label="Shipping" />
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <span>Bill total</span>
              <span className="tabular-nums">{money(totals.grandTotal)}</span>
            </div>
          </div>
          <Button type="submit" className="mt-4 w-full" loading={saving}>
            {isEdit ? 'Save changes' : 'Save bill'}
          </Button>
        </Card>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
