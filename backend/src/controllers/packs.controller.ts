import { Request, Response } from 'express';
import prisma from '../config/db';

export const getPacks = async (req: Request, res: Response): Promise<void> => {
  try {
    const packs = await prisma.pack.findMany({ include: { items: true } });
    res.json({ success: true, data: packs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getPack = async (req: Request, res: Response): Promise<void> => {
  try {
    const pack = await prisma.pack.findUnique({ 
      where: { id: req.params.id },
      include: { items: { include: { product: true } } }
    });
    if (!pack) {
      res.status(404).json({ success: false, error: 'Pack not found' });
      return;
    }
    res.json({ success: true, data: pack });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createPack = async (req: Request, res: Response): Promise<void> => {
  try {
    const { items, ...packData } = req.body;
    const pack = await prisma.pack.create({
      data: {
        ...packData,
        items: items ? { create: items } : undefined
      },
      include: { items: true }
    });
    res.status(201).json({ success: true, data: pack });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updatePack = async (req: Request, res: Response): Promise<void> => {
  try {
    const { items, ...packData } = req.body;
    
    // Simplest approach: delete old items and recreate
    if (items) {
      await prisma.packItem.deleteMany({ where: { packId: req.params.id } });
    }

    const pack = await prisma.pack.update({
      where: { id: req.params.id },
      data: {
        ...packData,
        items: items ? { create: items } : undefined
      },
      include: { items: true }
    });
    res.json({ success: true, data: pack });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const deletePack = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.pack.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Pack deleted' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
