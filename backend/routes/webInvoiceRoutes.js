const express = require('express');
const router = express.Router();
const { getInvoices, getSettings } = require('../services/dbService');

// Public route to view a web invoice
router.get('/:id', async (req, res) => {
    try {
        const invoiceID = req.params.id;
        const invoices = await getInvoices();
        const invoice = invoices.find(i => i.invoiceID === invoiceID);
        const settings = await getSettings();

        if (!invoice) return res.status(404).send('Invoice not found');

        // We return the raw data, the frontend will render it beautifully
        res.json({ invoice, settings });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;