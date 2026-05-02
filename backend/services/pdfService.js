const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const he = require('he');
const genericPool = require('generic-pool');
const { getSettings } = require('./dbService');

let templateCache = null;

/**
 * Convert local image path to base64 data URL for PDF embedding
 */
const imageToBase64 = (imageUrl) => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('data:')) return imageUrl;
    
    try {
        // If it's a relative path from our uploads
        if (imageUrl.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, '..', imageUrl);
            if (fs.existsSync(filePath)) {
                const bitmap = fs.readFileSync(filePath);
                const ext = path.extname(filePath).slice(1);
                return `data:image/${ext};base64,${bitmap.toString('base64')}`;
            }
        }
        return imageUrl; // Fallback to original (might be a full URL)
    } catch (err) {
        console.error('Error converting image to base64:', err);
        return imageUrl;
    }
};

/**
 * Browser pool to reuse puppeteer instances
 */
const factory = {
    create: async () => {
        return await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
    },
    destroy: async (browser) => {
        await browser.close();
    },
    validate: (browser) => {
        return browser.isConnected();
    }
};

const browserPool = genericPool.createPool(factory, {
    max: 3, // maximum number of browsers
    min: 1, // minimum number of browsers
    testOnBorrow: true,
    autostart: true,
    idleTimeoutMillis: 30000, // 30 seconds
    evictionRunIntervalMillis: 1000,
});

/**
 * Load and cache the invoice template
 * @returns {Promise<string>} HTML template
 */
const loadTemplate = async () => {
    if (!templateCache) {
        const templatePath = path.join(__dirname, '../templates/invoiceTemplate.html');
        templateCache = await fs.promises.readFile(templatePath, 'utf-8');
    }
    return templateCache;
};

/**
 * Clear template cache (useful for development)
 */
const clearTemplateCache = () => {
    templateCache = null;
};

const generatePDF = async (invoiceData) => {
    // Load template from cache
    let template = await loadTemplate();
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

    let logoHTML = '';
    if (settings.logo) {
        const logoBase64 = imageToBase64(settings.logo);
        logoHTML = `<img src="${logoBase64}" alt="Logo" style="max-height: 60px; max-width: 200px; margin-bottom: 10px; object-fit: contain;" />`;
    }

    const replacements = {
        businessName: sanitize(settings.businessName) || 'Stix N Vibes',
        logoHTML: logoHTML,
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
        const itemImageBase64 = item.image ? imageToBase64(item.image) : null;
        const imgTag = itemImageBase64 ? `<img src="${itemImageBase64}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px; margin-right: 8px; vertical-align: middle;" />` : '';

        itemsHTML += `
            <tr>
                <td>
                    <div style="display: flex; align-items: center;">
                        ${imgTag}
                        <div>
                            ${sanitize(item.name)}<br>
                            <small>${sanitize(item.description) || ''}</small>
                        </div>
                    </div>
                </td>
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

    const browser = await browserPool.acquire();
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
        await page.close(); 
        await browserPool.release(browser);
    }
};

module.exports = { 
    generatePDF,
    clearTemplateCache 
};