import prisma from '../config/db';

export class VirtualSalesService {
  static async getCustomerContext() {
    const customers = await prisma.customer.findMany({
      include: {
        invoices: {
          where: { status: 'PAID' },
          select: { grandTotal: true, date: true }
        }
      }
    });

    let totalLtv = 0;
    const churnRisks: string[] = [];
    const vipCandidates: string[] = [];

    const today = new Date();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    for (const c of customers) {
      const ltv = c.invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
      totalLtv += ltv;

      if (c.invoices.length > 0) {
        // Sort newest first
        const sorted = c.invoices.sort((a, b) => b.date.getTime() - a.date.getTime());
        const lastPurchase = sorted[0].date;
        const daysSinceLast = (today.getTime() - lastPurchase.getTime()) / (1000 * 3600 * 24);

        if (daysSinceLast > 60 && ltv > 1000) {
          churnRisks.push(`${c.name} (LTV: $${ltv.toFixed(2)})`);
        }
        if (ltv > 5000 && daysSinceLast < 30) {
          vipCandidates.push(c.name);
        }
      }
    }

    return {
      totalCustomers: customers.length,
      averageLTV: customers.length > 0 ? (totalLtv / customers.length) : 0,
      churnRisks,
      vipCandidates
    };
  }
}
