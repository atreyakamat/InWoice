import { Request, Response } from 'express';
import { InventoryService } from '../services/erp/inventory.service';
import { StockService } from '../services/stock.service';

export const getInventoryItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = {};
    if (req.query.category) filter.category = req.query.category as string;
    if (req.query.lowStock) filter.lowStockOnly = req.query.lowStock === 'true';
    if (req.query.search) filter.search = req.query.search as string;
    const items = await InventoryService.list(filter);
    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await InventoryService.getById(req.params.id);
    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(404).json({ success: false, error: error.message });
  }
};

export const createInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await InventoryService.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updateInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await InventoryService.update(req.params.id, req.body);
    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const deleteInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    await InventoryService.update(req.params.id, { currentStock: 0 }); // soft delete by zeroing stock
    res.json({ success: true, message: 'Item deleted' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const adjustStock = async (req: Request, res: Response): Promise<void> => {
  try {
    const { delta, notes } = req.body;
    const movement = await StockService.recordMovement(
      req.params.id,
      'ADJUSTMENT',
      delta,
      'MANUAL_ADJUST',
      null,
      notes
    );
    res.json({ success: true, data: movement });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getInventoryDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await InventoryService.getDashboardSummary();
    res.json({ success: true, data: summary });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
