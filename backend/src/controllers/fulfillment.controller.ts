import { Request, Response } from 'express';
import prisma from '../config/db';

export const getFulfillments = async (req: Request, res: Response): Promise<void> => {
  try {
    const fulfillments = await prisma.fulfillment.findMany({
      include: { invoice: { include: { customer: true } } }
    });
    res.json({ success: true, data: fulfillments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateFulfillmentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, trackingNumber, courier, notes } = req.body;

    const fulfillment = await prisma.fulfillment.update({
      where: { id },
      data: { 
        status, 
        trackingNumber, 
        courier, 
        notes,
        shipmentRecords: {
          create: { status, notes: `Status updated to ${status}` }
        }
      }
    });

    res.json({ success: true, data: fulfillment });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
