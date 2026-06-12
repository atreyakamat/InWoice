const db = require('./sqliteService');

const assembleBusinessContext = () => {
    // Gather key business data for the AI Copilot to understand the current state
    const settings = db.getSettings();
    const bSettings = db.getBusinessSettings();
    const invoices = db.getInvoices() || [];
    const customers = db.getCustomers() || [];
    const products = db.getProducts() || [];
    const collections = db.getCollections() || [];
    const packs = db.getPacks() || [];
    const memories = db.getAiMemories() || [];

    // Calculate basic analytics
    const totalRevenue = invoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0);
    const unpaidInvoices = invoices.filter(inv => inv.paymentStatus !== 'Paid');
    const unpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0);

    const context = `
You are the InWoice Business Copilot, an expert AI assistant for ${bSettings[0]?.business_name || 'this business'}.

Here is the current state of the business:
- Total Customers: ${customers.length}
- Total Products: ${products.length}
- Total Collections: ${collections.length}
- Total Packs: ${packs.length}
- Total Lifetime Revenue: ₹${totalRevenue.toFixed(2)}
- Unpaid Invoices: ${unpaidInvoices.length} (Totaling ₹${unpaidAmount.toFixed(2)})

Recent Business Memory:
${memories.slice(0, 5).map(m => `- ${m.content}`).join('\n')}

When answering questions, prioritize referencing this business data over generic advice. If the user asks about revenue, collections, or customers, use the provided metrics.
`;

    return context;
};

const assembleCustomerContext = (email) => {
    const customer = db.getCustomerByEmail(email);
    if (!customer) return 'Customer not found.';
    
    const invoices = db.getInvoices().filter(inv => inv.customerEmail === email);
    const timeline = db.getCustomerTimeline(email) || [];
    const memories = db.getAiMemories('customer', email) || [];

    const totalSpent = invoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0);

    return `
Customer Profile:
Name: ${customer.name}
Email: ${customer.email}
Total Spent: ₹${totalSpent.toFixed(2)}
Invoices Generated: ${invoices.length}

Timeline Events:
${timeline.slice(0, 5).map(t => `- ${t.event_type}: ${t.title}`).join('\n')}

AI Memory / Preferences:
${memories.map(m => `- ${m.content}`).join('\n')}
`;
};

module.exports = {
    assembleBusinessContext,
    assembleCustomerContext
};
