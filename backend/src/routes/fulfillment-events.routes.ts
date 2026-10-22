import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { optDate, optStr, param, qs } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { recordMovement } from '../services/stock.service';

export const fulfillmentRouter = Router();
export const eventsRouter = Router();
fulfillmentRouter.use(authenticate, authorize('inventory'));
eventsRouter.use(authenticate, authorize('inventory'));

// --- Fulfillment (created automatically when an invoice is issued) -------------

const FULFILLMENT_STATUSES = ['PENDING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED'] as const;

fulfillmentRouter.get('/', async (req, res) => {
  const status = qs(req.query.status);
  const fulfillments = await prisma.fulfillment.findMany({
    where: status === 'OPEN' ? { status: { in: ['PENDING', 'PACKING', 'PACKED', 'SHIPPED'] } } : status ? { status } : {},
    include: {
      invoice: { select: { id: true, invoiceNumber: true, grandTotal: true, status: true, customer: { select: { name: true, phone: true, address: true, city: true } } } },
      shipmentRecords: { orderBy: { timestamp: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  res.json({ success: true, data: fulfillments });
});

fulfillmentRouter.patch('/:id', async (req, res) => {
  const data = z
    .object({
      status: z.enum(FULFILLMENT_STATUSES),
      trackingNumber: optStr,
      courier: optStr,
      estimatedDelivery: optDate,
      notes: optStr,
    })
    .parse(req.body);
  const id = param(req.params.id);
  const existing = await prisma.fulfillment.findUnique({ where: { id } });
  if (!existing) throw notFound('Fulfillment');
  // Absent fields are left as-is; fields sent as "" are cleared (zod maps them to null).
  const fulfillment = await prisma.fulfillment.update({
    where: { id },
    data: {
      status: data.status,
      trackingNumber: data.trackingNumber,
      courier: data.courier,
      estimatedDelivery: data.estimatedDelivery,
      notes: data.notes,
      actualDelivery: data.status === 'DELIVERED' && existing.status !== 'DELIVERED' ? new Date() : existing.actualDelivery,
      ...(data.status !== existing.status || data.notes
        ? { shipmentRecords: { create: { status: data.status, notes: data.notes ?? `Status changed to ${data.status}` } } }
        : {}),
    },
    include: { shipmentRecords: { orderBy: { timestamp: 'desc' } } },
  });
  res.json({ success: true, data: fulfillment });
});

// --- Events / pop-up stalls -------------------------------------------------------

const eventInclude = { inventory: { include: { inventoryItem: { select: { id: true, name: true, unit: true, currentStock: true } } } } };

eventsRouter.get('/', async (_req, res) => {
  const events = await prisma.event.findMany({ orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], include: eventInclude });
  res.json({ success: true, data: events });
});

eventsRouter.get('/:id', async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: param(req.params.id) }, include: eventInclude });
  if (!event) throw notFound('Event');
  res.json({ success: true, data: event });
});

const eventInput = z.object({
  name: z.string().trim().min(1),
  location: optStr,
  startDate: optDate,
  endDate: optDate,
  notes: optStr,
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
});

eventsRouter.post('/', async (req, res) => {
  const event = await prisma.event.create({ data: eventInput.parse(req.body), include: eventInclude });
  res.status(201).json({ success: true, data: event });
});

eventsRouter.put('/:id', async (req, res) => {
  const event = await prisma.event.update({ where: { id: param(req.params.id) }, data: eventInput.partial().parse(req.body), include: eventInclude });
  res.json({ success: true, data: event });
});

/** Allocate stock to an event (moves it out of the warehouse). */
eventsRouter.post('/:id/allocate', async (req, res) => {
  const id = param(req.params.id);
  const { inventoryItemId, quantity } = z
    .object({ inventoryItemId: z.string().uuid(), quantity: z.coerce.number().positive() })
    .parse(req.body);
  await prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id } });
    if (!event) throw notFound('Event');
    if (['COMPLETED', 'CANCELLED'].includes(event.status)) throw badRequest('Event is closed');
    const item = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item) throw notFound('Inventory item');
    if (item.currentStock < quantity) throw badRequest(`Only ${item.currentStock} ${item.unit} of ${item.name} in stock`);
    await recordMovement(tx, { inventoryItemId, type: 'EVENT', quantity: -quantity, referenceType: 'EVENT', referenceId: id, notes: `Allocated to ${event.name}` });
    await tx.eventInventory.upsert({
      where: { eventId_inventoryItemId: { eventId: id, inventoryItemId } },
      update: { quantityAllocated: { increment: quantity } },
      create: { eventId: id, inventoryItemId, quantityAllocated: quantity },
    });
  });
  res.json({ success: true, data: await prisma.event.findUnique({ where: { id }, include: eventInclude }) });
});

/** Record sales and/or returns for an allocated item. Returns go back into stock. */
eventsRouter.patch('/:id/inventory', async (req, res) => {
  const id = param(req.params.id);
  const { inventoryItemId, sold, returned } = z
    .object({
      inventoryItemId: z.string().uuid(),
      sold: z.coerce.number().min(0).default(0),
      returned: z.coerce.number().min(0).default(0),
    })
    .parse(req.body);
  await prisma.$transaction(async (tx) => {
    const row = await tx.eventInventory.findUnique({ where: { eventId_inventoryItemId: { eventId: id, inventoryItemId } } });
    if (!row) throw notFound('Allocation');
    const remaining = row.quantityAllocated - row.quantitySold - row.quantityReturned;
    if (sold + returned > remaining + 1e-9) throw badRequest(`Only ${remaining} remain unaccounted for at this event`);
    await tx.eventInventory.update({
      where: { id: row.id },
      data: { quantitySold: { increment: sold }, quantityReturned: { increment: returned } },
    });
    if (returned > 0) {
      await recordMovement(tx, { inventoryItemId, type: 'RETURN', quantity: returned, referenceType: 'EVENT', referenceId: id, notes: 'Returned from event' });
    }
  });
  res.json({ success: true, data: await prisma.event.findUnique({ where: { id }, include: eventInclude }) });
});

eventsRouter.delete('/:id', async (req, res) => {
  const id = param(req.params.id);
  if (await prisma.eventInventory.count({ where: { eventId: id } })) {
    throw badRequest('This event has stock allocated. Mark it cancelled instead.');
  }
  await prisma.event.delete({ where: { id } });
  res.json({ success: true, message: 'Event deleted' });
});
