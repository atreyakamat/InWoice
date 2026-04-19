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

/**
 * Create a timestamped backup of the database
 */
const backupDatabase = async () => {
    const BACKUP_DIR = path.join(__dirname, '../backups');
    try {
        // Ensure backup directory exists
        if (!fsSync.existsSync(BACKUP_DIR)) {
            await fs.mkdir(BACKUP_DIR, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, `database-backup-${timestamp}.json`);
        
        // Copy database file
        if (fsSync.existsSync(DB_PATH)) {
            await fs.copyFile(DB_PATH, backupPath);
            console.log(`✅ Database backup created: ${backupPath}`);

            // Keep only the last 7 backups
            const files = await fs.readdir(BACKUP_DIR);
            const backups = files
                .filter(f => f.startsWith('database-backup-') && f.endsWith('.json'))
                .sort()
                .reverse();

            if (backups.length > 7) {
                for (let i = 7; i < backups.length; i++) {
                    await fs.unlink(path.join(BACKUP_DIR, backups[i]));
                    console.log(`🗑️ Deleted old backup: ${backups[i]}`);
                }
            }
        }
    } catch (err) {
        console.error('❌ Failed to create database backup:', err.message);
    }
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

const updateInvoiceStatus = async (invoiceID, status) => {
    const db = await readDB();
    const invoice = db.invoices.find(i => i.invoiceID === invoiceID);
    if (invoice) {
        invoice.paymentStatus = status;
        await writeDB(db);
        // Note: Real-time update for Google Sheets would require finding the row index.
        // For simplicity in this homelab setup, we update the local DB which is the source of truth.
        return invoice;
    }
    throw new Error('Invoice not found');
};

/**
 * Update an entire invoice
 */
const updateInvoice = async (invoiceID, updatedData) => {
    const db = await readDB();
    const index = db.invoices.findIndex(i => i.invoiceID === invoiceID);
    
    if (index === -1) {
        throw new Error('Invoice not found');
    }
    
    // Keep the original invoice ID
    db.invoices[index] = { ...updatedData, invoiceID };
    
    // Update customer if email changed
    if (updatedData.customerEmail) {
        const existingCustomer = db.customers.find(c => c.email === updatedData.customerEmail);
        if (!existingCustomer) {
            db.customers.push({
                name: updatedData.customerName,
                email: updatedData.customerEmail,
                phone: updatedData.customerPhone || '',
                instagram: updatedData.instagramHandle || '',
                totalPurchases: updatedData.grandTotal,
                lastPurchaseDate: updatedData.date
            });
        } else {
            // Recalculate customer totals
            const customerInvoices = db.invoices.filter(inv => inv.customerEmail === updatedData.customerEmail);
            existingCustomer.totalPurchases = customerInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
            existingCustomer.lastPurchaseDate = customerInvoices.sort((a, b) => 
                new Date(b.date) - new Date(a.date)
            )[0].date;
        }
    }
    
    await writeDB(db);
    return db.invoices[index];
};

const deleteInvoice = async (invoiceID) => {
    const db = await readDB();
    db.invoices = db.invoices.filter(i => i.invoiceID !== invoiceID);
    await writeDB(db);
};

module.exports = {
    getInvoices,
    addInvoice,
    getCustomers,
    getProducts,
    addProduct,
    deleteProduct,
    getSettings,
    updateSettings,
    updateInvoiceStatus,
    updateInvoice,
    deleteInvoice,
    backupDatabase
};
