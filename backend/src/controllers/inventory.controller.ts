import { Request, Response } from 'express';
import prisma from '../config/db';

export const getInventoryItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const items = await prisma.inventoryItem.findMany({ include: { supplier: true } });
    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await prisma.inventoryItem.create({ data: req.body });
    res.status(201).json({ success: true, data: item });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updateInventoryItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
