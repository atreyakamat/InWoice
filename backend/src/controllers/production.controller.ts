import { Request, Response } from 'express';
import prisma from '../config/db';

export const getProductionBatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const batches = await prisma.productionBatch.findMany({
      include: { outputs: { include: { product: true } }, usages: { include: { inventoryItem: true } } }
    });
    res.json({ success: true, data: batches });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createProductionBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { outputs, usages, ...batchData } = req.body;
    
    // In a real scenario, this would be wrapped in a transaction 
    // to also deduct inventory (StockMovement)
    const batch = await prisma.productionBatch.create({
      data: {
        ...batchData,
        outputs: outputs ? { create: outputs } : undefined,
        usages: usages ? { create: usages } : undefined
      },
      include: { outputs: true, usages: true }
    });
    res.status(201).json({ success: true, data: batch });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
