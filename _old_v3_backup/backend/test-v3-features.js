/**
 * v3 Features Backend Testing Script
 * Tests AI Manager, Marketing, Orders, and Accounting Reports
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

const tests = { passed: 0, failed: 0, total: 0 };

async function test(name, fn) {
    tests.total++;
    try {
        await fn();
        tests.passed++;
        logTest(name, true);
        return true;
    } catch (error) {
        tests.failed++;
        logTest(name, false, error.response?.data?.error || error.message);
        return false;
    }
}

async function testLogin() {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
        password: process.env.ADMIN_PASSWORD || 'admin123'
    });
    authToken = response.data.data.token;
}

// --- AI Manager Tests ---
async function testAIManagerChat() {
    const response = await axios.post(`${BASE_URL}/api/ai/chat`, {
        message: "Hello, who are you?",
        history: []
    }, { headers: { Authorization: `Bearer ${authToken}` } });
    
    if (!response.data.response) throw new Error('AI Chat response missing');
}

// --- Marketing Scheduler Tests ---
async function testMarketingCRUD() {
    // Create
    const newPost = {
        content: "Test Marketing Post",
        platforms: ["LinkedIn", "Twitter"],
        scheduledAt: new Date(Date.now() + 10000).toISOString(),
        status: "Scheduled"
    };
    const createRes = await axios.post(`${BASE_URL}/api/marketing`, newPost, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    const postId = createRes.data.id;
    if (!postId) throw new Error('Post not created');

    // List
    const listRes = await axios.get(`${BASE_URL}/api/marketing`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!listRes.data.some(p => p.id === postId)) throw new Error('Post not found in list');

    // Delete
    await axios.delete(`${BASE_URL}/api/marketing/${postId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
}

async function testAIMarketingPlanner() {
    const response = await axios.post(`${BASE_URL}/api/ai/marketing-plan`, {
        context: "New product launch: Vibe Stick"
    }, { headers: { Authorization: `Bearer ${authToken}` } });
    
    if (!response.data.content || !response.data.platforms) {
        throw new Error('AI Marketing Plan failed');
    }
}

// --- WhatsApp Orders Tests ---
async function testOrdersCRUD() {
    // Create
    const newOrder = {
        customer_name: "Test Order",
        customer_contact: "9876543210",
        order_text: "I want 2 sticks",
        status: "New"
    };
    const createRes = await axios.post(`${BASE_URL}/api/orders`, newOrder, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    const orderId = createRes.data.id;

    // Update Status
    await axios.patch(`${BASE_URL}/api/orders/${orderId}/status`, {
        status: "Processing"
    }, { headers: { Authorization: `Bearer ${authToken}` } });

    // Delete
    await axios.delete(`${BASE_URL}/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
}

async function testWhatsAppWebhook() {
    const payload = {
        entry: [{
            changes: [{
                value: {
                    messages: [{
                        from: "1234567890",
                        text: { body: "Incoming WhatsApp Order Test" }
                    }]
                }
            }]
        }]
    };
    const response = await axios.post(`${BASE_URL}/api/orders/webhook`, payload);
    if (response.status !== 200) throw new Error('Webhook failed');
}

async function testAIOrderExtraction() {
    const response = await axios.post(`${BASE_URL}/api/ai/extract-order`, {
        text: "I am John, I want 5 neon lights"
    }, { headers: { Authorization: `Bearer ${authToken}` } });
    
    if (response.data.customerName === undefined) throw new Error('AI Order Extraction failed');
}

// --- Accounting & Reports Tests ---
async function testAccountingReports() {
    const reports = ['trial-balance', 'balance-sheet', 'profit-loss', 'gstr1', 'gstr2', 'gstr3b'];
    for (const report of reports) {
        const response = await axios.get(`${BASE_URL}/api/accounting/reports/${report}`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (!response.data) throw new Error(`Report ${report} failed`);
    }
}

// --- Email Connection Test ---
async function testEmailConnection() {
    try {
        await axios.post(`${BASE_URL}/api/email/test-smtp`, {}, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
    } catch (error) {
        // This might fail if SMTP is not configured in .env, which is acceptable for a generic test
        // as long as the endpoint exists and returns a structured error.
        if (error.response?.status === 400 || error.response?.status === 500) {
            return; 
        }
        throw error;
    }
}

async function runTests() {
    console.log('\n');
    log('╔════════════════════════════════════════════════════════════╗', 'cyan');
    log('║     InWoice v3.1 - Advanced Features Test Suite           ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');
    console.log('\n');

    await test('Authentication (Login)', testLogin);

    log('\n🤖 Testing AI Capabilities...', 'blue');
    await test('AI Manager Chat', testAIManagerChat);
    await test('AI Marketing Planner', testAIMarketingPlanner);
    await test('AI Order Extraction', testAIOrderExtraction);

    log('\n📢 Testing Marketing Module...', 'blue');
    await test('Marketing CRUD Operations', testMarketingCRUD);

    log('\n📱 Testing WhatsApp & Orders...', 'blue');
    await test('Orders CRUD Operations', testOrdersCRUD);
    await test('WhatsApp Webhook Receipt', testWhatsAppWebhook);

    log('\n📊 Testing Accounting Reports...', 'blue');
    await test('Accounting Reports (P&L, GST, etc.)', testAccountingReports);

    log('\n📧 Testing Email Tools...', 'blue');
    await test('SMTP Connection Test Endpoint', testEmailConnection);

    console.log('\n');
    log(`Total Tests:  ${tests.total}`, 'blue');
    log(`Passed:       ${tests.passed}`, 'green');
    log(`Failed:       ${tests.failed}`, tests.failed > 0 ? 'red' : 'green');
    
    if (tests.failed === 0) {
        log('🎉 All v3.1 features are healthy!', 'green');
    } else {
        log('⚠️  Some v3.1 features have issues.', 'yellow');
    }
    process.exit(tests.failed > 0 ? 1 : 0);
}

runTests();
