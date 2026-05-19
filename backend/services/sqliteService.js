const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { applyEnvSettings } = require('../utils/envSettings');

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
        reference_id TEXT,
        entry_type TEXT,
        source_type TEXT,
        source_id TEXT
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
        reconciled INTEGER DEFAULT 0,
        linked_invoice_id TEXT,
        linked_customer TEXT,
        vendor_name TEXT,
        vendor_gstin TEXT,
        gst_rate REAL DEFAULT 0,
        gst_amount REAL DEFAULT 0,
        invoice_number TEXT,
        notes TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
        status TEXT DEFAULT 'Todo',
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
addColumnSafe('journal_entries', 'entry_type', 'TEXT');
addColumnSafe('journal_entries', 'source_type', 'TEXT');
addColumnSafe('journal_entries', 'source_id', 'TEXT');
addColumnSafe('bank_transactions', 'linked_invoice_id', 'TEXT');
addColumnSafe('bank_transactions', 'linked_customer', 'TEXT');
addColumnSafe('bank_transactions', 'vendor_name', 'TEXT');
addColumnSafe('bank_transactions', 'vendor_gstin', 'TEXT');
addColumnSafe('bank_transactions', 'gst_rate', 'REAL DEFAULT 0');
addColumnSafe('bank_transactions', 'gst_amount', 'REAL DEFAULT 0');
addColumnSafe('bank_transactions', 'invoice_number', 'TEXT');
addColumnSafe('bank_transactions', 'notes', 'TEXT');

const seedChartOfAccounts = () => {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
    if (countRow && countRow.count > 0) return;

    const defaultAccounts = [
        { id: 'acct_cash', name: 'Cash', type: 'Asset' },
        { id: 'acct_bank', name: 'Bank', type: 'Asset' },
        { id: 'acct_ar', name: 'Accounts Receivable', type: 'Asset' },
        { id: 'acct_tds_recv', name: 'TDS Receivable', type: 'Asset' },
        { id: 'acct_input_cgst', name: 'Input CGST', type: 'Asset' },
        { id: 'acct_input_sgst', name: 'Input SGST', type: 'Asset' },
        { id: 'acct_input_igst', name: 'Input IGST', type: 'Asset' },
        { id: 'acct_ap', name: 'Accounts Payable', type: 'Liability' },
        { id: 'acct_output_cgst', name: 'Output CGST', type: 'Liability' },
        { id: 'acct_output_sgst', name: 'Output SGST', type: 'Liability' },
        { id: 'acct_output_igst', name: 'Output IGST', type: 'Liability' },
        { id: 'acct_output_tax', name: 'Output Tax', type: 'Liability' },
        { id: 'acct_tds_pay', name: 'TDS Payable', type: 'Liability' },
        { id: 'acct_equity', name: "Owner's Equity", type: 'Equity' },
        { id: 'acct_sales', name: 'Sales', type: 'Revenue' },
        { id: 'acct_other_income', name: 'Other Income', type: 'Revenue' },
        { id: 'acct_cogs', name: 'Cost of Goods Sold', type: 'Expense' },
        { id: 'acct_opex', name: 'Operating Expenses', type: 'Expense' },
        { id: 'acct_bank_fees', name: 'Bank Charges', type: 'Expense' }
    ];

    const insert = db.prepare('INSERT INTO accounts (id, name, type, balance) VALUES (?, ?, ?, ?)');
    const transaction = db.transaction(() => {
        defaultAccounts.forEach(account => insert.run(account.id, account.name, account.type, 0));
    });
    transaction();
};

