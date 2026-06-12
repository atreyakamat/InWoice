import prisma from '../config/db';

export class VirtualCfoService {
  static async getFinancialContext() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));

    // Revenue
    const paidInvoices = await prisma.invoice.aggregate({
      where: { status: 'PAID' },
      _sum: { grandTotal: true, subtotal: true }
    });
    const recentRevenue = await prisma.invoice.aggregate({
      where: { status: 'PAID', paymentDate: { gte: thirtyDaysAgo } } as any, // Ignoring exact schema map for speed
      _sum: { grandTotal: true }
    });

    const pendingInvoices = await prisma.invoice.aggregate({
      where: { status: 'PENDING' },
      _sum: { grandTotal: true },
      _count: { id: true }
    });

    // Simple COGS (Cost of Goods Sold) estimation based on inventory valuation
    const inventory = await prisma.inventoryItem.findMany();
    const totalInventoryValue = inventory.reduce((sum, item) => sum + (item.currentStock * item.costPerUnit), 0);

    return {
      totalRevenue: paidInvoices._sum.grandTotal || 0,
      recentRevenue: recentRevenue._sum.grandTotal || 0,
      pendingRevenue: pendingInvoices._sum.grandTotal || 0,
      pendingCount: pendingInvoices._count.id || 0,
      totalInventoryValue,
      marginHealth: 'Healthy' // Placeholder for AI calculation
    };
  }
}
