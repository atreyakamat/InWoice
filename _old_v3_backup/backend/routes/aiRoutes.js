const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const db = require('../services/sqliteService');
const { processTask } = require('../services/modelRouterService');

const upload = multer({ dest: 'uploads/' });

// Utility to clean AI output into valid JSON
const cleanJSON = (text) => {
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleaned);
};

// 1. Invoice Parsing
router.post('/parse', async (req, res) => {
    try {
        const { text } = req.body;
        const response = await processTask('invoice_parsing', { text });
        return res.json(cleanJSON(response.content));
    } catch (error) {
        console.error("AI Unified Parsing Error:", error);
        res.status(500).json({ error: 'Failed to parse text with AI', details: error.message });
    }
});

// 2. Business Copilot Query
router.post('/copilot', async (req, res) => {
    try {
        const { query, customerEmail, conversationId } = req.body;
        
        let convoId = conversationId;
        if (!convoId) {
            const convo = db.addAiConversation(`Query: ${query.substring(0, 30)}...`);
            convoId = convo.id;
        }

        // Add user message
        db.addAiMessage({
            conversation_id: convoId,
            role: 'user',
            content: query
        });

        const response = await processTask('copilot', { query, customerEmail });

        // Add assistant message
        db.addAiMessage({
            conversation_id: convoId,
            role: 'assistant',
            content: response.content,
            model_used: response.model_used,
            tokens_used: response.tokens_used,
            estimated_cost: response.estimated_cost
        });

        return res.json({ success: true, data: response.content, conversationId: convoId });
    } catch (error) {
        console.error("AI Copilot Error:", error);
        res.status(500).json({ error: 'Failed to process Copilot query', details: error.message });
    }
});

// 3. Generate Insight
router.post('/insight', async (req, res) => {
    try {
        const { type, data } = req.body;
        const response = await processTask('insight', { insightType: type, data });
        return res.json({ success: true, data: response.content });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate insight', details: error.message });
    }
});

// Backward compatibility for bank statement parsing
router.post('/ocr-bank-statement', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        let text = "";
        if (req.file.mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdfParse(dataBuffer);
            text = pdfData.text;
        } else {
             return res.status(400).json({ error: 'Only PDF files are supported.' });
        }
        fs.unlinkSync(req.file.path);

        const prompt = [
            { role: 'system', content: 'Extract bank transactions from the provided text into a JSON array. Schema: [{"date":"YYYY-MM-DD", "description":"string", "amount":number, "type":"Debit or Credit"}]. Only return JSON.' },
            { role: 'user', content: text.substring(0, 8000) } // Limit to prevent massive token usage
        ];
        
        const { sendToOpenRouter } = require('../services/openRouterService');
        const response = await sendToOpenRouter(prompt, 'openai/gpt-4o-mini');
        
        const transactions = cleanJSON(response.content);
        return res.json({ transactions });
    } catch (error) {
        console.error("Bank Statement OCR Error:", error);
        res.status(500).json({ error: 'Error processing bank statement', details: error.message });
    }
});

// 4. Customer Summary
router.get('/customer-summary/:email', async (req, res) => {
    try {
        const { assembleCustomerContext } = require('../services/contextService');
        const context = assembleCustomerContext(req.params.email);
        
        if (context === 'Customer not found.') {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const prompt = [
            { role: 'system', content: 'You are an expert business analyst.' },
            { role: 'user', content: `Based on the following customer data, generate a concise 3-4 sentence AI summary describing their value to the business, preferences, and a recommendation.\n\n${context}` }
        ];

        const { sendToOpenRouter } = require('../services/openRouterService');
        const response = await sendToOpenRouter(prompt, 'openai/gpt-4o-mini');
        
        return res.json({ success: true, data: response.content });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate customer summary', details: error.message });
    }
});

// 5. Usage Stats
router.get('/usage-stats', (req, res) => {
    try {
        const messages = db.prepare('SELECT * FROM ai_messages').all();
        let totalTokens = 0;
        let totalCost = 0;
        const modelCounts = {};

        messages.forEach(msg => {
            totalTokens += msg.tokens_used || 0;
            totalCost += msg.estimated_cost || 0;
            const model = msg.model_used || 'unknown';
            modelCounts[model] = (modelCounts[model] || 0) + 1;
        });

        res.json({
            success: true,
            data: {
                totalTokens,
                totalCost,
                totalRequests: messages.length,
                models: modelCounts
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch AI usage stats', details: error.message });
    }
});

module.exports = router;
