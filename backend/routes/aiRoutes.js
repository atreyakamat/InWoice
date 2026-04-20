const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const SYSTEM_PROMPT = `
You are an AI that extracts invoice data from spoken text.
Extract the data and return ONLY a valid JSON object. No markdown formatting, no backticks, no explanations.

Schema to strictly follow:
{
    "customerName": "string or empty",
    "customerEmail": "string or empty",
    "customerPhone": "string or empty",
    "items": [
        { "name": "string", "quantity": number, "price": number }
    ],
    "autoSend": boolean (Set to true ONLY IF the text explicitly mentions sending, emailing, or shooting the invoice to the customer)
}
`;

// Utility to clean AI output into valid JSON
const cleanJSON = (text) => {
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    // Find the first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleaned);
};

router.post('/parse', async (req, res) => {
    const { text } = req.body;
    try {
        // 1. Try Ollama AI if enabled
        if (process.env.USE_OLLAMA_AI === 'true') {
            const url = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
            const model = process.env.OLLAMA_MODEL || 'qwen3.5:0.8b';
            
            console.log(`Routing AI request to Ollama (${model}) at ${url}...`);
            try {
                const response = await axios.post(url, {
                    model: model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: `Text to analyze: "${text}"` }
                    ],
                    stream: false,
                    format: 'json' // Ollama feature for JSON output
                });
                
                const content = response.data.message.content;
                return res.json(cleanJSON(content));
            } catch (error) {
                console.error("Ollama AI Error:", error.message);
                // Continue to next AI if Ollama fails
            }
        }

        // 2. Try Local Python AI Microservice if enabled
        if (process.env.USE_LOCAL_PYTHON_AI === 'true') {
            const localUrl = process.env.LOCAL_AI_URL || 'http://127.0.0.1:8000/parse';
            console.log(`Routing AI request to local Python model at ${localUrl}...`);
            try {
                const response = await axios.post(localUrl, { text });
                return res.json(response.data);
            } catch (error) {
                console.error("Local Python AI Error:", error.message);
            }
        }

        // 3. Fallback to Gemini Cloud AI
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            console.log("Routing AI request to Gemini Cloud...");
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nText to analyze: "${text}"`);
            const content = result.response.text();
            return res.json(cleanJSON(content));
        }

        return res.status(500).json({ error: 'No AI service available. Configure Ollama, Local Python, or Gemini API.' });

    } catch (error) {
        console.error("AI Unified Parsing Error:", error);
        res.status(500).json({ error: 'Failed to parse text with AI', details: error.message });
    }
});

router.post('/insights', async (req, res) => {
    const { summary, trends } = req.body;
    const INSIGHTS_PROMPT = `
You are an expert business analyst for a small creator business called "${summary.businessName || 'Stix N Vibes'}".
Analyze the following business data and provide 3-4 concise, actionable insights or recommendations.
Keep it professional, encouraging, and focused on growth.

Data Summary:
- Total Revenue: ${summary.totalRevenue}
- MoM Growth: ${summary.momGrowth}%
- Avg Order Value: ${summary.avgOrderValue}
- Items Sold: ${summary.totalItemsSold}
- Total Invoices: ${summary.totalInvoices}

Provide the output as a simple list of strings in JSON format: { "insights": ["insight 1", "insight 2", ...] }
`;

    try {
        // Use Gemini if available
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use 1.5-flash for speed/reliability

            const result = await model.generateContent(INSIGHTS_PROMPT);
            const content = result.response.text();
            return res.json(cleanJSON(content));
        }

        // Use Ollama fallback
        if (process.env.USE_OLLAMA_AI === 'true') {
            const url = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
            const response = await axios.post(url, {
                model: process.env.OLLAMA_MODEL || 'qwen3.5:0.8b',
                messages: [{ role: 'user', content: INSIGHTS_PROMPT }],
                stream: false,
                format: 'json'
            });
            return res.json(cleanJSON(response.data.message.content));
        }

        // Mock response if no AI is configured
        return res.json({
            insights: [
                "Your revenue is steady, but consider a small discount for top customers to increase frequency.",
                "The average order value is healthy. Try bundling products to push it even higher.",
                "Track which products are trending this month and create a social media post around them."
            ]
        });
    } catch (error) {
        console.error("AI Insights Error:", error);
        res.status(500).json({ error: 'Failed to generate insights' });
    }
});

module.exports = router;