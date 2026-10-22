import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import { optEmail, optDate, optGstin, optStr, param, qs, round2 } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { recordMovement } from '../services/stock.service';

export const suppliersRouter = Router();
export const purchaseOrdersRouter = Router();
suppliersRouter.use(authenticate, authorize('procurement'));
purchaseOrdersRouter.use(authenticate, authorize('procurement'));

// --- Suppliers ----------------------------------------------------------------

const supplierInput = z.object({
  name: z.string().trim().min(1),
  phone: optStr,
  email: optEmail,
  address: optStr,
  gst: optGstin,
  state: optStr,
  paymentTerms: optStr,
  leadTime: z.union([z.literal(''), z.coerce.number().int().min(0)]).optional().nullable().transform((v) => (v === '' ? null : v)),
  notes: optStr,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

/** What is still owed to each supplier on open bills. */
async function owedBySupplier(supplierId?: string) {
  const rows = await prisma.bill.groupBy({
    by: ['supplierId'],
    where: { status: { in: ['PENDING', 'PARTIAL'] }, ...(supplierId ? { supplierId } : {}) },
    _sum: { grandTotal: true, amountPaid: true, amountDebited: true },
  });
  return new Map(rows.map((r) => [r.supplierId, round2((r._sum.grandTotal ?? 0) - (r._sum.amountPaid ?? 0) - (r._sum.amountDebited ?? 0))]));
}

suppliersRouter.get('/', async (_req, res) => {
  const [suppliers, owed] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { inventoryItems: true, purchaseOrders: true, bills: true } } },
    }),
    owedBySupplier(),
  ]);
  res.json({ success: true, data: suppliers.map((s) => ({ ...s, balanceDue: owed.get(s.id) ?? 0 })) });
});

suppliersRouter.get('/:id', async (req, res) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: param(req.params.id) },
    include: {
      inventoryItems: { where: { isActive: true } },
      purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 20 },
      bills: { orderBy: { date: 'desc' }, take: 20, select: { id: true, billNumber: true, date: true, dueDate: true, grandTotal: true, amountPaid: true, amountDebited: true, status: true } },
    },
  });
  if (!supplier) throw notFound('Supplier');
  const owed = await owedBySupplier(supplier.id);
  res.json({ success: true, data: { ...supplier, balanceDue: owed.get(supplier.id) ?? 0 } });
});

suppliersRouter.post('/', async (req, res) => {
  res.status(201).json({ success: true, data: await prisma.supplier.create({ data: supplierInput.parse(req.body) }) });
});

suppliersRouter.put('/:id', async (req, res) => {
  const supplier = await prisma.supplier.update({ where: { id: param(req.params.id) }, data: supplierInput.partial().parse(req.body) });
  res.json({ success: true, data: supplier });
});

suppliersRouter.delete('/:id', async (req, res) => {
  const id = param(req.params.id);
  if ((await prisma.purchaseOrder.count({ where: { supplierId: id } })) || (await prisma.bill.count({ where: { supplierId: id } }))) {
    await prisma.supplier.update({ where: { id }, data: { status: 'INACTIVE' } });
    res.json({ success: true, message: 'Supplier has orders or bills, so it was marked inactive' });
    return;
  }
  await prisma.supplier.delete({ where: { id } });
  res.json({ success: true, message: 'Supplier deleted' });
});

// --- Purchase orders -------------------------------------------------------------

const poInput = z.object({
  supplierId: z.string().uuid(),
  expectedAt: optDate,
  notes: optStr,
  status: z.enum(['DRAFT', 'ORDERED']).default('DRAFT'),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().uuid(),
        quantityOrdered: z.coerce.number().positive(),
        unitPrice: z.coerce.number().min(0).default(0),
      }),
    )
    .min(1, 'Add at least one item'),
});

const poInclude = {
  supplier: { select: { id: true, name: true } },
  items: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } } },
  bills: { where: { status: { not: 'CANCELLED' } }, select: { id: true, billNumber: true, grandTotal: true, status: true } },
};

