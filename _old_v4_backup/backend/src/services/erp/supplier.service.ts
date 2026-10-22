import prisma from '../../prisma/client';
import { z } from 'zod';
import { NotFoundError } from '../utils/errors';

// Validation schema for Supplier
export const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gst: z.string().optional(),
  paymentTerms: z.string().optional(),
  leadTime: z.number().int().positive().optional(),
  notes: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
});

export class SupplierService {
  static async create(data: z.infer<typeof supplierSchema>) {
    return prisma.supplier.create({ data });
  }

  static async update(id: string, data: Partial<z.infer<typeof supplierSchema>>) {
    const exists = await prisma.supplier.findUnique({ where: { id } });
    if (!exists) throw new NotFoundError('Supplier not found');
    return prisma.supplier.update({ where: { id }, data });
  }

  static async get(id: string) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundError('Supplier not found');
    return supplier;
  }

  static async list() {
    return prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }
}
