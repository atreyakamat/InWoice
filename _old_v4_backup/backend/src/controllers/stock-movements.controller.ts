import { Request, Response } from 'express';
import prisma from '../config/db';
import { StockService } from '../services/stock.service';

export const getStockMovements = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = {};
    if (req.query.inventoryItemId) filter.inventoryItemId = req.query.inventoryItemId;
    if (req.query.type) filter.type = req.query.type;
    const movements = await prisma.stockMovement.findMany({
      where: filter,
      include: { inventoryItem: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: movements });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getMovementDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const movements = await prisma.stockMovement.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      include: { inventoryItem: true }
    });

    const totalIn = movements.filter(m => m.quantity > 0).reduce((sum, m) => sum + m.quantity, 0);
    const totalOut = movements.filter(m => m.quantity < 0).reduce((sum, m) => sum + Math.abs(m.quantity), 0);

    const byType: Record<string, number> = {};
    movements.forEach(m => {
      byType[m.type] = (byType[m.type] || 0) + Math.abs(m.quantity);
    });

    res.json({
      success: true,
      data: {
        totalIn,
        totalOut,
        byType,
        recentMovements: movements.slice(0, 10)
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const recordStockMovement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { inventoryItemId, type, quantity, referenceType, referenceId, notes } = req.body;
    const movement = await StockService.recordMovement(
      inventoryItemId,
      type,
      quantity,
      referenceType,
      referenceId,
      notes
    );
    res.status(201).json({ success: true, data: movement });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};