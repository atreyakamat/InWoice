import type { Prisma } from '@prisma/client';
import { badRequest, notFound } from '../lib/errors';

type Tx = Prisma.TransactionClient;

export const MOVEMENT_TYPES = ['PURCHASE', 'PRODUCTION', 'SALE', 'ADJUSTMENT', 'RETURN', 'DAMAGE', 'EVENT'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

interface MovementInput {
  inventoryItemId: string;
  type: MovementType;
  quantity: number; // positive adds, negative removes
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

/** Record a raw-material movement and update the running stock level atomically (call inside a transaction). */
export async function recordMovement(tx: Tx, m: MovementInput) {
  if (!Number.isFinite(m.quantity) || m.quantity === 0) throw badRequest('Quantity must be a non-zero number');
  const item = await tx.inventoryItem.findUnique({ where: { id: m.inventoryItemId } });
  if (!item) throw notFound('Inventory item');
  const movement = await tx.stockMovement.create({
    data: {
      inventoryItemId: m.inventoryItemId,
      type: m.type,
      quantity: m.quantity,
      referenceType: m.referenceType ?? null,
      referenceId: m.referenceId ?? null,
      notes: m.notes ?? null,
    },
  });
  await tx.inventoryItem.update({
    where: { id: m.inventoryItemId },
    data: { currentStock: { increment: m.quantity } },
  });
  return movement;
}

interface StockLog {
  products: { productId: string; quantity: number }[];
  materials: { inventoryItemId: string; quantity: number }[];
}

/**
 * Commit stock for an issued invoice.
 *  - Finished goods (Product.stock) are used first.
 *  - Any shortfall on a product with a Bill of Materials is made-to-order:
 *    its raw materials are consumed instead.
 *  - Products without a BOM go negative, which surfaces as a backorder/low-stock alert.
 * Idempotent: does nothing if the invoice was already deducted.
 */
export async function commitStockForInvoice(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
  if (!invoice) throw notFound('Invoice');
  if (invoice.stockDeducted) return;

  // Expand packs into their component products.
  const demand = new Map<string, number>();
  for (const line of invoice.items) {
    if (!line.itemId) continue;
    if (line.type === 'PRODUCT') {
      demand.set(line.itemId, (demand.get(line.itemId) ?? 0) + line.quantity);
    } else if (line.type === 'PACK') {
      const packItems = await tx.packItem.findMany({ where: { packId: line.itemId } });
      for (const pi of packItems) {
        demand.set(pi.productId, (demand.get(pi.productId) ?? 0) + pi.quantity * line.quantity);
      }
    }
  }

  const log: StockLog = { products: [], materials: [] };
  for (const [productId, qty] of demand) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { bom: { include: { items: true } } },
    });
    if (!product) continue; // product deleted since the invoice was drafted

    const fromStock = product.bom?.items.length ? Math.min(Math.max(product.stock, 0), qty) : qty;
    const shortfall = qty - fromStock;
    if (fromStock > 0) {
      await tx.product.update({ where: { id: productId }, data: { stock: { decrement: fromStock } } });
      log.products.push({ productId, quantity: fromStock });
    }
    if (shortfall > 0 && product.bom) {
      for (const b of product.bom.items) {
        const used = b.quantityRequired * shortfall;
        await recordMovement(tx, {
          inventoryItemId: b.inventoryItemId,
          type: 'SALE',
          quantity: -used,
          referenceType: 'INVOICE',
          referenceId: invoice.id,
          notes: `Made to order: ${shortfall} x ${product.name} (${invoice.invoiceNumber})`,
        });
        log.materials.push({ inventoryItemId: b.inventoryItemId, quantity: used });
      }
    }
  }

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { stockDeducted: true, stockLog: JSON.stringify(log) },
  });
}

/** Reverse exactly what commitStockForInvoice deducted (used when an invoice is cancelled). */
export async function releaseStockForInvoice(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice?.stockDeducted) return;
  const log: StockLog = invoice.stockLog ? JSON.parse(invoice.stockLog) : { products: [], materials: [] };

  for (const p of log.products) {
    await tx.product.updateMany({ where: { id: p.productId }, data: { stock: { increment: p.quantity } } });
  }
  for (const m of log.materials) {
    const exists = await tx.inventoryItem.count({ where: { id: m.inventoryItemId } });
    if (!exists) continue;
    await recordMovement(tx, {
      inventoryItemId: m.inventoryItemId,
      type: 'RETURN',
      quantity: m.quantity,
      referenceType: 'INVOICE',
      referenceId: invoice.id,
      notes: `Invoice ${invoice.invoiceNumber} cancelled`,
    });
  }
  await tx.invoice.update({ where: { id: invoiceId }, data: { stockDeducted: false, stockLog: null } });
}
