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
            const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
            
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

module.exports = router;