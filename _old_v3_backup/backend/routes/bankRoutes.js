const express = require('express');
const router = express.Router();
const { getBankTransactions, addBankTransaction, updateBankTransaction, getInvoices, updateInvoiceStatus, postPaymentJournal, postBankJournal } = require('../services/dbService');

router.get('/', async (req, res) => {
    const txns = await getBankTransactions();
    res.json(txns);
});

router.post('/', async (req, res) => {
    const txn = await addBankTransaction(req.body);

    if (txn.linked_invoice_id && txn.type && txn.type.toLowerCase() === 'credit') {
        const invoices = await getInvoices();
        const invoice = invoices.find(inv => inv.invoiceID === txn.linked_invoice_id);
        if (invoice && invoice.paymentStatus !== 'Paid') {
            const updated = await updateInvoiceStatus(invoice.invoiceID, 'Paid');
            await postPaymentJournal(updated, { method: updated.paymentMethod, date: txn.date });
        }
    }

    if (Number(txn.reconciled) === 1) {
        await postBankJournal(txn);
    }

    res.json(txn);
});

router.patch('/:id', async (req, res) => {
    const updated = await updateBankTransaction(req.params.id, req.body);
    if (Number(updated.reconciled) === 1) {
        await postBankJournal(updated);
    }
    res.json(updated);
});

module.exports = router;