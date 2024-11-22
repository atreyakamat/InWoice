const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const fs = require('fs');
const punycode = require('punycode/');


const app = express();
app.use(bodyParser.json());

// Load service account credentials
const credentials = JSON.parse(fs.readFileSync('inwoice-6f8387c13e06.json', 'utf-8'));
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Replace with your Google Sheet ID
const SPREADSHEET_ID = '1xbMuGNsgSgqOo4THeeuRgKTjZnr2hk1vn9zZ8RAoqRI';

app.get('/', (req, res) => {
    res.send('Welcome to the Invoice Generator API! Use POST /generate-invoice to create invoices.');
});


app.post('/generate-invoice', async (req, res) => {
    try {
        const { CustomerName, Product, Quantity, PricePerUnit, Date } = req.body;
        const total = Quantity * PricePerUnit;

        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: 'Invoices!A:E',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [[CustomerName, Product, Quantity, PricePerUnit, total, Date]],
            },
        };

        await sheets.spreadsheets.values.append(request);
        res.status(200).send({ message: 'Invoice logged successfully.' });
    } catch (error) {
        res.status(500).send({ error: 'Error writing to Google Sheets.', details: error.message });
        console.error(error);
            }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
