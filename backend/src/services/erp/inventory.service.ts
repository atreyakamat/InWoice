import prisma from '../../prisma/client';
import { z } from 'zod';

export const inventorySchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().min(1), // could be enum but keep flexible
  unit: z.string().min(1),
  currentStock: z.number().min(0).optional(),
  minimumStock: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  costPerUnit: z.number().min(0).optional(),
  supplierId: z.string().uuid().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export class InventoryService {
  static async create(data: z.infer<typeof inventorySchema>) {
    return prisma.inventoryItem.create({ data });
  }

  static async update(id: string, data: Partial<z.infer<typeof inventorySchema>>) {
    const exists = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!exists) throw new Error('Inventory item not found');
    return prisma.inventoryItem.update({ where: { id }, data });
  }

  static async getById(id: string) {
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new Error('Inventory item not found');
    return item;
  }

  static async list(filter?: { category?: string; lowStockOnly?: boolean }) {
    const where: any = {};
    if (filter?.category) where.category = filter.category;
    if (filter?.lowStockOnly) {
      // low stock defined as stock below either minimum or reorder level
      where.OR = [
        { currentStock: { lt: prisma.inventoryItem.fields.minimumStock } },
        { currentStock: { lt: prisma.inventoryItem.fields.reorderLevel } },
      ];
    }
    return prisma.inventoryItem.findMany({ where });
  }
}
