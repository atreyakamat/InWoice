const express = require('express');
const router = express.Router();
const { getAccounts, addAccount, getJournalEntries, addJournalEntry, getInvoices, getBankTransactions } = require('../services/dbService');
const { Parser } = require('json2csv');

const sendCsv = (res, rows, fileName) => {
    const parser = new Parser();
    const csv = parser.parse(rows || []);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(csv);
};

const normalizeBalance = (account, balance) => {
    const raw = Number(balance || 0);
    if (account.type === 'Asset' || account.type === 'Expense') return raw;
    return raw * -1;
};

router.get('/accounts', async (req, res) => {
    const accounts = await getAccounts();
    res.json(accounts);
});

router.post('/accounts', async (req, res) => {
    const account = await addAccount(req.body);
    res.json(account);
});

router.get('/journal', async (req, res) => {
    const entries = await getJournalEntries();
    res.json(entries);
});

router.post('/journal', async (req, res) => {
    try {
        const id = await addJournalEntry(req.body);
        res.json({ id });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Invalid journal entry.' });
    }
});

router.get('/reports/trial-balance', async (req, res) => {
    const accounts = await getAccounts();
    const rows = accounts.map(account => {
        const raw = Number(account.balance || 0);
        return {
            account: account.name,
            type: account.type,
            debit: raw > 0 ? raw : 0,
            credit: raw < 0 ? Math.abs(raw) : 0
        };
    });

    if (req.query.format === 'csv') {
        return sendCsv(res, rows, `trial-balance-${Date.now()}.csv`);
    }

    res.json({
        rows,
        totals: {
            debit: rows.reduce((sum, row) => sum + row.debit, 0),
            credit: rows.reduce((sum, row) => sum + row.credit, 0)
        }
    });
});

router.get('/reports/balance-sheet', async (req, res) => {
    const accounts = await getAccounts();
    const assets = accounts.filter(a => a.type === 'Asset').map(a => ({
        name: a.name,
        balance: normalizeBalance(a, a.balance)
    }));
    const liabilities = accounts.filter(a => a.type === 'Liability').map(a => ({
        name: a.name,
        balance: normalizeBalance(a, a.balance)
    }));
    const equity = accounts.filter(a => a.type === 'Equity').map(a => ({
        name: a.name,
        balance: normalizeBalance(a, a.balance)
    }));

    const payload = {
        assets,
        liabilities,
        equity,
        totals: {
            assets: assets.reduce((sum, row) => sum + row.balance, 0),
            liabilities: liabilities.reduce((sum, row) => sum + row.balance, 0),
            equity: equity.reduce((sum, row) => sum + row.balance, 0)
        }
    };

    if (req.query.format === 'csv') {
        const rows = [
            ...assets.map(row => ({ section: 'Assets', account: row.name, balance: row.balance })),
            ...liabilities.map(row => ({ section: 'Liabilities', account: row.name, balance: row.balance })),
            ...equity.map(row => ({ section: 'Equity', account: row.name, balance: row.balance }))
        ];
        return sendCsv(res, rows, `balance-sheet-${Date.now()}.csv`);
    }

    res.json(payload);
});

router.get('/reports/profit-loss', async (req, res) => {
    const accounts = await getAccounts();
    const revenue = accounts.filter(a => a.type === 'Revenue').map(a => ({
        name: a.name,
        amount: normalizeBalance(a, a.balance)
    }));
    const expenses = accounts.filter(a => a.type === 'Expense').map(a => ({
        name: a.name,
        amount: normalizeBalance(a, a.balance)
    }));

    const totalRevenue = revenue.reduce((sum, row) => sum + row.amount, 0);
    const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);
    const netProfit = totalRevenue - totalExpenses;

    if (req.query.format === 'csv') {
        const rows = [
            ...revenue.map(row => ({ section: 'Revenue', account: row.name, amount: row.amount })),
            ...expenses.map(row => ({ section: 'Expense', account: row.name, amount: row.amount })),
            { section: 'Summary', account: 'Net Profit', amount: netProfit }
        ];
        return sendCsv(res, rows, `profit-loss-${Date.now()}.csv`);
    }

    res.json({ revenue, expenses, totals: { totalRevenue, totalExpenses, netProfit } });
});

router.get('/reports/gstr1', async (req, res) => {
    const invoices = await getInvoices();
    const rows = invoices.map(inv => ({
        invoiceID: inv.invoiceID,
        date: inv.date,
        customerName: inv.customerName,
        customerEmail: inv.customerEmail,
        taxableValue: (Number(inv.subtotal) || 0) - (Number(inv.discount) || 0) + (Number(inv.shipping) || 0),
        cgst: Number(inv.cgst) || 0,
        sgst: Number(inv.sgst) || 0,
        igst: Number(inv.igst) || 0,
        tds: Number(inv.tds) || 0,
        hsn_sac: inv.hsn_sac || '',
        grandTotal: Number(inv.grandTotal) || 0
    }));

    if (req.query.format === 'csv') {
        return sendCsv(res, rows, `gstr1-${Date.now()}.csv`);
    }

    res.json({ rows });
});

router.get('/reports/gstr3b', async (req, res) => {
    const invoices = await getInvoices();
    const totals = invoices.reduce((acc, inv) => {
        acc.taxableValue += (Number(inv.subtotal) || 0) - (Number(inv.discount) || 0) + (Number(inv.shipping) || 0);
        acc.cgst += Number(inv.cgst) || 0;
        acc.sgst += Number(inv.sgst) || 0;
        acc.igst += Number(inv.igst) || 0;
        acc.tds += Number(inv.tds) || 0;
        acc.grandTotal += Number(inv.grandTotal) || 0;
        return acc;
    }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, tds: 0, grandTotal: 0 });

    if (req.query.format === 'csv') {
        return sendCsv(res, [totals], `gstr3b-${Date.now()}.csv`);
    }

    res.json({ summary: totals });
});

router.get('/reports/gstr2', async (req, res) => {
    const txns = await getBankTransactions();
    const rows = txns
        .filter(txn => txn.type?.toLowerCase() === 'debit' && Number(txn.is_personal) === 0)
        .map(txn => ({
            date: txn.date,
            description: txn.description,
            vendor_name: txn.vendor_name || '',
            vendor_gstin: txn.vendor_gstin || '',
            invoice_number: txn.invoice_number || '',
            gst_rate: Number(txn.gst_rate) || 0,
            gst_amount: Number(txn.gst_amount) || 0,
            amount: Number(txn.amount) || 0,
            category: txn.category || ''
        }));

    if (req.query.format === 'csv') {
        return sendCsv(res, rows, `gstr2-${Date.now()}.csv`);
    }

    res.json({ rows });
});

module.exports = router;