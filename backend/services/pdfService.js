const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const he = require('he');
const { getSettings } = require('./googleSheetsService');

let browserInstance = null;

const getBrowser = async () => {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        // Handle unexpected browser closure
        browserInstance.on('disconnected', () => {
            browserInstance = null;
        });
    }
    return browserInstance;
};

const generatePDF = async (invoiceData) => {
    const templatePath = path.join(__dirname, '../templates/invoiceTemplate.html');
    let template = fs.readFileSync(templatePath, 'utf-8');
    const settings = await getSettings();

    // Sanitize user inputs to prevent HTML injection
    const sanitize = (val) => {
        if (typeof val !== 'string') return val;
        return he.encode(val);
    };

    let qrCodeImage = '';
    if (settings.upiId) {
        const upiString = `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.businessName || 'Stix N Vibes')}&am=${invoiceData.grandTotal}&cu=INR`;
        try {
            const qrDataUrl = await QRCode.toDataURL(upiString);
            qrCodeImage = `<img src="${qrDataUrl}" alt="UPI QR" style="width: 100px; height: 100px; margin-top: 10px;" />`;
        } catch (err) {
            console.error('Failed to generate QR code', err);
        }
    }

    const replacements = {
        businessName: sanitize(settings.businessName) || 'Stix N Vibes',
        address: sanitize(settings.address) || '',
        email: sanitize(settings.email) || '',
        phone: sanitize(settings.phone) || '',
        website: sanitize(settings.website) || '',
        invoiceID: sanitize(invoiceData.invoiceID),
        date: sanitize(invoiceData.date),
        dueDate: sanitize(invoiceData.dueDate),
        customerName: sanitize(invoiceData.customerName),
        customerEmail: sanitize(invoiceData.customerEmail),
        customerPhone: sanitize(invoiceData.customerPhone) || '',
        shippingAddress: sanitize(invoiceData.shippingAddress) || '',
        instagramHandle: invoiceData.instagramHandle ? `@${sanitize(invoiceData.instagramHandle)}` : '',
        paymentStatus: sanitize(invoiceData.paymentStatus),
        paymentMethod: sanitize(invoiceData.paymentMethod),
        paymentInfo: sanitize(invoiceData.paymentInfo) || '',
        upiId: sanitize(settings.upiId) || '',
        qrCodeImage: qrCodeImage, // Injected as HTML tag, already contains sanitized data
        currency: sanitize(settings.defaultCurrency) || '$',
        subtotal: invoiceData.subtotal,
        discount: invoiceData.discount || 0,
        shipping: invoiceData.shipping || 0,
        tax: invoiceData.tax || 0,
        grandTotal: invoiceData.grandTotal,
        notes: sanitize(invoiceData.notes) || ''
    };

    let itemsHTML = '';
    const items = typeof invoiceData.itemsJSON === 'string' ? JSON.parse(invoiceData.itemsJSON) : invoiceData.itemsJSON;
    items.forEach(item => {
        itemsHTML += `
            <tr>
                <td>${sanitize(item.name)}<br><small>${sanitize(item.description) || ''}</small></td>
                <td>${sanitize(item.variant) || ''}</td>
                <td>${item.quantity}</td>
                <td>${replacements.currency}${item.price}</td>
                <td>${replacements.currency}${item.total}</td>
            </tr>
        `;
    });
    replacements.itemsHTML = itemsHTML;

    for (const [key, value] of Object.entries(replacements)) {
        let strValue = (value !== undefined && value !== null) ? String(value) : '';
        strValue = strValue.replace(/\$/g, '$$$$');
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), strValue);
    }

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(template, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });
        return pdfBuffer;
    } finally {
        await page.close(); // Only close the page, not the browser
    }
};

module.exports = { generatePDF };