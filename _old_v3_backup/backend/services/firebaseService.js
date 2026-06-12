const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { applyEnvSettings } = require('../utils/envSettings');

const credsPath = path.join(__dirname, '../firebase-credentials.json');

if (!fs.existsSync(credsPath)) {
    throw new Error('Firebase credentials not found. Please add firebase-credentials.json to the backend folder.');
}

const serviceAccount = require(credsPath);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const DEFAULT_ACCOUNTS = [
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

let accountsSeeded = false;
const ensureDefaultAccounts = async () => {
    if (accountsSeeded) return;
    const snapshot = await db.collection('accounts').limit(1).get();
    if (!snapshot.empty) {
        accountsSeeded = true;
        return;
    }

    const batch = db.batch();
    DEFAULT_ACCOUNTS.forEach(account => {
        const ref = db.collection('accounts').doc(account.id);
        batch.set(ref, { name: account.name, type: account.type, balance: 0 });
    });
    await batch.commit();
    accountsSeeded = true;
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

// --- Settings ---
const getSettings = async () => {
    const snapshot = await db.collection('settings').get();
    const settings = {};
    snapshot.forEach(doc => {
        try {
            settings[doc.id] = JSON.parse(doc.data().value);
        } catch (e) {
            settings[doc.id] = doc.data().value;
        }
    });
    return applyEnvSettings(settings);
};

const updateSettings = async (newSettings) => {
    const batch = db.batch();
    for (const [key, value] of Object.entries(newSettings)) {
        const docRef = db.collection('settings').doc(key);
        batch.set(docRef, { value: JSON.stringify(value) }, { merge: true });
    }
    await batch.commit();
    return getSettings();
};

// --- Products ---
const getProducts = async () => {
    const snapshot = await db.collection('products').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const addProduct = async (product) => {
    const id = product.id || Date.now().toString();
    await db.collection('products').doc(id).set({
        name: product.name,
        category: product.category || null,
        price: product.price,
        image: product.image || null
    });
    return { ...product, id };
};

const deleteProduct = async (id) => {
    await db.collection('products').doc(id).delete();
};

// --- Customers ---
const getCustomers = async () => {
    const snapshot = await db.collection('customers').get();
    return snapshot.docs.map(doc => ({ email: doc.id, ...doc.data() }));
};

// --- Invoices ---
const getInvoices = async () => {
    const snapshot = await db.collection('invoices').orderBy('date', 'desc').get();
    return snapshot.docs.map(doc => doc.data());
};

const addInvoice = async (invoice) => {
    await db.collection('invoices').doc(invoice.invoiceID).set(invoice);

    // Update customer
    if (invoice.customerEmail) {
        const customerRef = db.collection('customers').doc(invoice.customerEmail);
        const doc = await customerRef.get();
        if (!doc.exists) {
            await customerRef.set({
                name: invoice.customerName,
                phone: invoice.customerPhone || null,
                instagram: invoice.instagramHandle || null,
                totalPurchases: invoice.grandTotal,
                lastPurchaseDate: invoice.date
            });
        } else {
            const data = doc.data();
            await customerRef.update({
                totalPurchases: (data.totalPurchases || 0) + invoice.grandTotal,
                lastPurchaseDate: invoice.date,
                name: invoice.customerName
            });
        }
    }

    return invoice;
};

const updateInvoiceStatus = async (invoiceID, status) => {
    await db.collection('invoices').doc(invoiceID).update({ paymentStatus: status });
    const doc = await db.collection('invoices').doc(invoiceID).get();
    return { invoiceID: doc.id, ...doc.data() };
};

const updateInvoice = async (invoiceID, updatedData) => {
    await db.collection('invoices').doc(invoiceID).update(updatedData);

    // Recalculate customer total (approximation or trigger-based in real life, simplified here)
    if (updatedData.customerEmail) {
        const snapshot = await db.collection('invoices').where('customerEmail', '==', updatedData.customerEmail).get();
        let total = 0;
        let lastDate = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            total += data.grandTotal;
            if (!lastDate || data.date > lastDate) lastDate = data.date;
        });
        
        await db.collection('customers').doc(updatedData.customerEmail).update({
            totalPurchases: total,
            lastPurchaseDate: lastDate
        });
    }

    const doc = await db.collection('invoices').doc(invoiceID).get();
    return { invoiceID: doc.id, ...doc.data() };
};

const deleteInvoice = async (invoiceID) => {
    await db.collection('invoices').doc(invoiceID).delete();
};

// --- Accounting ---
const getAccounts = async () => {
    await ensureDefaultAccounts();
    const snapshot = await db.collection('accounts').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const getAccountByName = async (name) => {
    const snapshot = await db.collection('accounts').where('name', '==', name).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
};

const addAccount = async (account) => {
    await ensureDefaultAccounts();
    const id = account.id || Date.now().toString();
    await db.collection('accounts').doc(id).set({
        name: account.name,
        type: account.type,
        balance: account.balance || 0
    });
    return { ...account, id };
};

const ensureAccount = async (name, type, id) => {
    const existing = await getAccountByName(name);
    if (existing) return existing;
    const accountId = id || `acct_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    await db.collection('accounts').doc(accountId).set({ name, type, balance: 0 });
    return { id: accountId, name, type, balance: 0 };
};

const findJournalEntryBySource = async (entryType, sourceType, sourceId) => {
    const snapshot = await db.collection('journal_entries')
        .where('entry_type', '==', entryType)
        .where('source_type', '==', sourceType)
        .where('source_id', '==', sourceId)
        .limit(1)
        .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
};

const getJournalEntries = async () => {
    const snapshot = await db.collection('journal_entries').orderBy('date', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const addJournalEntry = async (entry) => {
    validateBalancedEntry(entry);
    const id = entry.id || Date.now().toString();
    const entryRef = db.collection('journal_entries').doc(id);

    await db.runTransaction(async (transaction) => {
        transaction.set(entryRef, {
            date: entry.date,
            description: entry.description,
            reference_id: entry.reference_id || null,
            entry_type: entry.entry_type || null,
            source_type: entry.source_type || null,
            source_id: entry.source_id || null,
            lines: entry.lines || []
        });

        for (const line of entry.lines) {
            const accountRef = db.collection('accounts').doc(line.account_id);
            const accountSnap = await transaction.get(accountRef);
            if (accountSnap.exists) {
                const currentBalance = accountSnap.data().balance || 0;
                const change = (Number(line.debit) || 0) - (Number(line.credit) || 0);
                transaction.update(accountRef, { balance: currentBalance + change });
            }
        }
    });

    return id;
};

const postInvoiceJournal = async (invoice) => {
    if (!invoice || !invoice.invoiceID) return null;
    const existing = await findJournalEntryBySource('invoice', 'invoice', invoice.invoiceID);
    if (existing) return null;

    const salesAccount = await ensureAccount('Sales', 'Revenue', 'acct_sales');
    const arAccount = await ensureAccount('Accounts Receivable', 'Asset', 'acct_ar');
    const tdsReceivable = await ensureAccount('TDS Receivable', 'Asset', 'acct_tds_recv');
    const outputCgst = await ensureAccount('Output CGST', 'Liability', 'acct_output_cgst');
    const outputSgst = await ensureAccount('Output SGST', 'Liability', 'acct_output_sgst');
    const outputIgst = await ensureAccount('Output IGST', 'Liability', 'acct_output_igst');
    const outputTax = await ensureAccount('Output Tax', 'Liability', 'acct_output_tax');

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

const postPaymentJournal = async (invoice, paymentMeta = {}) => {
    if (!invoice || !invoice.invoiceID) return null;
    const existing = await findJournalEntryBySource('payment', 'invoice', invoice.invoiceID);
    if (existing) return null;

    const arAccount = await ensureAccount('Accounts Receivable', 'Asset', 'acct_ar');
    const cashAccount = await ensureAccount('Cash', 'Asset', 'acct_cash');
    const bankAccount = await ensureAccount('Bank', 'Asset', 'acct_bank');

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

const postBankJournal = async (txn) => {
    if (!txn || !txn.id) return null;
    if (Number(txn.is_personal) === 1) return null;
    const existing = await findJournalEntryBySource('bank', 'bank', txn.id);
    if (existing) return null;

    const bankAccount = await ensureAccount('Bank', 'Asset', 'acct_bank');
    const salesAccount = await ensureAccount('Sales', 'Revenue', 'acct_sales');
    const otherIncomeAccount = await ensureAccount('Other Income', 'Revenue', 'acct_other_income');
    const opexAccount = await ensureAccount('Operating Expenses', 'Expense', 'acct_opex');
    const bankChargesAccount = await ensureAccount('Bank Charges', 'Expense', 'acct_bank_fees');

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
const getBankTransactions = async () => {
    const snapshot = await db.collection('bank_transactions').orderBy('date', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const addBankTransaction = async (txn) => {
    const id = txn.id || Date.now().toString();
    await db.collection('bank_transactions').doc(id).set({
        date: txn.date,
        description: txn.description,
        amount: txn.amount,
        type: txn.type || null,
        is_personal: txn.is_personal || 0,
        category: txn.category || null,
        reconciled: txn.reconciled || 0,
        linked_invoice_id: txn.linked_invoice_id || null,
        linked_customer: txn.linked_customer || null,
        vendor_name: txn.vendor_name || null,
        vendor_gstin: txn.vendor_gstin || null,
        gst_rate: txn.gst_rate || 0,
        gst_amount: txn.gst_amount || 0,
        invoice_number: txn.invoice_number || null,
        notes: txn.notes || null
    });
    return { ...txn, id };
};

const updateBankTransaction = async (id, updates) => {
    await db.collection('bank_transactions').doc(id).update(updates);
    const doc = await db.collection('bank_transactions').doc(id).get();
    return { id: doc.id, ...doc.data() };
};

// --- Tasks ---
const getTasks = async () => {
    const snapshot = await db.collection('tasks').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const addTask = async (task) => {
    const id = task.id || Date.now().toString();
    await db.collection('tasks').doc(id).set({
        title: task.title,
        description: task.description || null,
        status: task.status || 'Todo',
        assignee: task.assignee || null,
        dueDate: task.dueDate || null
    });
    return { ...task, id };
};

const updateTask = async (id, updates) => {
    await db.collection('tasks').doc(id).update({
        title: updates.title,
        description: updates.description || null,
        status: updates.status || 'Todo',
        assignee: updates.assignee || null,
        dueDate: updates.dueDate || null
    });
};

// --- Emails ---
const getEmails = async () => {
    const snapshot = await db.collection('emails').orderBy('date', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const addEmail = async (email) => {
    const existing = await db.collection('emails').where('message_id', '==', email.message_id).limit(1).get();
    if (!existing.empty) return null;

    const id = email.id || Date.now().toString();
    await db.collection('emails').doc(id).set({
        message_id: email.message_id,
        thread_id: email.thread_id || null,
        sender: email.sender,
        recipient: email.recipient,
        subject: email.subject || null,
        body: email.body || null,
        date: email.date,
        is_read: email.is_read || 0,
        linked_customer: email.linked_customer || null,
        linked_invoice: email.linked_invoice || null
    });
    return { ...email, id };
};

const updateEmail = async (id, updates) => {
    const ref = db.collection('emails').doc(id);
    const doc = await ref.get();
    const existing = doc.exists ? doc.data() : {};

    await ref.update({
        is_read: updates.is_read ?? existing.is_read ?? 0,
        linked_customer: updates.linked_customer ?? existing.linked_customer ?? null,
        linked_invoice: updates.linked_invoice ?? existing.linked_invoice ?? null
    });
    const updated = await ref.get();
    return { id: updated.id, ...updated.data() };
};

const backupDatabase = async () => {
    console.log('Firebase handles its own backups and redundancy automatically.');
};

const getMarketingPosts = async () => [];
const addMarketingPost = async (post) => post;
const updateMarketingPost = async (id, updates) => null;
const deleteMarketingPost = async (id) => null;

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
    getMarketingPosts, addMarketingPost, updateMarketingPost, deleteMarketingPost,
    backupDatabase
};
