import { Request, Response } from 'express';
import prisma from '../config/db';
import { StockService } from '../services/stock.service';
import { PurchaseOrderService } from '../services/erp/purchase-order.service';

export const getPurchaseOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = {};
    if (req.query.status) filter.status = req.query.status;
    const pos = await prisma.purchaseOrder.findMany({
      where: filter,
      include: { supplier: true, items: true },
      orderBy: { createdAt: 'desc' }
    });
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
    const po = await PurchaseOrderService.create(req.body);
    res.status(201).json({ success: true, data: po });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const receivePurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { receivedItems } = req.body;
    await PurchaseOrderService.receive(id, receivedItems);
    res.json({ success: true, message: 'Purchase order items received' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getPurchaseOrderDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const pos = await prisma.purchaseOrder.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      include: { items: true, supplier: true }
    });

    const totalOrders = pos.length;
    const totalSpent = pos.reduce((sum, po) => sum + (po.items.reduce((s, item) => s + (item.unitPrice * item.quantityOrdered), 0)), 0);
    const pendingOrders = pos.filter(po => po.status === 'ORDERED' || po.status === 'PARTIAL').length;
    const receivedOrders = pos.filter(po => po.status === 'RECEIVED').length;

    res.json({
      success: true,
      data: {
        totalOrders,
        totalSpent,
        pendingOrders,
        receivedOrders,
        recentOrders: pos.slice(0, 10)
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
