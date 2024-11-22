const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const fs = require('fs');
const cors = require('cors');

const app = express();

// CORS options configuration
const corsOptions = {
    origin: '*',  // Allow all origins (or specify domains for production)
    methods: ['GET', 'POST'],  // Allow specific methods
    allowedHeaders: ['Content-Type'],  // Allow headers
};

// Use CORS middleware
app.use(cors(corsOptions));  // Apply CORS globally

// Middleware for parsing JSON requests
app.use(bodyParser.json());

// Load service account credentials (Make sure the file path is correct)
const credentials = JSON.parse(fs.readFileSync('inwoice-b7811dd21d1b.json', 'utf-8'));  // Ensure correct filename
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Replace with your Google Sheet ID
const SPREADSHEET_ID = '1xbMuGNsgSgqOo4THeeuRgKTjZnr2hk1vn9zZ8RAoqRI';

// Root route
app.get('/', (req, res) => { 
    res.send('Welcome to the Invoice Generator API! Use POST /generate-invoice to create invoices.');
});

// Generate Invoice API route
app.post('/generate-invoice', async (req, res) => {
    try {
        // Extract data from request body
        const { CustomerName, Product, Quantity, PricePerUnit, Date } = req.body;
        
        // Calculate the total price
        const total = Quantity * PricePerUnit;

        // Prepare the data to be appended to the Google Sheets
        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: 'Invoices!A:F',  // Update the range to match your sheet structure (e.g., A:F for 6 columns)
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [[CustomerName, Product, Quantity, PricePerUnit, total, Date]],  // Add the correct number of columns
            },
        };

        // Append the data to the sheet
        const response = await sheets.spreadsheets.values.append(request);

        // Send a success response back to the client
        res.status(200).send({ message: 'Invoice logged successfully.', data: response.data });
    } catch (error) {
        // Handle errors and send a response back with details
        res.status(500).send({
            error: 'Error writing to Google Sheets.',
            details: error.message,
        });
        console.error('Error writing to Google Sheets:', error);
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
