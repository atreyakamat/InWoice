import prisma from '../config/db';

export class ContextService {
  static async assembleERPContext() {
    const inventory = await prisma.inventoryItem.findMany({
      include: { supplier: true }
    });
    
    const lowStock = inventory.filter(i => i.currentStock <= i.reorderLevel);
    const totalInventoryValue = inventory.reduce((sum, i) => sum + (i.currentStock * i.costPerUnit), 0);
    
    const recentMovements = await prisma.stockMovement.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { inventoryItem: true }
    });

    return `
ERP OPERATIONAL CONTEXT:
- Low Stock Items: ${lowStock.map(i => `${i.name} (${i.currentStock} ${i.unit} left)`).join(', ')}
- Total Inventory Value: $${totalInventoryValue.toFixed(2)}
- Total Unique Materials: ${inventory.length}

Recent Stock Movements:
${recentMovements.map(m => `- ${m.type} of ${m.quantity} ${m.inventoryItem.unit} for ${m.inventoryItem.name}`).join('\n')}
`;
  }

  static async assembleBusinessContext() {
    const revenue = await prisma.invoice.aggregate({
      where: { status: 'PAID' },
      _sum: { grandTotal: true }
    });
    
    const unpaid = await prisma.invoice.aggregate({
      where: { status: { in: ['PENDING', 'OVERDUE'] } },
      _sum: { grandTotal: true },
      _count: { id: true }
    });

    return `
BUSINESS FINANCIAL CONTEXT:
- Total Paid Revenue: $${revenue._sum.grandTotal || 0}
- Total Unpaid Amount: $${unpaid._sum.grandTotal || 0} (${unpaid._count.id} invoices)
`;
  }
}
