const express = require('express');
const router = express.Router();
const { getInvoices } = require('../services/googleSheetsService');
const { getCustomers } = require('../services/googleSheetsService');
const { getProducts } = require('../services/googleSheetsService');
const { Parser } = require('json2csv');

/**
 * Export Invoices to CSV
 * GET /api/export/invoices?format=csv
 */
router.get('/invoices', async (req, res) => {
    try {
        const invoices = await getInvoices();
        
        // Flatten items for CSV
        const flattenedInvoices = invoices.map(inv => {
            let items = [];
            try {
                items = typeof inv.itemsJSON === 'string' ? JSON.parse(inv.itemsJSON) : inv.itemsJSON;
            } catch (e) {
                items = [];
            }
            
            return {
                'Invoice ID': inv.invoiceID,
                'Date': inv.date,
                'Due Date': inv.dueDate || '',
                'Customer Name': inv.customerName,
                'Customer Email': inv.customerEmail,
                'Customer Phone': inv.customerPhone || '',
                'Instagram': inv.instagramHandle || '',
                'Items': items.map(i => `${i.name} (${i.quantity}x$${i.price})`).join('; '),
                'Subtotal': inv.subtotal,
                'Discount': inv.discount || 0,
                'Shipping': inv.shipping || 0,
                'Tax': inv.tax || 0,
                'Grand Total': inv.grandTotal,
                'Payment Status': inv.paymentStatus,
                'Payment Method': inv.paymentMethod || '',
                'Notes': inv.notes || '',
                'Shipping Address': inv.shippingAddress || ''
            };
        });

        const parser = new Parser();
        const csv = parser.parse(flattenedInvoices);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=invoices-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('CSV Export Error:', error);
        res.status(500).json({ error: 'Failed to export invoices', details: error.message });
    }
});

/**
 * Export Customers to CSV
 * GET /api/export/customers
 */
router.get('/customers', async (req, res) => {
    try {
        const customers = await getCustomers();
        
        const parser = new Parser({
            fields: ['name', 'email', 'phone', 'instagram', 'totalPurchases', 'lastPurchaseDate']
        });
        const csv = parser.parse(customers);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=customers-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('CSV Export Error:', error);
        res.status(500).json({ error: 'Failed to export customers', details: error.message });
    }
});

/**
 * Export Products to CSV
 * GET /api/export/products
 */
router.get('/products', async (req, res) => {
    try {
        const products = await getProducts();
        
        const parser = new Parser({
            fields: ['name', 'category', 'price']
        });
        const csv = parser.parse(products);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=products-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('CSV Export Error:', error);
        res.status(500).json({ error: 'Failed to export products', details: error.message });
    }
});

module.exports = router;
