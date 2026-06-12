import prisma from '../../prisma/client';
import { z } from 'zod';

export const inventorySchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().min(1),
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

  static async list(filter?: { category?: string; lowStockOnly?: boolean; search?: string }) {
    const where: any = {};
    if (filter?.category) where.category = filter.category;
    if (filter?.lowStockOnly) {
      where.OR = [
        { currentStock: { lt: prisma.inventoryItem.fields.minimumStock } },
        { currentStock: { lt: prisma.inventoryItem.fields.reorderLevel } },
      ];
    }
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { sku: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    return prisma.inventoryItem.findMany({ where, include: { supplier: true } });
  }

  static async getDashboardSummary() {
    const items = await prisma.inventoryItem.findMany();
    const totalValue = items.reduce((sum, item) => sum + (item.currentStock * (item.costPerUnit || 0)), 0);
    const lowStockCount = items.filter(item => item.currentStock <= item.minimumStock).length;
    const outOfStockCount = items.filter(item => item.currentStock <= 0).length;
    const totalItems = items.length;

    // Get most consumed materials (from stock movements in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const movements = await prisma.stockMovement.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        type: 'SALE',
        quantity: { lt: 0 }
      },
      include: { inventoryItem: true }
    });

    const consumptionByItem: Record<string, number> = {};
    movements.forEach(m => {
      consumptionByItem[m.inventoryItemId] = (consumptionByItem[m.inventoryItemId] || 0) + Math.abs(m.quantity);
    });

    const mostConsumed = items
      .filter(item => consumptionByItem[item.id] > 0)
      .sort((a, b) => (consumptionByItem[b.id] || 0) - (consumptionByItem[a.id] || 0))
      .slice(0, 5)
      .map(item => ({ ...item, consumedQty: consumptionByItem[item.id] }));

    return {
      totalValue,
      totalItems,
      lowStockCount,
      outOfStockCount,
      mostConsumed,
    };
  }
}
