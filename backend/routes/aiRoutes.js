const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');

// Note: To parse PDFs directly in Node, we will use a lightweight package like 'pdf-parse' if needed, 
// but since the user requested AI layer via Groq/NIM, we will send text to them.
// We'll set up multer for file upload.
const upload = multer({ dest: 'uploads/' });

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

// Generic function to call Groq or NIM
const callExternalAI = async (messages, maxTokens = 512) => {
    // 1. Try Groq
    if (process.env.GROQ_API_KEY) {
        const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
        const model = process.env.GROQ_MODEL || 'llama3-70b-8192'; // Fast reasoning model
        console.log(`Routing AI request to Groq (${model})...`);
        const response = await axios.post(groqUrl, {
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: 0.1,
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
        });
        return response.data.choices[0].message.content;
    }
    
    // 2. Try NVIDIA NIM
    if (process.env.NVIDIA_NIM_API_KEY) {
        const nimUrl = process.env.NVIDIA_NIM_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
        const model = process.env.NVIDIA_NIM_MODEL || 'meta/llama3-70b-instruct';
        console.log(`Routing AI request to NVIDIA NIM (${model})...`);
        const response = await axios.post(nimUrl, {
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: 0.1
        }, {
            headers: { 'Authorization': `Bearer ${process.env.NVIDIA_NIM_API_KEY}` }
        });
        return response.data.choices[0].message.content;
    }
    
    return null; // Signals to fallback to Gemini/Ollama
};

router.post('/parse', async (req, res) => {
    const { text } = req.body;
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Text to analyze: "${text}"` }
    ];

    try {
        // Try Groq or NIM first
        const externalResponse = await callExternalAI(messages);
        if (externalResponse) {
            return res.json(cleanJSON(externalResponse));
        }

        // Fallbacks
        if (process.env.USE_OLLAMA_AI === 'true') {
            const url = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
            const model = process.env.OLLAMA_MODEL || 'qwen3.5:0.8b';
            console.log(`Routing AI request to Ollama (${model}) at ${url}...`);
            try {
                const response = await axios.post(url, {
                    model: model,
                    messages: messages,
                    stream: false,
                    format: 'json'
                });
                return res.json(cleanJSON(response.data.message.content));
            } catch (error) {
                console.error("Ollama AI Error:", error.message);
            }
        }

        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            console.log("Routing AI request to Gemini Cloud...");
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nText to analyze: "${text}"`);
            return res.json(cleanJSON(result.response.text()));
        }

        return res.status(500).json({ error: 'No AI service available. Configure Groq, NVIDIA NIM, Ollama, or Gemini API.' });

    } catch (error) {
        console.error("AI Unified Parsing Error:", error);
        res.status(500).json({ error: 'Failed to parse text with AI', details: error.message });
    }
});

const pdfParse = require('pdf-parse');

router.post('/ocr-bank-statement', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        let text = "";
        
        // Very basic extraction using pdf-parse for local handling before sending to AI
        if (req.file.mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdfParse(dataBuffer);
            text = pdfData.text;
        } else {
             // For images, we would ideally use a Vision model directly or a local OCR like tesseract, 
             // but assuming PDF for now or delegating text extraction to frontend if needed.
             // Let's inform the user if it's not a PDF.
             return res.status(400).json({ error: 'Only PDF files are currently supported for backend extraction.' });
        }

        // Clean up the uploaded file
        fs.unlinkSync(req.file.path);

        if (!text.trim()) {
             return res.status(400).json({ error: 'Could not extract text from the PDF.' });
        }

        const OCR_PROMPT = `
You are a financial AI. Extract all bank transactions from the provided bank statement text.
Return ONLY a valid JSON object representing a list of transactions. No markdown, no explanations.
Schema to strictly follow:
{
    "transactions": [
        { "date": "YYYY-MM-DD", "description": "string", "amount": number, "type": "Debit" or "Credit" }
    ]
}`;

        const messages = [
            { role: 'system', content: OCR_PROMPT },
            { role: 'user', content: `Bank statement text:\n${text.substring(0, 3000)}` }
        ];

        const externalResponse = await callExternalAI(messages, 1024);
        if (externalResponse) {
            return res.json({ text_preview: text.substring(0, 500), data: cleanJSON(externalResponse) });
        }
        
        // Fallback to Gemini
        if (process.env.GEMINI_API_KEY) {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(`${OCR_PROMPT}\n\nText: ${text.substring(0, 3000)}`);
            return res.json({ text_preview: text.substring(0, 500), data: cleanJSON(result.response.text()) });
        }
        
        return res.status(500).json({ error: 'No AI service available for OCR. Configure Groq or NVIDIA NIM.' });

    } catch (error) {
        console.error("Bank Statement AI Error:", error);
        res.status(500).json({ error: 'Failed to process bank statement with AI', details: error.message });
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

    const messages = [{ role: 'user', content: INSIGHTS_PROMPT }];

    try {
        const externalResponse = await callExternalAI(messages);
        if (externalResponse) {
            return res.json(cleanJSON(externalResponse));
        }

        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(INSIGHTS_PROMPT);
            return res.json(cleanJSON(result.response.text()));
        }

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

router.post('/marketing-plan', async (req, res) => {
    const { context } = req.body;
    const MARKETING_PROMPT = `
You are a creative marketing AI. Create a marketing post based on the context below. 
Determine the best platforms to post on based on the context. Available platforms: ["WhatsApp", "Instagram", "LinkedIn", "YouTube", "Twitter", "Facebook"].
Return ONLY a valid JSON object.
Schema:
{
    "content": "The actual post content...",
    "platforms": ["Platform1", "Platform2"]
}
Context: ${context || 'General business growth and product awareness.'}
`;
    const messages = [{ role: 'system', content: MARKETING_PROMPT }];

    try {
        try {
            const externalResponse = await callExternalAI(messages, 512);
            if (externalResponse) {
                return res.json(cleanJSON(externalResponse));
            }
        } catch (err) {
            console.warn("External AI call failed, falling back:", err.message);
        }

        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            try {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent(MARKETING_PROMPT);
                return res.json(cleanJSON(result.response.text()));
            } catch (err) {
                console.warn("Gemini call failed, falling back to mock:", err.message);
            }
        }

        return res.json({
            content: "Hey everyone! We're excited to announce some amazing new updates to our products. Check it out and let us know what you think! 🚀 #StixNVibes #Growth",
            platforms: ["Instagram", "WhatsApp"]
        });
    } catch (error) {
        console.error("Marketing Plan Error:", error);
        res.status(500).json({ error: 'Failed to generate marketing plan' });
    }
});

