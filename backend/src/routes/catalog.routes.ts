import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { notFound } from '../lib/errors';
import { optStr, param, qs } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';

// Products and Packs (bundles of products sold as one line).
export const productsRouter = Router();
export const packsRouter = Router();
productsRouter.use(authenticate, authorize('catalog'));
packsRouter.use(authenticate, authorize('catalog'));

const productInput = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  sku: optStr,
  description: optStr,
  category: optStr,
  material: optStr,
  finish: optStr,
  size: optStr,
  shape: optStr,
  isWaterproof: z.boolean().optional(),
  price: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0).optional(),
  hsnCode: optStr,
  taxRate: z.union([z.literal(''), z.coerce.number().min(0).max(100)]).optional().nullable().transform((v) => (v === '' ? null : v)),
  stock: z.coerce.number().int().optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  imageUrl: optStr,
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

productsRouter.get('/', async (req, res) => {
  const search = qs(req.query.search);
  const where: Prisma.ProductWhereInput = {
    ...(req.query.includeArchived === 'true' ? {} : { status: 'ACTIVE' }),
    ...(qs(req.query.category) ? { category: qs(req.query.category) } : {}),
    ...(search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] }
      : {}),
  };
  const products = await prisma.product.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { bom: { select: { id: true, _count: { select: { items: true } } } } },
  });
  res.json({ success: true, data: products });
});

productsRouter.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: param(req.params.id) },
    include: { bom: { include: { items: { include: { inventoryItem: true } } } } },
  });
  if (!product) throw notFound('Product');
  res.json({ success: true, data: product });
});

productsRouter.post('/', async (req, res) => {
  const product = await prisma.product.create({ data: productInput.parse(req.body) });
  res.status(201).json({ success: true, data: product });
});

productsRouter.put('/:id', async (req, res) => {
  const product = await prisma.product.update({
    where: { id: param(req.params.id) },
    data: productInput.partial().parse(req.body),
  });
  res.json({ success: true, data: product });
});

/** Products referenced by invoices are archived (history must keep working); unused ones are deleted. */
productsRouter.delete('/:id', async (req, res) => {
  const id = param(req.params.id);
  const used = await prisma.invoiceItem.count({ where: { itemId: id } });
  const produced = await prisma.productionOutput.count({ where: { productId: id } });
  if (used > 0 || produced > 0) {
    await prisma.product.update({ where: { id }, data: { status: 'ARCHIVED' } });
    res.json({ success: true, message: 'Product is used in past records, so it was archived instead of deleted' });
    return;
  }
  await prisma.product.delete({ where: { id } });
  res.json({ success: true, message: 'Product deleted' });
});

// --- Packs ------------------------------------------------------------------

const packInput = z.object({
  name: z.string().trim().min(1),
  description: optStr,
  price: z.coerce.number().min(0),
  hsnCode: optStr,
  taxRate: z.union([z.literal(''), z.coerce.number().min(0).max(100)]).optional().nullable().transform((v) => (v === '' ? null : v)),
  imageUrl: optStr,
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().int().positive() }))
    .optional(),
});

const packInclude = { items: { include: { product: { select: { id: true, name: true, price: true, stock: true } } } } };

/** Merge duplicate product rows so the (packId, productId) unique constraint never fails. */
const mergeItems = (items: { productId: string; quantity: number }[]) => {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(i.productId, (m.get(i.productId) ?? 0) + i.quantity));
  return [...m].map(([productId, quantity]) => ({ productId, quantity }));
};

packsRouter.get('/', async (req, res) => {
  const packs = await prisma.pack.findMany({
    where: req.query.includeArchived === 'true' ? {} : { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    include: packInclude,
  });
  res.json({
    success: true,
    data: packs.map((p) => ({
      ...p,
      // How many complete packs current product stock can make.
      availableStock: p.items.length ? Math.max(0, Math.min(...p.items.map((i) => Math.floor(i.product.stock / i.quantity)))) : 0,
      componentValue: p.items.reduce((s, i) => s + i.product.price * i.quantity, 0),
    })),
  });
});

packsRouter.get('/:id', async (req, res) => {
  const pack = await prisma.pack.findUnique({ where: { id: param(req.params.id) }, include: packInclude });
  if (!pack) throw notFound('Pack');
  res.json({ success: true, data: pack });
});

packsRouter.post('/', async (req, res) => {
  const { items, ...data } = packInput.parse(req.body);
  const pack = await prisma.pack.create({
    data: { ...data, items: items?.length ? { create: mergeItems(items) } : undefined },
    include: packInclude,
  });
  res.status(201).json({ success: true, data: pack });
});

packsRouter.put('/:id', async (req, res) => {
  const id = param(req.params.id);
  const { items, ...data } = packInput.partial().parse(req.body);
  const pack = await prisma.$transaction(async (tx) => {
    if (items) await tx.packItem.deleteMany({ where: { packId: id } });
    return tx.pack.update({
      where: { id },
      data: { ...data, items: items ? { create: mergeItems(items) } : undefined },
      include: packInclude,
    });
  });
  res.json({ success: true, data: pack });
});

packsRouter.delete('/:id', async (req, res) => {
  const id = param(req.params.id);
  const used = await prisma.invoiceItem.count({ where: { itemId: id } });
  if (used > 0) {
    await prisma.pack.update({ where: { id }, data: { status: 'ARCHIVED' } });
    res.json({ success: true, message: 'Pack is used in past invoices, so it was archived instead of deleted' });
    return;
  }
  const exists = await prisma.pack.count({ where: { id } });
  if (!exists) throw notFound('Pack');
  await prisma.pack.delete({ where: { id } });
  res.json({ success: true, message: 'Pack deleted' });
});
