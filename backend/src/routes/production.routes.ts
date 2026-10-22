import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { optStr, param } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { recordMovement } from '../services/stock.service';

// Bill of Materials (what raw materials one unit of a product needs) and
// production batches (turn raw materials into finished product stock).
export const bomRouter = Router();
export const productionRouter = Router();
bomRouter.use(authenticate, authorize('inventory'));
productionRouter.use(authenticate, authorize('inventory'));

bomRouter.get('/:productId', async (req, res) => {
  const productId = param(req.params.productId);
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, price: true, costPrice: true } });
  if (!product) throw notFound('Product');
  const bom = await prisma.productBOM.findUnique({
    where: { productId },
    include: { items: { include: { inventoryItem: { select: { id: true, name: true, unit: true, costPerUnit: true, currentStock: true } } } } },
  });
  const items = bom?.items ?? [];
  res.json({
    success: true,
    data: {
      product,
      items,
      materialCost: items.reduce((s, i) => s + i.quantityRequired * i.inventoryItem.costPerUnit, 0),
      // Units producible with current material stock.
      producible: items.length ? Math.floor(Math.min(...items.map((i) => i.inventoryItem.currentStock / i.quantityRequired))) : null,
    },
  });
});

bomRouter.put('/:productId', async (req, res) => {
  const productId = param(req.params.productId);
  const { items } = z
    .object({
      items: z.array(z.object({ inventoryItemId: z.string().uuid(), quantityRequired: z.coerce.number().positive() })),
    })
    .parse(req.body);
  if (!(await prisma.product.count({ where: { id: productId } }))) throw notFound('Product');
  await prisma.$transaction(async (tx) => {
    const bom = await tx.productBOM.upsert({ where: { productId }, update: {}, create: { productId } });
    await tx.bOMItem.deleteMany({ where: { bomId: bom.id } });
    if (items.length) await tx.bOMItem.createMany({ data: items.map((i) => ({ ...i, bomId: bom.id })) });
  });
  res.json({ success: true, message: 'Bill of materials saved' });
});

// --- Production batches -------------------------------------------------------

const batchInclude = {
  outputs: { include: { product: { select: { id: true, name: true } } } },
  usages: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } } },
};

productionRouter.get('/', async (_req, res) => {
  const batches = await prisma.productionBatch.findMany({ orderBy: { createdAt: 'desc' }, include: batchInclude, take: 200 });
  res.json({ success: true, data: batches });
});

productionRouter.post('/', async (req, res) => {
  const data = z
    .object({
      batchNumber: optStr,
      notes: optStr,
      outputs: z.array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().int().positive() })).min(1),
      complete: z.boolean().optional(),
    })
    .parse(req.body);
  const count = await prisma.productionBatch.count();
  const batch = await prisma.productionBatch.create({
    data: {
      batchNumber: data.batchNumber ?? `BATCH-${String(count + 1).padStart(4, '0')}`,
      notes: data.notes,
      status: 'PLANNED',
      outputs: { create: data.outputs.map((o) => ({ productId: o.productId, quantityProduced: o.quantity })) },
    },
  });
  if (!data.complete) {
    res.status(201).json({ success: true, data: await prisma.productionBatch.findUniqueOrThrow({ where: { id: batch.id }, include: batchInclude }) });
    return;
  }
  // "Produce now": if it cannot be completed, don't leave a stray planned batch behind.
  let result;
  try {
    result = await completeBatch(batch.id);
  } catch (err) {
    await prisma.productionBatch.delete({ where: { id: batch.id } }).catch(() => undefined);
    throw err;
  }
  res.status(201).json({ success: true, data: result });
});

/** Consume BOM materials and add finished goods to product stock, atomically. */
async function completeBatch(id: string) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.productionBatch.findUnique({ where: { id }, include: { outputs: true } });
    if (!batch) throw notFound('Production batch');
    if (batch.status !== 'PLANNED') throw badRequest(`Batch is already ${batch.status.toLowerCase()}`);

    // Aggregate material requirements across all outputs, then check availability first.
    const need = new Map<string, number>();
    for (const out of batch.outputs) {
      const bom = await tx.productBOM.findUnique({ where: { productId: out.productId }, include: { items: true } });
      for (const b of bom?.items ?? []) {
        need.set(b.inventoryItemId, (need.get(b.inventoryItemId) ?? 0) + b.quantityRequired * out.quantityProduced);
      }
    }
    const shortages: string[] = [];
    for (const [itemId, qty] of need) {
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
      if (item.currentStock < qty) shortages.push(`${item.name}: need ${qty} ${item.unit}, have ${item.currentStock}`);
    }
    if (shortages.length) throw badRequest(`Not enough materials. ${shortages.join('; ')}`, shortages);

    for (const [itemId, qty] of need) {
      await recordMovement(tx, {
        inventoryItemId: itemId,
        type: 'PRODUCTION',
        quantity: -qty,
        referenceType: 'BATCH',
        referenceId: batch.id,
        notes: `Used in ${batch.batchNumber}`,
      });
      await tx.productionUsage.create({ data: { productionBatchId: batch.id, inventoryItemId: itemId, quantityConsumed: qty } });
    }
    for (const out of batch.outputs) {
      await tx.product.update({ where: { id: out.productId }, data: { stock: { increment: out.quantityProduced } } });
    }
    return tx.productionBatch.update({
      where: { id },
      data: { status: 'COMPLETED', startDate: batch.startDate ?? new Date(), endDate: new Date() },
      include: batchInclude,
    });
  });
}

productionRouter.post('/:id/complete', async (req, res) => {
  res.json({ success: true, data: await completeBatch(param(req.params.id)) });
});

productionRouter.post('/:id/cancel', async (req, res) => {
  const batch = await prisma.productionBatch.findUnique({ where: { id: param(req.params.id) } });
  if (!batch) throw notFound('Production batch');
  if (batch.status !== 'PLANNED') throw badRequest('Only planned batches can be cancelled');
  const updated = await prisma.productionBatch.update({ where: { id: batch.id }, data: { status: 'CANCELLED' }, include: batchInclude });
  res.json({ success: true, data: updated });
});
