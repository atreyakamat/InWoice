import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Input, PageHeader, Select, Spinner, Stat, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/toast';
import { useLoad } from '../lib/useLoad';
import { get, put } from '../lib/api';
import { money, num } from '../lib/format';
import type { InventoryItem } from '../lib/types';

interface BomResponse {
  product: { id: string; name: string; price: number; costPrice: number };
  items: {
    inventoryItemId: string;
    quantityRequired: number;
    inventoryItem: { id: string; name: string; unit: string; costPerUnit: number; currentStock: number };
  }[];
  materialCost: number;
  producible: number | null;
}

interface Row {
  key: number;
  inventoryItemId: string;
  quantityRequired: string;
}

let rowKey = 0;

export default function BomEditor() {
  const { productId = '' } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(
    async () => {
      const [bom, materials] = await Promise.all([get<BomResponse>(`/bom/${productId}`), get<InventoryItem[]>('/inventory')]);
      return { bom, materials };
    },
    [productId],
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setRows(data.bom.items.map((i) => ({ key: ++rowKey, inventoryItemId: i.inventoryItemId, quantityRequired: String(i.quantityRequired) })));
    }
  }, [data]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data) return null;

  const { bom, materials } = data;
  const byId = new Map(materials.map((m) => [m.id, m]));
  // Live preview using the rows being edited.
  const liveCost = rows.reduce((s, r) => {
    const m = byId.get(r.inventoryItemId);
    return s + (m ? m.costPerUnit * (Number(r.quantityRequired) || 0) : 0);
  }, 0);
  const validRows = rows.filter((r) => r.inventoryItemId && Number(r.quantityRequired) > 0);
  const liveProducible = validRows.length
    ? Math.floor(Math.min(...validRows.map((r) => (byId.get(r.inventoryItemId)?.currentStock ?? 0) / Number(r.quantityRequired))))
    : null;
  const margin = bom.product.price > 0 ? ((bom.product.price - liveCost) / bom.product.price) * 100 : null;

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    const incomplete = rows.some((r) => !r.inventoryItemId || !(Number(r.quantityRequired) > 0));
    if (incomplete) return toast.error('Each row needs a material and a quantity greater than zero');
    const ids = rows.map((r) => r.inventoryItemId);
    if (new Set(ids).size !== ids.length) return toast.error('Each material can only appear once');
    setSaving(true);
    try {
      await put(`/bom/${productId}`, {
        items: rows.map((r) => ({ inventoryItemId: r.inventoryItemId, quantityRequired: Number(r.quantityRequired) })),
      });
      toast.success('Bill of materials saved');
      void reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link to="/products" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Back to products
      </Link>
      <PageHeader
        title={`Materials for ${bom.product.name}`}
        subtitle="When this product sells beyond finished stock, these materials are consumed automatically (made to order). Production batches also consume them."
        actions={
          <Button onClick={save} loading={saving}>
            <Save size={15} /> Save
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Material cost / unit" value={money(liveCost)} />
        <Stat label="Selling price" value={money(bom.product.price)} />
        <Stat
          label="Gross margin"
          value={margin === null ? '—' : `${margin.toFixed(0)}%`}
          tone={margin === null ? undefined : margin < 0 ? 'bad' : margin < 30 ? 'warn' : 'good'}
          hint={margin === null ? undefined : `${money(bom.product.price - liveCost)} per unit`}
        />
        <Stat
          label="Can produce"
          value={liveProducible === null ? '—' : num(liveProducible, 0)}
          hint={liveProducible === null ? 'Add materials' : 'units with current stock'}
          tone={liveProducible === 0 ? 'bad' : undefined}
        />
      </div>

      <Card
        title="Bill of materials (per unit)"
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, { key: ++rowKey, inventoryItemId: '', quantityRequired: '1' }])}>
            <Plus size={14} /> Add material
          </Button>
        }
      >
        {!materials.length ? (
          <EmptyState
            title="No materials in inventory"
            description="Add raw materials on the Inventory page first, then link them here."
            action={
              <Link to="/inventory">
                <Button variant="secondary">Go to inventory</Button>
              </Link>
            }
          />
        ) : !rows.length ? (
          <EmptyState title="No materials linked" description="Add the raw materials one unit of this product uses." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Material</Th>
                <Th className="w-36">Qty per unit</Th>
                <Th className="text-right">Cost / unit</Th>
                <Th className="text-right">Line cost</Th>
                <Th className="text-right">In stock</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const m = byId.get(r.inventoryItemId);
                return (
                  <tr key={r.key}>
                    <Td className="min-w-[200px]">
                      <Select value={r.inventoryItemId} onChange={(e) => update(r.key, { inventoryItemId: e.target.value })}>
                        <option value="">Select material…</option>
                        {materials.map((mat) => (
                          <option key={mat.id} value={mat.id}>
                            {mat.name} ({mat.unit})
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={r.quantityRequired}
                          onChange={(e) => update(r.key, { quantityRequired: e.target.value })}
                        />
                        <span className="text-xs text-slate-500">{m?.unit}</span>
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums">{m ? money(m.costPerUnit) : '—'}</Td>
                    <Td className="text-right tabular-nums">{m ? money(m.costPerUnit * (Number(r.quantityRequired) || 0)) : '—'}</Td>
                    <Td className="text-right tabular-nums">{m ? `${num(m.currentStock)} ${m.unit}` : '—'}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                        <Trash2 size={14} />
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
