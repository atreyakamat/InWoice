import prisma from '../config/db';

export class VirtualCooService {
  static async getOperationalContext() {
    // Inventory Risks
    const inventory = await prisma.inventoryItem.findMany();
    const lowStockItems = inventory.filter(item => item.currentStock <= item.minimumStock);
    const outOfStockItems = inventory.filter(item => item.currentStock === 0);

    // Production Status
    const activeBatches = await prisma.productionBatch.count({
      where: { status: 'IN_PROGRESS' }
    });

    // Fulfillment Status
    const pendingFulfillments = await prisma.fulfillment.count({
      where: { status: 'PENDING' }
    });

    return {
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      criticalItems: outOfStockItems.map(i => i.name),
      warningItems: lowStockItems.map(i => i.name),
      activeProductionBatches: activeBatches,
      pendingShipments: pendingFulfillments
    };
  }
}