seedChartOfAccounts();

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
    return applyEnvSettings(settings);
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
const getAccountByName = (name) => db.prepare('SELECT * FROM accounts WHERE name = ?').get(name);
const ensureAccount = (name, type, id) => {
    const existing = getAccountByName(name);
    if (existing) return existing;

    const accountId = id || `acct_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    db.prepare('INSERT OR IGNORE INTO accounts (id, name, type, balance) VALUES (?, ?, ?, ?)')
      .run(accountId, name, type, 0);
    return getAccountByName(name);
};

const findJournalEntryBySource = (entryType, sourceType, sourceId) => {
    return db.prepare(
        'SELECT * FROM journal_entries WHERE entry_type = ? AND source_type = ? AND source_id = ? LIMIT 1'
    ).get(entryType, sourceType, sourceId);
};

const validateBalancedEntry = (entry) => {
    if (!entry || !Array.isArray(entry.lines) || entry.lines.length < 2) {
        throw new Error('Journal entry must have at least two lines.');
    }
    const totalDebit = entry.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const totalCredit = entry.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error('Journal entry is not balanced.');
    }
};

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
    validateBalancedEntry(entry);
    const transaction = db.transaction(() => {
        db.prepare('INSERT INTO journal_entries (id, date, description, reference_id, entry_type, source_type, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, entry.date, entry.description, entry.reference_id || null, entry.entry_type || null, entry.source_type || null, entry.source_id || null);
        
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

const postInvoiceJournal = (invoice) => {
    if (!invoice || !invoice.invoiceID) return null;
    if (findJournalEntryBySource('invoice', 'invoice', invoice.invoiceID)) return null;

    const salesAccount = ensureAccount('Sales', 'Revenue', 'acct_sales');
    const arAccount = ensureAccount('Accounts Receivable', 'Asset', 'acct_ar');
    const tdsReceivable = ensureAccount('TDS Receivable', 'Asset', 'acct_tds_recv');
    const outputCgst = ensureAccount('Output CGST', 'Liability', 'acct_output_cgst');
    const outputSgst = ensureAccount('Output SGST', 'Liability', 'acct_output_sgst');
    const outputIgst = ensureAccount('Output IGST', 'Liability', 'acct_output_igst');
    const outputTax = ensureAccount('Output Tax', 'Liability', 'acct_output_tax');

    const subtotal = Number(invoice.subtotal) || 0;
    const discount = Number(invoice.discount) || 0;
    const shipping = Number(invoice.shipping) || 0;
    const otherTax = Number(invoice.tax) || 0;
    const cgst = Number(invoice.cgst) || 0;
    const sgst = Number(invoice.sgst) || 0;
    const igst = Number(invoice.igst) || 0;
    const tds = Number(invoice.tds) || 0;

    const salesBase = subtotal - discount + shipping;
    const grossBeforeTds = salesBase + otherTax + cgst + sgst + igst;
    const computedReceivable = Math.max(grossBeforeTds - tds, 0);
    let receivable = Number(invoice.grandTotal);
    if (!Number.isFinite(receivable) || Math.abs(receivable - computedReceivable) > 0.01) {
        receivable = computedReceivable;
    }

    const lines = [
        { account_id: arAccount.id, debit: receivable, credit: 0 }
    ];

    if (tds > 0) {
        lines.push({ account_id: tdsReceivable.id, debit: tds, credit: 0 });
    }

    if (salesBase !== 0) {
        lines.push({ account_id: salesAccount.id, debit: 0, credit: salesBase });
    }
    if (otherTax !== 0) {
        lines.push({ account_id: outputTax.id, debit: 0, credit: otherTax });
    }
    if (cgst !== 0) {
        lines.push({ account_id: outputCgst.id, debit: 0, credit: cgst });
    }
    if (sgst !== 0) {
        lines.push({ account_id: outputSgst.id, debit: 0, credit: sgst });
    }
    if (igst !== 0) {
        lines.push({ account_id: outputIgst.id, debit: 0, credit: igst });
    }

    return addJournalEntry({
        date: invoice.date,
        description: `Invoice ${invoice.invoiceID} issued`,
        reference_id: invoice.invoiceID,
        entry_type: 'invoice',
        source_type: 'invoice',
        source_id: invoice.invoiceID,
        lines
    });
};

const postPaymentJournal = (invoice, paymentMeta = {}) => {
    if (!invoice || !invoice.invoiceID) return null;
    if (findJournalEntryBySource('payment', 'invoice', invoice.invoiceID)) return null;

    const arAccount = ensureAccount('Accounts Receivable', 'Asset', 'acct_ar');
    const cashAccount = ensureAccount('Cash', 'Asset', 'acct_cash');
    const bankAccount = ensureAccount('Bank', 'Asset', 'acct_bank');

    const method = paymentMeta.method || invoice.paymentMethod || 'Bank';
    const isCash = method.toLowerCase().includes('cash');
    const depositAccount = isCash ? cashAccount : bankAccount;

    const receivable = Number(invoice.grandTotal) || 0;

    return addJournalEntry({
        date: paymentMeta.date || new Date().toISOString().split('T')[0],
        description: `Payment received for invoice ${invoice.invoiceID}`,
        reference_id: invoice.invoiceID,
        entry_type: 'payment',
        source_type: 'invoice',
        source_id: invoice.invoiceID,
        lines: [
            { account_id: depositAccount.id, debit: receivable, credit: 0 },
            { account_id: arAccount.id, debit: 0, credit: receivable }
        ]
    });
};

const postBankJournal = (txn) => {
    if (!txn || !txn.id) return null;
    if (Number(txn.is_personal) === 1) return null;
    if (findJournalEntryBySource('bank', 'bank', txn.id)) return null;

    const bankAccount = ensureAccount('Bank', 'Asset', 'acct_bank');
    const salesAccount = ensureAccount('Sales', 'Revenue', 'acct_sales');
    const otherIncomeAccount = ensureAccount('Other Income', 'Revenue', 'acct_other_income');
    const opexAccount = ensureAccount('Operating Expenses', 'Expense', 'acct_opex');
    const bankChargesAccount = ensureAccount('Bank Charges', 'Expense', 'acct_bank_fees');

    const amount = Number(txn.amount) || 0;
    if (amount <= 0) return null;

    const category = (txn.category || '').toLowerCase();
    const isCredit = (txn.type || '').toLowerCase() === 'credit';

    const creditAccount = category.includes('income') || category.includes('sales')
        ? salesAccount
        : otherIncomeAccount;
    const debitAccount = category.includes('bank') || category.includes('fee')
        ? bankChargesAccount
        : opexAccount;

    const lines = isCredit
        ? [
            { account_id: bankAccount.id, debit: amount, credit: 0 },
            { account_id: creditAccount.id, debit: 0, credit: amount }
        ]
        : [
            { account_id: debitAccount.id, debit: amount, credit: 0 },
            { account_id: bankAccount.id, debit: 0, credit: amount }
        ];

    return addJournalEntry({
        date: txn.date,
        description: txn.description || 'Bank transaction',
        reference_id: txn.id,
        entry_type: 'bank',
        source_type: 'bank',
        source_id: txn.id,
        lines
    });
};

// --- Bank Transactions ---
const getBankTransactions = () => db.prepare('SELECT * FROM bank_transactions ORDER BY date DESC').all();
const addBankTransaction = (txn) => {
    const id = txn.id || Date.now().toString();
    db.prepare(`
        INSERT INTO bank_transactions (
            id, date, description, amount, type, is_personal, category, reconciled,
            linked_invoice_id, linked_customer, vendor_name, vendor_gstin, gst_rate, gst_amount,
            invoice_number, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        txn.date,
        txn.description,
        txn.amount,
        txn.type || null,
        txn.is_personal || 0,
        txn.category || null,
        txn.reconciled || 0,
        txn.linked_invoice_id || null,
        txn.linked_customer || null,
        txn.vendor_name || null,
        txn.vendor_gstin || null,
        txn.gst_rate || 0,
        txn.gst_amount || 0,
        txn.invoice_number || null,
        txn.notes || null
    );
    return { ...txn, id };
};
const updateBankTransaction = (id, updates) => {
    db.prepare(`
        UPDATE bank_transactions SET
            date = ?, description = ?, amount = ?, type = ?, is_personal = ?, category = ?,
            reconciled = ?, linked_invoice_id = ?, linked_customer = ?, vendor_name = ?,
            vendor_gstin = ?, gst_rate = ?, gst_amount = ?, invoice_number = ?, notes = ?
        WHERE id = ?
    `).run(
        updates.date,
        updates.description,
        updates.amount,
        updates.type || null,
        updates.is_personal || 0,
        updates.category || null,
        updates.reconciled || 0,
        updates.linked_invoice_id || null,
        updates.linked_customer || null,
        updates.vendor_name || null,
        updates.vendor_gstin || null,
        updates.gst_rate || 0,
        updates.gst_amount || 0,
        updates.invoice_number || null,
        updates.notes || null,
        id
    );
    return db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(id);
};

// --- Tasks ---
const getTasks = () => db.prepare('SELECT * FROM tasks').all();
const addTask = (task) => {
    const id = task.id || Date.now().toString();
    db.prepare('INSERT INTO tasks (id, title, description, status, assignee, dueDate) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, task.title, task.description || null, task.status || 'Todo', task.assignee || null, task.dueDate || null);
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
const updateEmail = (id, updates) => {
    const existing = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    db.prepare(`
        UPDATE emails SET
            is_read = ?, linked_customer = ?, linked_invoice = ?
        WHERE id = ?
    `).run(
        updates.is_read ?? existing?.is_read ?? 0,
        updates.linked_customer ?? existing?.linked_customer ?? null,
        updates.linked_invoice ?? existing?.linked_invoice ?? null,
        id
    );
    return db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
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
    getAccounts, addAccount, getAccountByName,
    getJournalEntries, addJournalEntry, postInvoiceJournal, postPaymentJournal, postBankJournal,
    getBankTransactions, addBankTransaction, updateBankTransaction,
    getTasks, addTask, updateTask,
    getEmails, addEmail, updateEmail,
    backupDatabase
};
