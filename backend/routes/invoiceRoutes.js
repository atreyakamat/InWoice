const express = require('express');
const router = express.Router();
const { addInvoice, getInvoices } = require('../services/googleSheetsService');
const { generatePDF } = require('../services/pdfService');
const { invoiceSchema } = require('../utils/validation');
const { customAlphabet } = require('nanoid');

// Custom nanoid for invoice IDs: shorter, readable, uppercase
const nanoid = customAlphabet('1234567890ABCDEFGHJKLMNPQRSTUVWXYZ', 6);

router.post('/', async (req, res) => {
    try {
        const validation = invoiceSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Validation failed', details: validation.error.format() });
        }

        const invoiceData = validation.data;
        // Generate Secure Invoice ID
        const year = new Date().getFullYear();
        invoiceData.invoiceID = `SNV-${year}-${nanoid()}`;

        // Save to DB
        await addInvoice(invoiceData);

        res.status(201).json({ message: 'Invoice created successfully', invoice: invoiceData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

router.get('/', async (req, res) => {
    try {
        const invoices = await getInvoices();
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const { updateInvoiceStatus } = require('../services/googleSheetsService');
        const updated = await updateInvoiceStatus(req.params.id, status);
        res.json(updated);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { deleteInvoice } = require('../services/googleSheetsService');
        await deleteInvoice(req.params.id);
        res.json({ message: 'Invoice deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
});

router.post('/:id/generate-pdf', async (req, res) => {
    try {
        const invoiceID = req.params.id;
        const invoices = await getInvoices();
        const invoice = invoices.find(i => i.invoiceID === invoiceID);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        const pdfBuffer = await generatePDF(invoice);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=${invoiceID}.pdf`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            error: 'Failed to generate PDF', 
            details: error.message 
        });
    }
});

module.exports = router;