async function nextPoNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${year}-` } } });
  return `PO-${year}-${String(count + 1).padStart(4, '0')}`;
}

purchaseOrdersRouter.get('/', async (req, res) => {
  const pos = await prisma.purchaseOrder.findMany({
    where: qs(req.query.status) ? { status: qs(req.query.status) } : {},
    include: poInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: pos });
});

purchaseOrdersRouter.get('/:id', async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: param(req.params.id) }, include: poInclude });
  if (!po) throw notFound('Purchase order');
  res.json({ success: true, data: po });
});

purchaseOrdersRouter.post('/', async (req, res) => {
  const data = poInput.parse(req.body);
  if (!(await prisma.supplier.count({ where: { id: data.supplierId } }))) throw notFound('Supplier');
  const ids = data.items.map((i) => i.inventoryItemId);
  if (new Set(ids).size !== ids.length) throw badRequest('Each material can appear only once per order. Combine the quantities into one line.');
  const items = data.items.map((i) => ({ ...i, totalPrice: round2(i.quantityOrdered * i.unitPrice) }));
  // Retry once if two POs race for the same number.
  for (let attempt = 0; ; attempt++) {
    try {
      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber: await nextPoNumber(),
          supplierId: data.supplierId,
          status: data.status,
          expectedAt: data.expectedAt,
          notes: data.notes,
          totalAmount: round2(items.reduce((s, i) => s + i.totalPrice, 0)),
          items: { create: items },
        },
        include: poInclude,
      });
      res.status(201).json({ success: true, data: po });
      return;
    } catch (err) {
      if (attempt >= 2 || (err as { code?: string }).code !== 'P2002') throw err;
    }
  }
});

purchaseOrdersRouter.patch('/:id/status', async (req, res) => {
  const { status } = z.object({ status: z.enum(['DRAFT', 'ORDERED', 'CANCELLED']) }).parse(req.body);
  const po = await prisma.purchaseOrder.findUnique({ where: { id: param(req.params.id) } });
  if (!po) throw notFound('Purchase order');
  if (['RECEIVED', 'PARTIAL'].includes(po.status) && status !== 'ORDERED') {
    throw conflict('Goods have already been received on this order');
  }
  const updated = await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status }, include: poInclude });
  res.json({ success: true, data: updated });
});

/** Receive goods: adds stock via PURCHASE movements and updates line + order status. */
purchaseOrdersRouter.post('/:id/receive', async (req, res) => {
  const { items } = z
    .object({
      items: z
        .array(z.object({ inventoryItemId: z.string().uuid(), quantity: z.coerce.number().positive() }))
        .min(1),
    })
    .parse(req.body);
  const id = param(req.params.id);

  const po = await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw notFound('Purchase order');
    if (order.status === 'CANCELLED') throw badRequest('Cannot receive a cancelled order');
    if (order.status === 'RECEIVED') throw badRequest('This order has already been fully received');

    for (const rec of items) {
      const line = order.items.find((l) => l.inventoryItemId === rec.inventoryItemId);
      if (!line) throw badRequest('Item is not part of this order');
      await tx.purchaseOrderItem.update({ where: { id: line.id }, data: { quantityReceived: { increment: rec.quantity } } });
      await recordMovement(tx, {
        inventoryItemId: rec.inventoryItemId,
        type: 'PURCHASE',
        quantity: rec.quantity,
        referenceType: 'PURCHASE_ORDER',
        referenceId: order.id,
        notes: `Received on ${order.poNumber}`,
      });
      // Keep the item's cost current with what we actually paid.
      if (line.unitPrice > 0) await tx.inventoryItem.update({ where: { id: rec.inventoryItemId }, data: { costPerUnit: line.unitPrice } });
    }
    const lines = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const status = lines.every((l) => l.quantityReceived >= l.quantityOrdered) ? 'RECEIVED' : 'PARTIAL';
    return tx.purchaseOrder.update({ where: { id }, data: { status }, include: poInclude });
  });
  res.json({ success: true, data: po });
});

purchaseOrdersRouter.delete('/:id', async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: param(req.params.id) } });
  if (!po) throw notFound('Purchase order');
  if (po.status !== 'DRAFT') throw badRequest('Only draft orders can be deleted. Cancel it instead.');
  await prisma.purchaseOrder.delete({ where: { id: po.id } });
  res.json({ success: true, message: 'Purchase order deleted' });
});
