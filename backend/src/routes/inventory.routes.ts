import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { notFound } from '../lib/errors';
import { optStr, pagination, param, qs, round2 } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { MOVEMENT_TYPES, recordMovement } from '../services/stock.service';

// Raw materials, packaging and consumables (finished goods live on Product.stock).
export const inventoryRouter = Router();
export const stockMovementsRouter = Router();
inventoryRouter.use(authenticate, authorize('inventory'));
stockMovementsRouter.use(authenticate, authorize('inventory'));

const itemInput = z.object({
  name: z.string().trim().min(1),
  sku: optStr,
  category: z.string().trim().min(1).default('RAW_MATERIAL'),
  unit: z.string().trim().min(1).default('unit'),
  currentStock: z.coerce.number().min(0).optional(),
  minimumStock: z.coerce.number().min(0).optional(),
  reorderLevel: z.coerce.number().min(0).optional(),
  costPerUnit: z.coerce.number().min(0).optional(),
  supplierId: z.union([z.literal(''), z.string().uuid()]).optional().nullable().transform((v) => (v === undefined ? undefined : v ? v : null)),
  location: optStr,
  notes: optStr,
});

inventoryRouter.get('/', async (req, res) => {
  const search = qs(req.query.search);
  const where: Prisma.InventoryItemWhereInput = {
    isActive: true,
    ...(qs(req.query.category) ? { category: qs(req.query.category) } : {}),
    ...(search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] }
      : {}),
  };
  let items = await prisma.inventoryItem.findMany({ where, orderBy: { name: 'asc' }, include: { supplier: { select: { id: true, name: true } } } });
  if (req.query.lowStock === 'true') items = items.filter((i) => i.currentStock <= Math.max(i.reorderLevel, i.minimumStock));
  res.json({ success: true, data: items });
});

inventoryRouter.get('/dashboard', async (_req, res) => {
  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    select: { id: true, name: true, unit: true, currentStock: true, minimumStock: true, reorderLevel: true, costPerUnit: true },
  });
  const consumption = await prisma.stockMovement.groupBy({
    by: ['inventoryItemId'],
    where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, quantity: { lt: 0 } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'asc' } },
    take: 5,
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  res.json({
    success: true,
    data: {
      totalItems: items.length,
      totalValue: round2(items.reduce((s, i) => s + i.currentStock * i.costPerUnit, 0)),
      lowStockCount: items.filter((i) => i.currentStock > 0 && i.currentStock <= Math.max(i.reorderLevel, i.minimumStock)).length,
      outOfStockCount: items.filter((i) => i.currentStock <= 0).length,
      mostConsumed: consumption
        .map((c) => ({ ...byId.get(c.inventoryItemId), consumedQty: Math.abs(c._sum.quantity ?? 0) }))
        .filter((c) => c.name),
    },
  });
});

inventoryRouter.get('/:id', async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: param(req.params.id) },
    include: { supplier: true, stockMovements: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!item) throw notFound('Inventory item');
  res.json({ success: true, data: item });
});

inventoryRouter.post('/', async (req, res) => {
  const { currentStock, ...data } = itemInput.parse(req.body);
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({ data: { ...data, currentStock: 0 } });
    // Opening stock is recorded as a movement so the audit trail adds up.
    if (currentStock && currentStock > 0) {
      await recordMovement(tx, { inventoryItemId: created.id, type: 'ADJUSTMENT', quantity: currentStock, notes: 'Opening stock' });
    }
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
  });
  res.status(201).json({ success: true, data: item });
});

inventoryRouter.put('/:id', async (req, res) => {
  // Stock levels change only through movements, never by direct edit.
  const { currentStock: _ignored, ...data } = itemInput.partial().parse(req.body);
  const item = await prisma.inventoryItem.update({ where: { id: param(req.params.id) }, data });
  res.json({ success: true, data: item });
});

inventoryRouter.post('/:id/adjust', async (req, res) => {
  const body = z
    .object({
      delta: z.coerce.number().refine((v) => v !== 0, 'Adjustment cannot be zero'),
      type: z.enum(MOVEMENT_TYPES).default('ADJUSTMENT'),
      notes: optStr,
    })
    .parse(req.body);
  const movement = await prisma.$transaction((tx) =>
    recordMovement(tx, { inventoryItemId: param(req.params.id), type: body.type, quantity: body.delta, referenceType: 'MANUAL', notes: body.notes }),
  );
  res.status(201).json({ success: true, data: movement });
});

/** Soft delete: the item disappears from lists but its history stays intact. */
inventoryRouter.delete('/:id', async (req, res) => {
  await prisma.inventoryItem.update({ where: { id: param(req.params.id) }, data: { isActive: false } });
  res.json({ success: true, message: 'Item archived' });
});

stockMovementsRouter.get('/', async (req, res) => {
  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(qs(req.query.inventoryItemId) ? { inventoryItemId: qs(req.query.inventoryItemId) } : {}),
      ...(qs(req.query.type) ? { type: qs(req.query.type) } : {}),
    },
    include: { inventoryItem: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: 'desc' },
    ...pagination(req.query),
  });
  res.json({ success: true, data: movements });
});
