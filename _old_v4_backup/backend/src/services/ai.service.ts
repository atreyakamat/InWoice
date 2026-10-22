import axios from 'axios';
import prisma from '../config/db';

export class OpenRouterService {
  static async sendMessage(messages: any[], model?: string) {
    const settings = await prisma.businessSettings.findFirst();
    const apiKey = process.env.OPENROUTER_API_KEY || settings?.smtpPassword; // Using placeholder or env
    
    // NOTE: In V2 rewrite, we'll assume AI keys are in env or a dedicated settings field
    // For now, I'll use process.env.OPENROUTER_API_KEY
    
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model || 'openai/gpt-4o-mini',
        messages
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  }
}
