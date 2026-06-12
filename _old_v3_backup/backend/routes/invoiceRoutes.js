const express = require('express');
const router = express.Router();
const { 
    addInvoice, 
    getInvoices, 
    updateInvoiceStatus, 
    updateInvoice, 
    deleteInvoice,
    postInvoiceJournal,
    postPaymentJournal
} = require('../services/dbService');
const { syncToGoogleSheets } = require('../services/googleSheetsService');
const { generatePDF } = require('../services/pdfService');
const { invoiceSchema, validate } = require('../utils/validation');
const { customAlphabet } = require('nanoid');

// Custom nanoid for invoice IDs: shorter, readable, uppercase
const nanoid = customAlphabet('1234567890ABCDEFGHJKLMNPQRSTUVWXYZ', 6);

router.post('/', validate(invoiceSchema), async (req, res) => {
    try {
        const invoiceData = req.body;
        // Generate Secure Invoice ID
        const year = new Date().getFullYear();
        invoiceData.invoiceID = `SNV-${year}-${nanoid()}`;

        // Save to DB
        await addInvoice(invoiceData);
        await postInvoiceJournal(invoiceData);
        if (invoiceData.paymentStatus === 'Paid') {
            await postPaymentJournal(invoiceData, { method: invoiceData.paymentMethod, date: invoiceData.date });
        }
        
        // Sync to sheets without waiting
        syncToGoogleSheets(invoiceData).catch(err => console.error('Sync error:', err));

        res.status(201).json({ message: 'Invoice created successfully', invoice: invoiceData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

router.get('/', async (req, res) => {
    try {
        // Parse pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const status = req.query.status; // Optional filter
        
        if (page < 1 || limit < 1 || limit > 100) {
            return res.status(400).json({ error: 'Invalid pagination parameters' });
        }

        // Get all invoices
        let invoices = await getInvoices();

        // Filter by status if provided
        if (status) {
            invoices = invoices.filter(inv => inv.paymentStatus === status);
        }

        // Calculate pagination
        const total = invoices.length;
        const totalPages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const end = start + limit;
        
        // Slice data for current page
        const paginatedInvoices = invoices.slice(start, end);

        res.json({
            invoices: paginatedInvoices,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const updated = await updateInvoiceStatus(req.params.id, status);
        if (status === 'Paid') {
            await postPaymentJournal(updated, { method: updated.paymentMethod });
        }
        res.json(updated);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
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

/**
 * Duplicate/Clone an existing invoice
 * POST /api/invoices/:id/duplicate
 */
router.post('/:id/duplicate', async (req, res) => {
    try {
        const sourceID = req.params.id;
        const invoices = await getInvoices();
        const sourceInvoice = invoices.find(i => i.invoiceID === sourceID);
        
        if (!sourceInvoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Create a copy with new ID and current date
        const year = new Date().getFullYear();
        const newInvoice = {
            ...sourceInvoice,
            invoiceID: `SNV-${year}-${nanoid()}`,
            date: new Date().toISOString().split('T')[0],
            paymentStatus: 'Pending' // Reset payment status
        };

        // Save the duplicated invoice
        await addInvoice(newInvoice);

        res.status(201).json({ 
            message: 'Invoice duplicated successfully', 
            invoice: newInvoice 
        });
    } catch (error) {
        console.error('Duplicate Error:', error);
        res.status(500).json({ error: 'Failed to duplicate invoice' });
    }
});

/**
 * Update entire invoice (edit functionality)
 * PUT /api/invoices/:id
 */
router.put('/:id', validate(invoiceSchema), async (req, res) => {
    try {
        const invoiceID = req.params.id;
        const updatedInvoice = await updateInvoice(invoiceID, req.body);
        res.json({ 
            message: 'Invoice updated successfully', 
            invoice: updatedInvoice 
        });
    } catch (error) {
        console.error('Update Error:', error);
        res.status(404).json({ error: error.message });
    }
});

/**
 * Get single invoice by ID
 * GET /api/invoices/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const invoices = await getInvoices();
        const invoice = invoices.find(i => i.invoiceID === req.params.id);
        
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        res.json(invoice);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});

module.exports = router;