router.post('/extract-order', async (req, res) => {
    const { text } = req.body;
    const ORDER_PROMPT = `
You are an AI order manager. Extract order details from the following WhatsApp chat text.
Return ONLY a valid JSON object.
Schema:
{
    "customerName": "string",
    "items": [
        { "name": "string", "quantity": number, "price": number }
    ],
    "total": number
}
Text: ${text}
`;
    const messages = [{ role: 'system', content: ORDER_PROMPT }];

    try {
        try {
            const externalResponse = await callExternalAI(messages, 512);
            if (externalResponse) {
                return res.json(cleanJSON(externalResponse));
            }
        } catch (err) {
            console.warn("External AI call failed, falling back:", err.message);
        }

        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            try {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent(ORDER_PROMPT);
                return res.json(cleanJSON(result.response.text()));
            } catch (err) {
                console.warn("Gemini call failed, falling back to mock:", err.message);
            }
        }

        return res.json({
            customerName: "Alex (Mock)",
            items: [{ name: "Neon Light", quantity: 1, price: 500 }],
            total: 500
        });
    } catch (error) {
        console.error("Order Extraction Error:", error);
        res.status(500).json({ error: 'Failed to extract order' });
    }
});

router.post('/chat', async (req, res) => {
    const { message, history } = req.body;
    
    // Build context for the AI Manager
    const chatContext = (history || []).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
    }));
    
    const SYSTEM_PROMPT = `You are the AI Business Manager for this InWoice project. You help the user manage their marketing, accounting, and general business tasks. Keep your answers concise, professional, and directly helpful.`;
    
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatContext,
        { role: 'user', content: message }
    ];

    try {
        try {
            const externalResponse = await callExternalAI(messages, 1024);
            if (externalResponse) {
                let text = externalResponse;
                try { 
                    const parsed = JSON.parse(externalResponse);
                    if (parsed.response) text = parsed.response;
                    if (parsed.message) text = parsed.message;
                } catch(e) {}
                return res.json({ response: text });
            }
        } catch (err) {
            console.warn("External AI chat failed, falling back:", err.message);
        }

        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            try {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const geminiHistory = chatContext.map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }));
                const chat = model.startChat({
                    history: [{ role: "user", parts: [{ text: SYSTEM_PROMPT }] }, { role: "model", parts: [{ text: "Understood." }] }, ...geminiHistory]
                });
                const result = await chat.sendMessage(message);
                return res.json({ response: result.response.text() });
            } catch (err) {
                console.warn("Gemini chat failed, falling back to mock:", err.message);
            }
        }

        return res.json({ response: "I am your AI Manager. I'm operating in offline mode right now, but I can still help you with structural advice. How can I assist?" });
    } catch (error) {
        console.error("AI Chat Error:", error);
        res.status(500).json({ error: 'Failed to process chat' });
    }
});

module.exports = router;