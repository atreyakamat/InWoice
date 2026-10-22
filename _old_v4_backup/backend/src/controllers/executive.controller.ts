import { Request, Response } from 'express';
import prisma from '../config/db';
import { ExecutiveCopilotService } from '../services/executive-copilot.service';
import { OpenRouterService } from '../services/ai.service';
import { VirtualCfoService } from '../services/virtual-cfo.service';
import { VirtualCooService } from '../services/virtual-coo.service';
import { VirtualSalesService } from '../services/virtual-sales.service';
import { ForecastingService } from '../services/forecasting.service';

export const getDashboardIntelligence = async (req: Request, res: Response): Promise<void> => {
  try {
    // Fetch latest health score
    const healthScore = await prisma.businessHealthScore.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    // Fetch latest daily briefing
    const briefing = await prisma.executiveBriefing.findFirst({
      where: { type: 'DAILY' },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch active risks and opportunities
    const risks = await prisma.businessRisk.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    const opportunities = await prisma.businessOpportunity.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Fetch latest forecasts
    const forecasts = await prisma.forecast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 4
    });

    res.json({
      success: true,
      data: {
        healthScore,
        briefing,
        risks,
        opportunities,
        forecasts
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const generateBriefing = async (req: Request, res: Response): Promise<void> => {
  try {
    const briefing = await ExecutiveCopilotService.generateDailyBriefing();
    res.json({ success: true, data: briefing });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateOpportunity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body; // APPROVED, REJECTED, SNOOZED

    const opportunity = await prisma.businessOpportunity.update({
      where: { id },
      data: { status }
    });

    res.json({ success: true, data: opportunity });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const askInWoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.body;

    const [finance, ops, sales] = await Promise.all([
      VirtualCfoService.getFinancialContext(),
      VirtualCooService.getOperationalContext(),
      VirtualSalesService.getCustomerContext()
    ]);

    const systemPrompt = `
You are the InWoice Executive OS. You are speaking to the business owner.
You have absolute access to the business data.

CONTEXT:
${JSON.stringify({ finance, ops, sales }, null, 2)}

Respond to the owner's query with data-driven insights. Be decisive, professional, and helpful.
If asked to perform an action, explain that you can recommend it for approval in the Decision Center.
`;

    const response = await OpenRouterService.sendMessage([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ]);

    res.json({ success: true, data: response });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const triggerForecasting = async (req: Request, res: Response): Promise<void> => {
  try {
    const forecasts = await ForecastingService.generateForecasts();
    res.json({ success: true, data: forecasts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
