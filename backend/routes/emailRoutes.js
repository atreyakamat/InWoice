const express = require('express');
const router = express.Router();
const { getInvoices, getSettings } = require('../services/googleSheetsService');
const { generatePDF } = require('../services/pdfService');
const { sendInvoiceEmail } = require('../services/emailService');
const nodemailer = require('nodemailer');

router.post('/send/:id', async (req, res) => {
    try {
        const invoiceID = req.params.id;
        const invoices = await getInvoices();
        const invoice = invoices.find(i => i.invoiceID === invoiceID);
        
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (!invoice.customerEmail) return res.status(400).json({ error: 'Customer email is required' });

        const pdfBuffer = await generatePDF(invoice);
        await sendInvoiceEmail(invoice, pdfBuffer);

        res.json({ message: 'Email sent successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send email. Check SMTP settings.' });
    }
});

router.post('/remind/:id', async (req, res) => {
    try {
        const invoiceID = req.params.id;
        const invoices = await getInvoices();
        const invoice = invoices.find(i => i.invoiceID === invoiceID);
        
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (!invoice.customerEmail) return res.status(400).json({ error: 'Customer email is required' });

        const settings = await getSettings();
        if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
            return res.status(500).json({ error: 'SMTP settings are not configured properly.' });
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: parseInt(settings.smtpPort) || 587,
            secure: parseInt(settings.smtpPort) === 465,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPass
            }
        });

        const mailOptions = {
            from: `"${settings.businessName}" <${settings.email || settings.smtpUser}>`,
            to: invoice.customerEmail,
            subject: `Payment Reminder: Invoice ${invoice.invoiceID}`,
            text: `Hello ${invoice.customerName},\n\nThis is a friendly reminder that your payment of ${settings.defaultCurrency || '$'}${invoice.grandTotal} for invoice ${invoice.invoiceID} is currently pending.\n\nPlease let us know if you have any questions.\n\nBest regards,\n${settings.businessName}`
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'Reminder sent successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send reminder. Check SMTP settings.' });
    }
});

module.exports = router;