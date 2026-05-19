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
    itemsJSON TEXT NOT NULL,
    cgst REAL DEFAULT 0,
    sgst REAL DEFAULT 0,
    igst REAL DEFAULT 0,
    tds REAL DEFAULT 0,
    hsn_sac TEXT
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT,
    reference_id TEXT
  );

  CREATE TABLE IF NOT EXISTS journal_lines (
    id TEXT PRIMARY KEY,
    entry_id TEXT,
    account_id TEXT,
    debit REAL DEFAULT 0,
    credit REAL DEFAULT 0,
    FOREIGN KEY(entry_id) REFERENCES journal_entries(id),
    FOREIGN KEY(account_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS bank_transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    type TEXT,
    is_personal INTEGER DEFAULT 0,
    category TEXT,
    reconciled INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Pending',
    assignee TEXT,
    dueDate TEXT
  );

  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    message_id TEXT UNIQUE,
    thread_id TEXT,
    sender TEXT,
    recipient TEXT,
    subject TEXT,
    body TEXT,
    date TEXT,
    is_read INTEGER DEFAULT 0,
    linked_customer TEXT,
    linked_invoice TEXT
  );
`);

// Safe ALTER TABLEs for existing databases
const addColumnSafe = (table, column, def) => {
    try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    } catch (e) {
        // Column probably exists
    }
};

addColumnSafe('invoices', 'cgst', 'REAL DEFAULT 0');
addColumnSafe('invoices', 'sgst', 'REAL DEFAULT 0');
addColumnSafe('invoices', 'igst', 'REAL DEFAULT 0');
addColumnSafe('invoices', 'tds', 'REAL DEFAULT 0');
addColumnSafe('invoices', 'hsn_sac', 'TEXT');

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
            shipping, tax, grandTotal, paymentStatus, paymentMethod, paymentInfo, itemsJSON,
            cgst, sgst, igst, tds, hsn_sac
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        typeof invoice.itemsJSON === 'string' ? invoice.itemsJSON : JSON.stringify(invoice.itemsJSON),
        invoice.cgst || 0,
        invoice.sgst || 0,
        invoice.igst || 0,
        invoice.tds || 0,
        invoice.hsn_sac || null
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
            paymentInfo = ?, itemsJSON = ?, cgst = ?, sgst = ?, igst = ?, tds = ?, hsn_sac = ?
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
        updatedData.cgst || 0,
        updatedData.sgst || 0,
        updatedData.igst || 0,
        updatedData.tds || 0,
        updatedData.hsn_sac || null,
        invoiceID
    );

    if (updatedData.customerEmail) {
        const totalRow = db.prepare('SELECT SUM(grandTotal) as total FROM invoices WHERE customerEmail = ?').get(updatedData.customerEmail);
        const lastDateRow = db.prepare('SELECT MAX(date) as lastDate FROM invoices WHERE customerEmail = ?').get(updatedData.customerEmail);
        
        db.prepare('UPDATE customers SET totalPurchases = ?, lastPurchaseDate = ? WHERE email = ?')
          .run(totalRow ? totalRow.total : 0, lastDateRow ? lastDateRow.lastDate : updatedData.date, updatedData.customerEmail);
    }

    return db.prepare('SELECT * FROM invoices WHERE invoiceID = ?').get(invoiceID);
};

const deleteInvoice = (invoiceID) => {
    db.prepare('DELETE FROM invoices WHERE invoiceID = ?').run(invoiceID);
};

// --- Accounting ---
const getAccounts = () => db.prepare('SELECT * FROM accounts').all();
const addAccount = (account) => {
    const id = account.id || Date.now().toString();
    db.prepare('INSERT INTO accounts (id, name, type, balance) VALUES (?, ?, ?, ?)').run(id, account.name, account.type, account.balance || 0);
    return { ...account, id };
};

const getJournalEntries = () => {
    const entries = db.prepare('SELECT * FROM journal_entries ORDER BY date DESC').all();
    const linesStmt = db.prepare('SELECT * FROM journal_lines WHERE entry_id = ?');
    return entries.map(entry => ({
        ...entry,
        lines: linesStmt.all(entry.id)
    }));
};

const addJournalEntry = (entry) => {
    const id = entry.id || Date.now().toString();
    const transaction = db.transaction(() => {
        db.prepare('INSERT INTO journal_entries (id, date, description, reference_id) VALUES (?, ?, ?, ?)')
          .run(id, entry.date, entry.description, entry.reference_id || null);
        
        const lineStmt = db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)');
        for (const line of entry.lines) {
            lineStmt.run(Date.now().toString() + Math.random(), id, line.account_id, line.debit || 0, line.credit || 0);
            
            const account = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(line.account_id);
            if (account) {
                const change = (line.debit || 0) - (line.credit || 0);
                db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(change, line.account_id);
            }
        }
    });
    transaction();
    return id;
};

// --- Bank Transactions ---
const getBankTransactions = () => db.prepare('SELECT * FROM bank_transactions ORDER BY date DESC').all();
const addBankTransaction = (txn) => {
    const id = txn.id || Date.now().toString();
    db.prepare('INSERT INTO bank_transactions (id, date, description, amount, type, is_personal, category, reconciled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, txn.date, txn.description, txn.amount, txn.type, txn.is_personal || 0, txn.category || null, txn.reconciled || 0);
    return { ...txn, id };
};

// --- Tasks ---
const getTasks = () => db.prepare('SELECT * FROM tasks').all();
const addTask = (task) => {
    const id = task.id || Date.now().toString();
    db.prepare('INSERT INTO tasks (id, title, description, status, assignee, dueDate) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, task.title, task.description || null, task.status || 'Pending', task.assignee || null, task.dueDate || null);
    return { ...task, id };
};
const updateTask = (id, updates) => {
    db.prepare('UPDATE tasks SET title = ?, description = ?, status = ?, assignee = ?, dueDate = ? WHERE id = ?')
      .run(updates.title, updates.description, updates.status, updates.assignee, updates.dueDate, id);
};

// --- Emails ---
const getEmails = () => db.prepare('SELECT * FROM emails ORDER BY date DESC').all();
const addEmail = (email) => {
    const id = email.id || Date.now().toString();
    try {
        db.prepare('INSERT INTO emails (id, message_id, thread_id, sender, recipient, subject, body, date, is_read, linked_customer, linked_invoice) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, email.message_id, email.thread_id || null, email.sender, email.recipient, email.subject || null, email.body || null, email.date, email.is_read || 0, email.linked_customer || null, email.linked_invoice || null);
        return { ...email, id };
    } catch (e) {
        return null; 
    }
};

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

        const files = fs.readdirSync(BACKUP_DIR);
        const backups = files
            .filter(f => f.startsWith('data-backup-') && f.endsWith('.db'))
            .sort()
            .reverse();

        if (backups.length > 7) {
            for (let i = 7; i < backups.length; i++) {
                fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
            }
        }
    } catch (err) {
        console.error('❌ Failed to create database backup:', err.message);
    }
};

module.exports = {
    getSettings, updateSettings,
    getProducts, addProduct, deleteProduct,
    getCustomers,
    getInvoices, addInvoice, updateInvoiceStatus, updateInvoice, deleteInvoice,
    getAccounts, addAccount,
    getJournalEntries, addJournalEntry,
    getBankTransactions, addBankTransaction,
    getTasks, addTask, updateTask,
    getEmails, addEmail,
    backupDatabase
};