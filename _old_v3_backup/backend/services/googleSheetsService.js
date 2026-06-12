const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

/**
 * Sync an invoice to real Google Sheets
 */
const syncToGoogleSheets = async (invoice) => {
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ? path.join(__dirname, '../', process.env.GOOGLE_APPLICATION_CREDENTIALS) : null;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!credsPath || !fs.existsSync(credsPath) || !spreadsheetId) {
        return; 
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: credsPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const values = [
            [
                invoice.invoiceID,
                invoice.date,
                invoice.customerName,
                invoice.customerEmail,
                invoice.customerPhone,
                invoice.instagramHandle,
                typeof invoice.itemsJSON === 'string' ? invoice.itemsJSON : JSON.stringify(invoice.itemsJSON),
                invoice.subtotal,
                invoice.discount,
                invoice.shipping,
                invoice.tax,
                invoice.grandTotal,
                invoice.paymentStatus,
                invoice.paymentMethod,
                invoice.notes
            ]
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Invoices!A:O',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values }
        });
        console.log('✅ Synced invoice to real Google Sheets');
    } catch (err) {
        console.error('❌ Failed to sync to Google Sheets:', err.message);
    }
};

module.exports = {
    syncToGoogleSheets
};
