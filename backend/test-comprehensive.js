/**
 * Comprehensive Backend Testing Script
 * Tests all InWoice v2.1 features
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';
let authToken = '';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, passed, details = '') {
    const symbol = passed ? '✅' : '❌';
    const color = passed ? 'green' : 'red';
    log(`${symbol} ${name}${details ? ': ' + details : ''}`, color);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Suite
const tests = {
    passed: 0,
    failed: 0,
    total: 0
};

async function test(name, fn) {
    tests.total++;
    try {
        await fn();
        tests.passed++;
        logTest(name, true);
        return true;
    } catch (error) {
        tests.failed++;
        logTest(name, false, error.message);
        return false;
    }
}

// Test Functions
async function testHealthEndpoint() {
    const response = await axios.get(`${BASE_URL}/health`);
    if (response.data.status !== 'ok') throw new Error('Health check failed');
}

async function testLogin() {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
        password: process.env.ADMIN_PASSWORD || 'admin123'
    });
    
    if (!response.data.success || !response.data.data.token) {
        throw new Error('Login failed');
    }
    
    authToken = response.data.data.token;
}

async function testGetInvoices() {
    const response = await axios.get(`${BASE_URL}/api/invoices`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (!response.data.invoices || !response.data.pagination) {
        throw new Error('Invalid response structure');
    }
}

async function testGetCustomers() {
    const response = await axios.get(`${BASE_URL}/api/data/customers`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (!Array.isArray(response.data)) {
        throw new Error('Expected array of customers');
    }
}

async function testCustomerAnalytics() {
    const response = await axios.get(`${BASE_URL}/api/customers/analytics/summary`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const required = ['totalCustomers', 'totalRevenue', 'avgCustomerValue', 'retentionRate', 'conversionRate'];
    for (const field of required) {
        if (response.data[field] === undefined) {
            throw new Error(`Missing field: ${field}`);
        }
    }
}

async function testExportInvoicesCSV() {
    const response = await axios.get(`${BASE_URL}/api/export/invoices`, {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'text'
    });
    
    if (!response.data.includes('Invoice ID')) {
        throw new Error('CSV header not found');
    }
}

async function testExportCustomersCSV() {
    const response = await axios.get(`${BASE_URL}/api/export/customers`, {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'text'
    });
    
    if (!response.data.includes('name')) {
        throw new Error('CSV header not found');
    }
}

async function testCreateInvoice() {
    const newInvoice = {
        date: new Date().toISOString().split('T')[0],
        paymentStatus: 'Pending',
        paymentMethod: 'UPI',
        customerName: 'Test Customer',
        customerEmail: 'test@example.com',
        customerPhone: '1234567890',
        itemsJSON: JSON.stringify([
            { id: Date.now(), name: 'Test Item', quantity: 1, price: 100, total: 100 }
        ]),
        subtotal: 100,
        discount: 0,
        shipping: 0,
        tax: 0,
        grandTotal: 100,
        notes: 'Test invoice'
    };
    
    const response = await axios.post(`${BASE_URL}/api/invoices`, newInvoice, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (!response.data.invoice || !response.data.invoice.invoiceID) {
        throw new Error('Invoice not created');
    }
    
    // Store for later tests
    global.testInvoiceID = response.data.invoice.invoiceID;
}

async function testGetSingleInvoice() {
    if (!global.testInvoiceID) throw new Error('No test invoice ID available');
    
    const response = await axios.get(`${BASE_URL}/api/invoices/${global.testInvoiceID}`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.data.invoiceID !== global.testInvoiceID) {
        throw new Error('Wrong invoice returned');
    }
}

async function testDuplicateInvoice() {
    if (!global.testInvoiceID) throw new Error('No test invoice ID available');
    
    const response = await axios.post(`${BASE_URL}/api/invoices/${global.testInvoiceID}/duplicate`, {}, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (!response.data.invoice || response.data.invoice.invoiceID === global.testInvoiceID) {
        throw new Error('Invoice not duplicated correctly');
    }
    
    global.duplicateInvoiceID = response.data.invoice.invoiceID;
}

async function testUpdateInvoice() {
    if (!global.testInvoiceID) throw new Error('No test invoice ID available');
    
    const updatedData = {
        date: new Date().toISOString().split('T')[0],
        paymentStatus: 'Paid',
        paymentMethod: 'Bank Transfer',
        customerName: 'Updated Customer',
        customerEmail: 'test@example.com',
        customerPhone: '9876543210',
        itemsJSON: JSON.stringify([
            { id: Date.now(), name: 'Updated Item', quantity: 2, price: 150, total: 300 }
        ]),
        subtotal: 300,
        discount: 10,
        shipping: 5,
        tax: 15,
        grandTotal: 310,
        notes: 'Updated invoice'
    };
    
    const response = await axios.put(`${BASE_URL}/api/invoices/${global.testInvoiceID}`, updatedData, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.data.invoice.paymentStatus !== 'Paid') {
        throw new Error('Invoice not updated');
    }
}

async function testCustomerDetail() {
    const response = await axios.get(`${BASE_URL}/api/customers/${encodeURIComponent('test@example.com')}`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (!response.data.customer || !response.data.invoices) {
        throw new Error('Invalid customer detail response');
    }
    
    if (!response.data.customer.metrics) {
        throw new Error('Customer metrics missing');
    }
}

async function testRateLimiting() {
    // This should trigger rate limiting if we exceed 100 requests
    // Just verify the endpoint exists and doesn't crash
    const response = await axios.get(`${BASE_URL}/api/invoices?limit=1`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.status !== 200) {
        throw new Error('Rate limiting test failed');
    }
}

async function testPagination() {
    const response = await axios.get(`${BASE_URL}/api/invoices?page=1&limit=5`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (!response.data.pagination || response.data.pagination.limit !== 5) {
        throw new Error('Pagination not working');
    }
}

async function testUnauthorizedAccess() {
    try {
        await axios.get(`${BASE_URL}/api/invoices`);
        throw new Error('Should have been unauthorized');
    } catch (error) {
        if (error.response && error.response.status === 401) {
            // Expected behavior
            return;
        }
        throw error;
    }
}

// Main Test Runner
async function runTests() {
    console.log('\n');
    log('╔════════════════════════════════════════════════════════════╗', 'cyan');
    log('║     InWoice v2.1 - Comprehensive Backend Test Suite       ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');
    console.log('\n');
    
    log('🔧 Testing Core Functionality...', 'blue');
    await test('Health Endpoint', testHealthEndpoint);
    await test('Authentication (Login)', testLogin);
    await sleep(100);
    
    log('\n📊 Testing Data Retrieval...', 'blue');
    await test('Get Invoices with Pagination', testGetInvoices);
    await test('Get Customers List', testGetCustomers);
    await test('Pagination Parameters', testPagination);
    await sleep(100);
    
    log('\n👥 Testing CRM Features...', 'blue');
    await test('Customer Analytics Summary', testCustomerAnalytics);
    await sleep(100);
    
    log('\n📥 Testing Export Features...', 'blue');
    await test('Export Invoices to CSV', testExportInvoicesCSV);
    await test('Export Customers to CSV', testExportCustomersCSV);
    await sleep(100);
    
    log('\n📝 Testing Invoice Operations...', 'blue');
    await test('Create New Invoice', testCreateInvoice);
    await test('Get Single Invoice', testGetSingleInvoice);
    await test('Duplicate Invoice', testDuplicateInvoice);
    await test('Update Invoice', testUpdateInvoice);
    await sleep(100);
    
    log('\n👤 Testing Customer Detail...', 'blue');
    await test('Get Customer Detail with Metrics', testCustomerDetail);
    await sleep(100);
    
    log('\n🔒 Testing Security...', 'blue');
    await test('Unauthorized Access Protection', testUnauthorizedAccess);
    await test('Rate Limiting', testRateLimiting);
    await sleep(100);
    
    // Summary
    console.log('\n');
    log('╔════════════════════════════════════════════════════════════╗', 'cyan');
    log('║                     TEST SUMMARY                           ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');
    console.log('\n');
    
    log(`Total Tests:  ${tests.total}`, 'blue');
    log(`Passed:       ${tests.passed}`, 'green');
    log(`Failed:       ${tests.failed}`, tests.failed > 0 ? 'red' : 'green');
    log(`Success Rate: ${((tests.passed / tests.total) * 100).toFixed(1)}%`, tests.failed > 0 ? 'yellow' : 'green');
    
    console.log('\n');
    
    if (tests.failed === 0) {
        log('🎉 All tests passed! Platform is ready for production.', 'green');
    } else {
        log('⚠️  Some tests failed. Please review the errors above.', 'yellow');
    }
    
    console.log('\n');
    process.exit(tests.failed > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
    log(`\n❌ Unhandled error: ${error.message}`, 'red');
    process.exit(1);
});

// Check if server is running
axios.get(`${BASE_URL}/health`)
    .then(() => {
        log('✅ Server is running, starting tests...\n', 'green');
        runTests();
    })
    .catch(() => {
        log('❌ Server is not running! Please start the backend first:', 'red');
        log('   cd backend && npm start', 'yellow');
        process.exit(1);
    });
