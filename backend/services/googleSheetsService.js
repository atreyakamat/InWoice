const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { google } = require('googleapis');

const DB_PATH = path.join(__dirname, '../database.json');

const readDB = async () => {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        // If file doesn't exist, return default structure
        return { invoices: [], customers: [], settings: {}, products: [] };
    }
};

const writeDB = async (data) => {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
};

// --- Real Google Sheets Sync Logic ---
const syncToGoogleSheets = async (invoice) => {
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ? path.join(__dirname, '../', process.env.GOOGLE_APPLICATION_CREDENTIALS) : null;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!credsPath || !fsSync.existsSync(credsPath) || !spreadsheetId) {
        return; 
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: credsPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const values = [
            [
                invoice.invoiceID,
                invoice.date,
                invoice.customerName,
                invoice.customerEmail,
                invoice.customerPhone,
                invoice.instagramHandle,
                typeof invoice.itemsJSON === 'string' ? invoice.itemsJSON : JSON.stringify(invoice.itemsJSON),
                invoice.subtotal,
                invoice.discount,
                invoice.shipping,
                invoice.tax,
                invoice.grandTotal,
                invoice.paymentStatus,
                invoice.paymentMethod,
                invoice.notes
            ]
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Invoices!A:O',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values }
        });
        console.log('✅ Synced invoice to real Google Sheets');
    } catch (err) {
        console.error('❌ Failed to sync to Google Sheets:', err.message);
    }
};

const getInvoices = async () => (await readDB()).invoices || [];

const addInvoice = async (invoice) => {
    const db = await readDB();
    if (!db.invoices) db.invoices = [];
    db.invoices.push(invoice);
    
    // Auto-add/update customer
    if (invoice.customerEmail) {
        if (!db.customers) db.customers = [];
        const existingCustomer = db.customers.find(c => c.email === invoice.customerEmail);
        if (!existingCustomer) {
            db.customers.push({
                name: invoice.customerName,
                email: invoice.customerEmail,
                phone: invoice.customerPhone || '',
                instagram: invoice.instagramHandle || '',
                totalPurchases: invoice.grandTotal,
                lastPurchaseDate: invoice.date
            });
        } else {
            existingCustomer.totalPurchases += invoice.grandTotal;
            existingCustomer.lastPurchaseDate = invoice.date;
            existingCustomer.name = invoice.customerName; // update name if changed
        }
    }
    
    await writeDB(db);
    // Sync to sheets without waiting for it to finish (fire and forget but async)
    syncToGoogleSheets(invoice).catch(err => console.error('Sync error:', err));
    return invoice;
};

const getCustomers = async () => (await readDB()).customers || [];

const getProducts = async () => (await readDB()).products || [];

const addProduct = async (product) => {
    const db = await readDB();
    if (!db.products) db.products = [];
    product.id = Date.now().toString();
    db.products.push(product);
    await writeDB(db);
    return product;
};

const deleteProduct = async (id) => {
    const db = await readDB();
    db.products = (db.products || []).filter(p => p.id !== id);
    await writeDB(db);
};

const getSettings = async () => {
    const db = await readDB();
    return db.settings || {};
};

const updateSettings = async (newSettings) => {
    const db = await readDB();
    db.settings = { ...db.settings, ...newSettings };
    await writeDB(db);
    return db.settings;
};

module.exports = {
    getInvoices,
    addInvoice,
    getCustomers,
    getProducts,
    addProduct,
    deleteProduct,
    getSettings,
    updateSettings
};
