import { Request, Response } from 'express';
import prisma from '../config/db';
import { ExecutiveCopilotService } from '../services/executive-copilot.service';

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

    res.json({
      success: true,
      data: {
        healthScore,
        briefing,
        risks,
        opportunities
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
