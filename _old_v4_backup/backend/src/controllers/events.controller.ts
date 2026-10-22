import { Request, Response } from 'express';
import prisma from '../config/db';

export const getEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await prisma.event.findMany({
      include: { inventory: { include: { inventoryItem: true } } }
    });
    res.json({ success: true, data: events });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { inventory: { include: { inventoryItem: true } } }
    });
    res.json({ success: true, data: event });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { inventory, ...eventData } = req.body;
    const event = await prisma.event.create({
      data: {
        ...eventData,
        inventory: inventory ? { create: inventory } : undefined
      },
      include: { inventory: true }
    });
    res.status(201).json({ success: true, data: event });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updateEventInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { itemId, sold, returned } = req.body;

    const eventInv = await prisma.eventInventory.update({
      where: { eventId_inventoryItemId: { eventId: id, inventoryItemId: itemId } },
      data: { 
        quantitySold: { increment: sold || 0 },
        quantityReturned: { increment: returned || 0 }
      }
    });

    res.json({ success: true, data: eventInv });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
