import { Request, Response } from 'express';
import { OpenRouterService } from '../services/ai.service';
import { ContextService } from '../services/context.service';

export const askCopilot = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.body;
    
    const erpContext = await ContextService.assembleERPContext();
    const businessContext = await ContextService.assembleBusinessContext();
    
    const systemPrompt = `
You are the InWoice ERP Copilot. You assist Stix N Vibes owners in managing their sticker business.
You have access to real-time inventory and financial data.

${businessContext}
${erpContext}

Answer accurately based on this data. Be concise and professional.
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
