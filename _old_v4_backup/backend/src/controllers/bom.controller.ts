import { Request, Response } from 'express';
import prisma from '../config/db';

export const getBOM = async (req: Request, res: Response): Promise<void> => {
  try {
    const bom = await prisma.productBOM.findUnique({
      where: { productId: req.params.productId },
      include: { items: { include: { inventoryItem: true } } }
    });
    res.json({ success: true, data: bom });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateBOM = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    const { items } = req.body; // Array of { inventoryItemId, quantityRequired }

    const bom = await prisma.productBOM.upsert({
      where: { productId },
      create: {
        productId,
        items: { create: items }
      },
      update: {
        items: {
          deleteMany: {}, // Clear old items
          create: items
        }
      },
      include: { items: true }
    });

    res.json({ success: true, data: bom });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
