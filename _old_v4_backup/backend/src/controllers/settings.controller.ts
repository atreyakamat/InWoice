import { Request, Response } from 'express';
import prisma from '../config/db';

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    let settings = await prisma.businessSettings.findFirst();
    if (!settings) {
      settings = await prisma.businessSettings.create({
        data: { businessName: 'My Business' }
      });
    }
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    let settings = await prisma.businessSettings.findFirst();
    if (!settings) {
      settings = await prisma.businessSettings.create({
        data: { businessName: req.body.businessName || 'My Business', ...req.body }
      });
    } else {
      settings = await prisma.businessSettings.update({
        where: { id: settings.id },
        data: req.body
      });
    }
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
