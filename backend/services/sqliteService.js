const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data.db');
const db = new Database(DB_PATH);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL,
    image TEXT
  );

  CREATE TABLE IF NOT EXISTS customers (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    instagram TEXT,
    totalPurchases REAL DEFAULT 0,
    lastPurchaseDate TEXT
  );

  CREATE TABLE IF NOT EXISTS invoices (
    invoiceID TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    dueDate TEXT,
    customerName TEXT NOT NULL,
    customerEmail TEXT,
    customerPhone TEXT,
    shippingAddress TEXT,
    instagramHandle TEXT,
    notes TEXT,
    subtotal REAL NOT NULL,
    discount REAL DEFAULT 0,
    shipping REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    grandTotal REAL NOT NULL,
    paymentStatus TEXT DEFAULT 'Pending',
    paymentMethod TEXT,
    paymentInfo TEXT,
    itemsJSON TEXT NOT NULL
  );
`);

// --- Settings ---
const getSettings = () => {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    rows.forEach(row => {
        try {
            settings[row.key] = JSON.parse(row.value);
        } catch (e) {
            settings[row.key] = row.value;
        }
    });
    return settings;
};

const updateSettings = (newSettings) => {
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const transaction = db.transaction((settings) => {
        for (const [key, value] of Object.entries(settings)) {
            upsert.run(key, JSON.stringify(value));
        }
    });
    transaction(newSettings);
    return getSettings();
};

// --- Products ---
const getProducts = () => {
    return db.prepare('SELECT * FROM products').all();
};

const addProduct = (product) => {
    const id = product.id || Date.now().toString();
    db.prepare('INSERT INTO products (id, name, category, price, image) VALUES (?, ?, ?, ?, ?)')
      .run(id, product.name, product.category || null, product.price, product.image || null);
    return { ...product, id };
};

const deleteProduct = (id) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
};

// --- Customers ---
const getCustomers = () => {
    return db.prepare('SELECT * FROM customers').all();
};

const getCustomerByEmail = (email) => {
    return db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
};

// --- Invoices ---
const getInvoices = () => {
    return db.prepare('SELECT * FROM invoices ORDER BY date DESC').all();
};

const addInvoice = (invoice) => {
    const stmt = db.prepare(`
        INSERT INTO invoices (
            invoiceID, date, dueDate, customerName, customerEmail, customerPhone, 
            shippingAddress, instagramHandle, notes, subtotal, discount, 
            shipping, tax, grandTotal, paymentStatus, paymentMethod, paymentInfo, itemsJSON
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        invoice.invoiceID,
        invoice.date,
        invoice.dueDate || null,
        invoice.customerName,
        invoice.customerEmail || null,
        invoice.customerPhone || null,
        invoice.shippingAddress || null,
        invoice.instagramHandle || null,
        invoice.notes || null,
        invoice.subtotal,
        invoice.discount || 0,
        invoice.shipping || 0,
        invoice.tax || 0,
        invoice.grandTotal,
        invoice.paymentStatus || 'Pending',
        invoice.paymentMethod || null,
        invoice.paymentInfo || null,
        typeof invoice.itemsJSON === 'string' ? invoice.itemsJSON : JSON.stringify(invoice.itemsJSON)
    );

    // Update customer
    if (invoice.customerEmail) {
        const customer = getCustomerByEmail(invoice.customerEmail);
        if (!customer) {
            db.prepare('INSERT INTO customers (email, name, phone, instagram, totalPurchases, lastPurchaseDate) VALUES (?, ?, ?, ?, ?, ?)')
              .run(invoice.customerEmail, invoice.customerName, invoice.customerPhone || null, invoice.instagramHandle || null, invoice.grandTotal, invoice.date);
        } else {
            db.prepare('UPDATE customers SET totalPurchases = totalPurchases + ?, lastPurchaseDate = ?, name = ? WHERE email = ?')
              .run(invoice.grandTotal, invoice.date, invoice.customerName, invoice.customerEmail);
        }
    }

    return invoice;
};

const updateInvoiceStatus = (invoiceID, status) => {
    db.prepare('UPDATE invoices SET paymentStatus = ? WHERE invoiceID = ?').run(status, invoiceID);
    return db.prepare('SELECT * FROM invoices WHERE invoiceID = ?').get(invoiceID);
};

const updateInvoice = (invoiceID, updatedData) => {
    const stmt = db.prepare(`
        UPDATE invoices SET 
            date = ?, dueDate = ?, customerName = ?, customerEmail = ?, customerPhone = ?, 
            shippingAddress = ?, instagramHandle = ?, notes = ?, subtotal = ?, discount = ?, 
            shipping = ?, tax = ?, grandTotal = ?, paymentStatus = ?, paymentMethod = ?, 
            paymentInfo = ?, itemsJSON = ?
        WHERE invoiceID = ?
    `);

    stmt.run(
        updatedData.date,
        updatedData.dueDate || null,
        updatedData.customerName,
        updatedData.customerEmail || null,
        updatedData.customerPhone || null,
        updatedData.shippingAddress || null,
        updatedData.instagramHandle || null,
        updatedData.notes || null,
        updatedData.subtotal,
        updatedData.discount || 0,
        updatedData.shipping || 0,
        updatedData.tax || 0,
        updatedData.grandTotal,
        updatedData.paymentStatus || 'Pending',
        updatedData.paymentMethod || null,
        updatedData.paymentInfo || null,
        typeof updatedData.itemsJSON === 'string' ? updatedData.itemsJSON : JSON.stringify(updatedData.itemsJSON),
        invoiceID
    );

    // Recalculate customer total
    if (updatedData.customerEmail) {
        const total = db.prepare('SELECT SUM(grandTotal) as total FROM invoices WHERE customerEmail = ?').get(updatedData.customerEmail).total;
        const lastDate = db.prepare('SELECT MAX(date) as lastDate FROM invoices WHERE customerEmail = ?').get(updatedData.customerEmail).lastDate;
        
        db.prepare('UPDATE customers SET totalPurchases = ?, lastPurchaseDate = ? WHERE email = ?')
          .run(total, lastDate, updatedData.customerEmail);
    }

    return db.prepare('SELECT * FROM invoices WHERE invoiceID = ?').get(invoiceID);
};

const deleteInvoice = (invoiceID) => {
    db.prepare('DELETE FROM invoices WHERE invoiceID = ?').run(invoiceID);
};

/**
 * Create a timestamped backup of the SQLite database
 */
const backupDatabase = async () => {
    const BACKUP_DIR = path.join(__dirname, '../backups');
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, `data-backup-${timestamp}.db`);
        
        await db.backup(backupPath);
        console.log(`✅ Database backup created: ${backupPath}`);

        // Keep only the last 7 backups
        const files = fs.readdirSync(BACKUP_DIR);
        const backups = files
            .filter(f => f.startsWith('data-backup-') && f.endsWith('.db'))
            .sort()
            .reverse();

        if (backups.length > 7) {
            for (let i = 7; i < backups.length; i++) {
                fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
                console.log(`🗑️ Deleted old backup: ${backups[i]}`);
            }
        }
    } catch (err) {
        console.error('❌ Failed to create database backup:', err.message);
    }
};

module.exports = {
    getSettings,
    updateSettings,
    getProducts,
    addProduct,
    deleteProduct,
    getCustomers,
    getInvoices,
    addInvoice,
    updateInvoiceStatus,
    updateInvoice,
    deleteInvoice,
    backupDatabase
};
