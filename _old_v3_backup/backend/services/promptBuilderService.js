const { assembleBusinessContext, assembleCustomerContext } = require('./contextService');

const buildInvoicePrompt = (text) => {
    return [
        { role: 'system', content: `You are an AI that extracts invoice data from spoken or written text.
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
}` },
        { role: 'user', content: `Text to analyze: "${text}"` }
    ];
};

const buildCopilotPrompt = (query, customerEmail = null) => {
    let context = assembleBusinessContext();
    if (customerEmail) {
        context += '\n' + assembleCustomerContext(customerEmail);
    }

    return [
        { role: 'system', content: context },
        { role: 'user', content: query }
    ];
};

const buildInsightPrompt = (type, data) => {
    const context = assembleBusinessContext();
    return [
        { role: 'system', content: context },
        { role: 'user', content: `Generate a brief, actionable ${type} insight based on this data: ${JSON.stringify(data)}. Keep it under 2 sentences.` }
    ];
};

module.exports = {
    buildInvoicePrompt,
    buildCopilotPrompt,
    buildInsightPrompt
};
