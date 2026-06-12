/**
 * API Test Script for InWoice Backend
 * Run with: node test_api.js
 */
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';
const ADMIN_PASSWORD = 'admin123'; // Matches default in .env.example
let token = '';

async function runTests() {
    console.log('🚀 Starting API Tests...');

    try {
        // 1. Test Login
        console.log('\nTesting Login...');
        const authRes = await axios.post(`${BASE_URL}/auth/login`, { password: ADMIN_PASSWORD });
        token = authRes.data.token;
        console.log('✅ Login Successful');

        const headers = { headers: { Authorization: token } };

        // 2. Test Get Settings
        console.log('\nTesting Fetch Settings...');
        const settingsRes = await axios.get(`${BASE_URL}/data/settings`, headers);
        console.log('✅ Settings Fetched:', settingsRes.data.businessName || 'Default');

        // 3. Test Create Product
        console.log('\nTesting Add Product...');
        const prodRes = await axios.post(`${BASE_URL}/products`, {
            name: 'Test Sticker Pack',
            category: 'Stickers',
            price: 15.99
        }, headers);
        const productId = prodRes.data.product.id;
        console.log('✅ Product Added:', prodRes.data.product.name);

        // 4. Test Create Invoice
        console.log('\nTesting Create Invoice...');
        const invRes = await axios.post(`${BASE_URL}/invoices`, {
            date: new Date().toISOString().split('T')[0],
            paymentStatus: 'Pending',
            paymentMethod: 'UPI',
            customerName: 'Test User',
            customerEmail: 'test@example.com',
            itemsJSON: JSON.stringify([{ name: 'Test Sticker Pack', quantity: 2, price: 15.99, total: 31.98 }]),
            subtotal: 31.98,
            grandTotal: 31.98
        }, headers);
        const invoiceId = invRes.data.invoice.invoiceID;
        console.log('✅ Invoice Created:', invoiceId);

        // 5. Test Update Status
        console.log('\nTesting Update Invoice Status...');
        await axios.patch(`${BASE_URL}/invoices/${invoiceId}/status`, { status: 'Paid' }, headers);
        console.log('✅ Status Updated to Paid');

        // 6. Test Fetch Customers (Verify CRM logic)
        console.log('\nTesting CRM Customer Logic...');
        const custRes = await axios.get(`${BASE_URL}/data/customers`, headers);
        const testCust = custRes.data.find(c => c.email === 'test@example.com');
        if (testCust) {
            console.log('✅ Customer Auto-Created in CRM:', testCust.name);
        } else {
            console.error('❌ Customer not found in CRM');
        }

        // 7. Cleanup (Optional: delete test product)
        console.log('\nCleaning up Test Product...');
        await axios.delete(`${BASE_URL}/products/${productId}`, headers);
        console.log('✅ Cleanup complete');

        console.log('\n✨ ALL TESTS PASSED SUCCESSFULLY! ✨');

    } catch (error) {
        console.error('\n❌ TEST FAILED');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Message:', error.message);
        }
        process.exit(1);
    }
}

runTests();
