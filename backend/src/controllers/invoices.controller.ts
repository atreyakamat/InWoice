import { Request, Response } from 'express';
import prisma from '../config/db';
import { StockService } from '../services/stock.service';

export const getInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const invoices = await prisma.invoice.findMany({ include: { customer: true } });
    res.json({ success: true, data: invoices });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { items, ...invoiceData } = req.body;
    const invoice = await prisma.invoice.create({
      data: {
        ...invoiceData,
        items: { create: items }
      },
      include: { items: true }
    });
    res.status(201).json({ success: true, data: invoice });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updateInvoiceStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const invoice = await prisma.invoice.update({
      where: { id },
      data: { status }
    });

    // CRITICAL ERP HOOK: If marked as PAID, deduct stock
    if (status === 'PAID') {
      await StockService.deductForInvoice(id);
    }

    res.json({ success: true, data: invoice });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
