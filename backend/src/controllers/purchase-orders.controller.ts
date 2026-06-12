import { Request, Response } from 'express';
import prisma from '../config/db';
import { StockService } from '../services/stock.service';

export const getPurchaseOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const pos = await prisma.purchaseOrder.findMany({ include: { supplier: true } });
    res.json({ success: true, data: pos });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { inventoryItem: true } }, supplier: true }
    });
    res.json({ success: true, data: po });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { items, ...poData } = req.body;
    const po = await prisma.purchaseOrder.create({
      data: {
        ...poData,
        items: { create: items }
      },
      include: { items: true }
    });
    res.status(201).json({ success: true, data: po });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const receivePurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { receivedItems } = req.body; // Array of { itemId (PurchaseOrderItem ID), quantity }

    await prisma.$transaction(async (tx) => {
      for (const item of receivedItems) {
        const poItem = await tx.purchaseOrderItem.findUnique({
          where: { id: item.itemId },
          include: { inventoryItem: true }
        });

        if (poItem) {
          // 1. Record Stock Movement
          await tx.stockMovement.create({
            data: {
              inventoryItemId: poItem.inventoryItemId,
              type: 'PURCHASE',
              quantity: item.quantity,
              referenceType: 'PO',
              referenceId: id,
              notes: `Received from PO #${id}`
            }
          });

          // 2. Update Inventory Stock
          await tx.inventoryItem.update({
            where: { id: poItem.inventoryItemId },
            data: { currentStock: { increment: item.quantity } }
          });

          // 3. Update PO Item received quantity
          await tx.purchaseOrderItem.update({
            where: { id: item.itemId },
            data: { quantityReceived: { increment: item.quantity } }
          });
        }
      }

      // Check if PO is fully received
      const updatedPo = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { items: true }
      });
      
      const allReceived = updatedPo?.items.every(i => i.quantityReceived >= i.quantityOrdered);
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: allReceived ? 'RECEIVED' : 'PARTIAL' }
      });
    });

    res.json({ success: true, message: 'Purchase order items received' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
