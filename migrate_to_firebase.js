const fs = require('fs');
const path = require('path');

const credsPath = path.join(__dirname, 'backend/firebase-credentials.json');

if (!fs.existsSync(credsPath)) {
    console.error('❌ ERROR: backend/firebase-credentials.json not found.');
    console.error('Please add your Firebase service account key before migrating.');
    process.exit(1);
}

const sqliteService = require('./backend/services/sqliteService');
const firebaseService = require('./backend/services/firebaseService');

const migrate = async () => {
    console.log('Starting migration from SQLite to Firebase...');

    try {
        // 1. Settings
        console.log('Migrating Settings...');
        const settings = sqliteService.getSettings();
        await firebaseService.updateSettings(settings);

        // 2. Products
        console.log('Migrating Products...');
        const products = sqliteService.getProducts();
        for (const p of products) {
            await firebaseService.addProduct(p);
        }

        // 3. Customers & Invoices
        // Since addInvoice also updates customers in Firebase, we can just add all invoices.
        console.log('Migrating Invoices & Customers...');
        const invoices = sqliteService.getInvoices();
        for (const inv of invoices) {
            await firebaseService.addInvoice(inv);
        }

        console.log('✅ Migration to Firebase completed successfully!');
        console.log('You can now restart your backend server. It will automatically detect firebase-credentials.json and use Firebase.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
};

migrate();
