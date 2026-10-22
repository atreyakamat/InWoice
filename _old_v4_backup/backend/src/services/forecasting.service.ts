import prisma from '../config/db';
import { OpenRouterService } from './ai.service';
import { VirtualCfoService } from './virtual-cfo.service';

export class ForecastingService {
  static async generateForecasts() {
    try {
      const finance = await VirtualCfoService.getFinancialContext();
      
      const systemPrompt = `
You are the InWoice Virtual CFO.
Based on the current financial context, generate a 30-day REVENUE and PROFIT forecast.
Return ONLY a valid JSON array of objects following this schema:
[
  { "type": "REVENUE", "timeframe": "NEXT_30_DAYS", "forecastValue": number, "confidence": number, "logic": "string" },
  { "type": "PROFIT", "timeframe": "NEXT_30_DAYS", "forecastValue": number, "confidence": number, "logic": "string" }
]

CONTEXT:
${JSON.stringify(finance, null, 2)}
`;

      const response = await OpenRouterService.sendMessage([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate forecasts.' }
      ], 'openai/gpt-4o-mini');

      // Simple cleaning of potential markdown backticks
      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const forecasts = JSON.parse(cleaned);

      for (const f of forecasts) {
        await prisma.forecast.create({
          data: {
            type: f.type,
            timeframe: f.timeframe,
            forecastValue: f.forecastValue,
            confidence: f.confidence,
            logic: f.logic
          }
        });
      }

      return forecasts;
    } catch (error) {
      console.error('Forecasting Error:', error);
      throw error;
    }
  }
}
