import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { z } from 'zod';

export const fulfillmentUpdateSchema = z.object({
  status: z.enum(['PENDING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED']),
  trackingNumber: z.string().optional(),
  courier: z.string().optional(),
  notes: z.string().optional(),
});

export class FulfillmentService {
  static async getByInvoice(invoiceId: string) {
    const fulfillment = await prisma.fulfillment.findUnique({
      where: { invoiceId },
      include: { shipmentRecords: true },
    });
    if (!fulfillment) throw new NotFoundError('Fulfillment not found for invoice');
    return fulfillment;
  }

  static async createOrUpdate(invoiceId: string, data: z.infer<typeof fulfillmentUpdateSchema>) {
    // Ensure invoice exists
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundError('Invoice not found');

    // Upsert fulfillment record
    const fulfillment = await prisma.fulfillment.upsert({
      where: { invoiceId },
      update: data,
      create: { invoiceId, ...data },
    });
    return fulfillment;
  }

  static async addShipmentRecord(fulfillmentId: string, record: { status: string; location?: string; notes?: string }) {
    const fulfillment = await prisma.fulfillment.findUnique({ where: { id: fulfillmentId } });
    if (!fulfillment) throw new NotFoundError('Fulfillment not found');
    const shipment = await prisma.shipmentRecord.create({
      data: {
        fulfillmentId,
        status: record.status,
        location: record.location,
        notes: record.notes,
      },
    });
    return shipment;
  }
}
