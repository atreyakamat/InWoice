import { OpenRouterService } from './ai.service';
import { VirtualCfoService } from './virtual-cfo.service';
import { VirtualCooService } from './virtual-coo.service';
import { VirtualSalesService } from './virtual-sales.service';
import prisma from '../config/db';

export class ExecutiveCopilotService {
  /**
   * Orchestrates the daily briefing generation by aggregating C-Suite contexts
   */
  static async generateDailyBriefing() {
    try {
      const [finance, ops, sales, pos, fulfillments, events] = await Promise.all([
        VirtualCfoService.getFinancialContext(),
        VirtualCooService.getOperationalContext(),
        VirtualSalesService.getCustomerContext(),
        prisma.purchaseOrder.findMany({ where: { status: { in: ['DRAFT', 'ORDERED'] } } }),
        prisma.fulfillment.count({ where: { status: 'PENDING' } }),
        prisma.event.findMany({ where: { status: 'ACTIVE' } })
      ]);

      const systemPrompt = `
You are the Executive AI Copilot for InWoice (Stix N Vibes).
Your job is to generate a concise, actionable Daily Executive Briefing.

Use the following raw business intelligence data:

FINANCIAL (Virtual CFO):
- Total Revenue: $${finance.totalRevenue}
- Pending Revenue: $${finance.pendingRevenue} (${finance.pendingCount} invoices)
- Inventory Value: $${finance.totalInventoryValue}

OPERATIONS (Virtual COO):
- Out of Stock: ${ops.outOfStockCount} items (${ops.criticalItems.join(', ')})
- Low Stock Warnings: ${ops.warningItems.join(', ')}
- Pending Shipments: ${ops.pendingShipments} (${fulfillments} urgent)
- Active Production: ${ops.activeProductionBatches} batches

PROCUREMENT & EVENTS:
- Open Purchase Orders: ${pos.length}
- Active Events/Pop-ups: ${events.map(e => e.name).join(', ') || 'None'}

SALES (Virtual Sales Manager):
- Total Customers: ${sales.totalCustomers}
- Average LTV: $${sales.averageLTV.toFixed(2)}
- Churn Risks: ${sales.churnRisks.length > 0 ? sales.churnRisks.join(', ') : 'None'}
- VIP Candidates: ${sales.vipCandidates.join(', ')}

Format the output strictly as a Markdown document with these sections:
# Daily Executive Briefing
## 💰 Financial Health
## ⚙️ Operational Status
## 🤝 Customer Intelligence
## 🎯 Recommended Actions (Provide 2-3 specific, actionable recommendations based on the data)
`;

      const content = await OpenRouterService.sendMessage([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate the daily executive briefing for today.' }
      ], 'openai/gpt-4o-mini'); // Using a fast/cheap model for daily brief

      // Save to database
      const briefing = await prisma.executiveBriefing.create({
        data: {
          type: 'DAILY',
          content,
          metrics: JSON.stringify({ finance, ops, sales })
        }
      });

      // Dummy generation of scores/risks for the dashboard to consume
      await this.generateHealthScore(finance, ops, sales);

      return briefing;
    } catch (error) {
      console.error('Failed to generate executive briefing:', error);
      throw error;
    }
  }

  private static async generateHealthScore(finance: any, ops: any, sales: any) {
    // Highly simplified heuristic logic. A real V5 would use AI to score these.
    const revenueHealth = finance.pendingCount > 10 ? 70 : 95;
    const inventoryHealth = ops.outOfStockCount > 0 ? 60 : (ops.lowStockCount > 0 ? 80 : 100);
    const customerHealth = sales.churnRisks.length > 5 ? 65 : 90;
    
    const overall = (revenueHealth + inventoryHealth + customerHealth) / 3;

    await prisma.businessHealthScore.create({
      data: {
        overallScore: overall,
        revenueHealth,
        profitHealth: 90, // Placeholder
        inventoryHealth,
        customerHealth,
        operationsHealth: ops.pendingShipments > 20 ? 70 : 95,
        cashFlowHealth: finance.pendingRevenue > 5000 ? 60 : 90
      }
    });
  }
}
