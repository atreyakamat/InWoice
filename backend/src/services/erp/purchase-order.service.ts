import prisma from '../../prisma/client';
import { z } from 'zod';
// Simplified error handling – using generic Error

export const purchaseOrderItemSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantityOrdered: z.number().positive(),
  unitPrice: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  status: z.enum(['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED']).optional(),
  poNumber: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(purchaseOrderItemSchema).min(1),
});

export class PurchaseOrderService {
  static async create(payload: z.infer<typeof purchaseOrderSchema>) {
    const { supplierId, status = 'DRAFT', poNumber, notes, items } = payload;
    return prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          supplierId,
          status,
          poNumber,
          notes,
        },
      });
      const lineItems = items.map((it) => ({
        purchaseOrderId: po.id,
        inventoryItemId: it.inventoryItemId,
        quantityOrdered: it.quantityOrdered,
        unitPrice: it.unitPrice ?? 0,
        totalPrice: (it.unitPrice ?? 0) * it.quantityOrdered,
        notes: it.notes,
      }));
      await tx.purchaseOrderItem.createMany({ data: lineItems });
      return po;
    });
  }

  static async receive(poId: string, receivedItems: { inventoryItemId: string; quantity: number }[]) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });
    if (!po) throw new NotFoundError('Purchase order not found');
    if (po.status === 'CANCELLED') throw new BadRequestError('Cannot receive a cancelled PO');

    await prisma.$transaction(async (tx) => {
      for (const rec of receivedItems) {
        const line = po.items.find((i) => i.inventoryItemId === rec.inventoryItemId);
        if (!line) continue;
        const newReceived = line.quantityReceived + rec.quantity;
        await tx.purchaseOrderItem.update({
          where: { id: line.id },
          data: { quantityReceived: newReceived },
        });
        // Record inbound stock movement and update inventory
        await tx.stockMovement.create({
          data: {
            inventoryItemId: rec.inventoryItemId,
            type: 'PURCHASE',
            quantity: rec.quantity,
            referenceType: 'PURCHASE_ORDER',
            referenceId: po.id,
            notes: 'Received from supplier',
          },
        });
        await tx.inventoryItem.update({
          where: { id: rec.inventoryItemId },
          data: { currentStock: { increment: rec.quantity } },
        });
      }

      // Update PO status based on receipts
      const allReceived = po.items.every((i) => i.quantityReceived >= i.quantityOrdered);
      const anyReceived = po.items.some((i) => i.quantityReceived > 0);
      const newStatus = allReceived
        ? 'RECEIVED'
        : anyReceived
        ? 'PARTIAL'
        : po.status;
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: newStatus } });
    });
    return { success: true };
  }

  static async list(filter?: { status?: string }) {
    const where = filter?.status ? { status: filter.status } : undefined;
    return prisma.purchaseOrder.findMany({ where, include: { supplier: true, items: true } });
  }
}
