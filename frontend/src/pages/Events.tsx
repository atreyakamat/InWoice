import { useState } from 'react';
import { CalendarDays, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Td, Textarea, Th, useConfirm } from '../components/ui';
import { useToast } from '../components/toast';
import { useLoad } from '../lib/useLoad';
import { del, get, patch, post, put } from '../lib/api';
import { date, isoDate, num, titleCase } from '../lib/format';
import type { EventRow, InventoryItem } from '../lib/types';

type Allocation = EventRow['inventory'][number];

export default function Events() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: events, loading, error, reload } = useLoad(() => get<EventRow[]>('/events'));
  const [editing, setEditing] = useState<EventRow | 'new' | null>(null);
  const [allocating, setAllocating] = useState<EventRow | null>(null);
  const [recording, setRecording] = useState<{ event: EventRow; row: Allocation } | null>(null);

  const remove = async (ev: EventRow) => {
    const ok = await confirm({ title: 'Delete event?', message: `"${ev.name}" will be permanently deleted.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await del(`/events/${ev.id}`);
      toast.success('Event deleted');
      await reload();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Pop-up stalls and markets: allocate stock, record what sold, and return the rest to inventory."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} /> New event
          </Button>
        }
      />

      {loading && !events ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !events?.length ? (
        <Card>
          <EmptyState
            title="No events yet"
            description="Create an event to track stock you take to a market or pop-up."
            action={
              <Button onClick={() => setEditing('new')}>
                <CalendarDays size={16} /> New event
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((ev) => {
            const closed = ev.status === 'COMPLETED' || ev.status === 'CANCELLED';
            return (
              <Card
                key={ev.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {ev.name} <StatusBadge status={ev.status} />
                  </span>
                }
                actions={
                  <div className="flex gap-1">
                    {!closed && (
                      <Button size="sm" variant="secondary" onClick={() => setAllocating(ev)}>
                        <Plus size={14} /> Allocate stock
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(ev)} aria-label="Edit event">
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(ev)} aria-label="Delete event">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                }
                bodyClassName="p-0"
              >
                <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-sm text-slate-600">
                  {ev.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={14} /> {ev.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CalendarDays size={14} /> {date(ev.startDate)}
                    {ev.endDate && ` – ${date(ev.endDate)}`}
                  </span>
                  {ev.notes && <span className="text-slate-500">{ev.notes}</span>}
                </div>
                {ev.inventory.length === 0 ? (
                  <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">No stock allocated yet.</p>
                ) : (
                  <div className="border-t border-slate-100">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Item</Th>
                          <Th className="text-right">Allocated</Th>
                          <Th className="text-right">Sold</Th>
                          <Th className="text-right">Returned</Th>
                          <Th className="text-right">Remaining</Th>
                          <Th className="text-right" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ev.inventory.map((row) => {
                          const remaining = row.quantityAllocated - row.quantitySold - row.quantityReturned;
                          return (
                            <tr key={row.id}>
                              <Td className="font-medium text-slate-900">{row.inventoryItem.name}</Td>
                              <Td className="text-right tabular-nums">
                                {num(row.quantityAllocated)} {row.inventoryItem.unit}
                              </Td>
                              <Td className="text-right tabular-nums">{num(row.quantitySold)}</Td>
                              <Td className="text-right tabular-nums">{num(row.quantityReturned)}</Td>
                              <Td className="text-right font-medium tabular-nums">{num(remaining)}</Td>
                              <Td className="text-right">
                                {remaining > 0 && (
                                  <Button size="sm" variant="secondary" onClick={() => setRecording({ event: ev, row })}>
                                    Record sales/returns
                                  </Button>
                                )}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <EventModal
          event={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {allocating && (
        <AllocateModal
          event={allocating}
          onClose={() => setAllocating(null)}
          onSaved={async () => {
            setAllocating(null);
            await reload();
          }}
        />
      )}
      {recording && (
        <RecordModal
          event={recording.event}
          row={recording.row}
          onClose={() => setRecording(null)}
          onSaved={async () => {
            setRecording(null);
            await reload();
          }}
        />
      )}
      {confirm.dialog}
    </div>
  );
}

function EventModal({ event, onClose, onSaved }: { event: EventRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: event?.name ?? '',
    location: event?.location ?? '',
    startDate: isoDate(event?.startDate),
    endDate: isoDate(event?.endDate),
    notes: event?.notes ?? '',
    status: event?.status ?? 'PLANNED',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return toast.error('Event name is required');
    setSaving(true);
    try {
      if (event) await put(`/events/${event.id}`, form);
      else await post('/events', form);
      toast.success(event ? 'Event updated' : 'Event created');
      onSaved();
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
      title={event ? 'Edit event' : 'New event'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" className="sm:col-span-2">
          <Input value={form.name} onChange={set('name')} placeholder="Weekend Flea Market" autoFocus />
        </Field>
        <Field label="Location">
          <Input value={form.location} onChange={set('location')} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={set('status')}>
            {['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" value={form.startDate} onChange={set('startDate')} />
        </Field>
        <Field label="End date">
          <Input type="date" value={form.endDate} onChange={set('endDate')} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={set('notes')} />
        </Field>
      </div>
    </Modal>
  );
}

function AllocateModal({ event, onClose, onSaved }: { event: EventRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: items, loading } = useLoad(() => get<InventoryItem[]>('/inventory'));
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const selected = items?.find((i) => i.id === itemId);

  const save = async () => {
    const q = Number(quantity);
    if (!itemId) return toast.error('Choose an item');
    if (!(q > 0)) return toast.error('Quantity must be positive');
    setSaving(true);
    try {
      await post(`/events/${event.id}/allocate`, { inventoryItemId: itemId, quantity: q });
      toast.success('Stock allocated');
      onSaved();
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
      title={`Allocate stock to ${event.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Allocate
          </Button>
        </>
      }
    >
      {loading && !items ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inventory item" className="sm:col-span-2">
            <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Select item…</option>
              {items?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({num(i.currentStock)} {i.unit} in stock)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity" hint={selected ? `${num(selected.currentStock)} ${selected.unit} available` : 'Moves stock out of the warehouse'}>
            <Input type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function RecordModal({ event, row, onClose, onSaved }: { event: EventRow; row: Allocation; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const remaining = row.quantityAllocated - row.quantitySold - row.quantityReturned;
  const [sold, setSold] = useState('');
  const [returned, setReturned] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const s = Number(sold || 0);
    const r = Number(returned || 0);
    if (s < 0 || r < 0) return toast.error('Values cannot be negative');
    if (s + r === 0) return toast.error('Enter sold and/or returned quantities');
    if (s + r > remaining) return toast.error(`Only ${num(remaining)} remain unaccounted for`);
    setSaving(true);
    try {
      await patch(`/events/${event.id}/inventory`, { inventoryItemId: row.inventoryItemId, sold: s, returned: r });
      toast.success('Recorded');
      onSaved();
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
      title={`${row.inventoryItem.name} at ${event.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        {num(remaining)} {row.inventoryItem.unit} still unaccounted for. Returned stock goes back into inventory.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sold">
          <Input type="number" min={0} step="any" value={sold} onChange={(e) => setSold(e.target.value)} autoFocus />
        </Field>
        <Field label="Returned to stock">
          <Input type="number" min={0} step="any" value={returned} onChange={(e) => setReturned(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
