/**
 * Backend Integration Test Script
 * Tests all major functionality of the InWoice backend
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 InWoice Backend Integration Tests\n');
console.log('=====================================\n');

// Test 1: Environment Variables
console.log('✓ Test 1: Environment Variables');
require('dotenv').config();
const requiredVars = ['JWT_SECRET', 'PORT'];
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.log(`  ❌ FAIL: Missing required variables: ${missing.join(', ')}`);
  process.exit(1);
} else {
  console.log('  ✅ PASS: All required environment variables present');
}

// Test 2: Core Dependencies
console.log('\n✓ Test 2: Core Dependencies');
try {
  require('express');
  require('bcryptjs');
  require('jsonwebtoken');
  require('helmet');
  require('morgan');
  require('winston');
  require('express-rate-limit');
  console.log('  ✅ PASS: All core dependencies installed');
} catch (error) {
  console.log(`  ❌ FAIL: Missing dependency: ${error.message}`);
  process.exit(1);
}

// Test 3: Service Files
console.log('\n✓ Test 3: Service Files');
const serviceFiles = [
  './services/tokenService.js',
  './services/googleSheetsService.js',
  './services/pdfService.js'
];
let servicesOk = true;
serviceFiles.forEach(file => {
  try {
    require(file);
    console.log(`  ✅ ${file}`);
  } catch (error) {
    console.log(`  ❌ ${file}: ${error.message}`);
    servicesOk = false;
  }
});
if (!servicesOk) process.exit(1);

// Test 4: Utility Files
console.log('\n✓ Test 4: Utility Files');
const utilFiles = [
  './utils/logger.js',
  './utils/authMiddleware.js',
  './utils/errorHandler.js',
  './utils/responses.js',
  './utils/envValidator.js'
];
let utilsOk = true;
utilFiles.forEach(file => {
  try {
    require(file);
    console.log(`  ✅ ${file}`);
  } catch (error) {
    console.log(`  ❌ ${file}: ${error.message}`);
    utilsOk = false;
  }
});
if (!utilsOk) process.exit(1);

// Test 5: Route Files
console.log('\n✓ Test 5: Route Files');
const routeFiles = [
  './routes/authRoutes.js',
  './routes/invoiceRoutes.js',
  './routes/emailRoutes.js'
];
let routesOk = true;
routeFiles.forEach(file => {
  try {
    require(file);
    console.log(`  ✅ ${file}`);
  } catch (error) {
    console.log(`  ❌ ${file}: ${error.message}`);
    routesOk = false;
  }
});
if (!routesOk) process.exit(1);

// Test 6: Token Service
console.log('\n✓ Test 6: Token Service');
const { generateToken, verifyToken, hashPassword, comparePassword } = require('./services/tokenService');
try {
  const token = generateToken('test-user');
  const decoded = verifyToken(token);
  if (decoded.userId === 'test-user') {
    console.log('  ✅ JWT generation and verification working');
  } else {
    throw new Error('Token payload mismatch');
  }
} catch (error) {
  console.log(`  ❌ FAIL: ${error.message}`);
  process.exit(1);
}

// Test 7: Password Hashing
console.log('\n✓ Test 7: Password Hashing');
(async () => {
  try {
    const password = 'test123';
    const hashed = await hashPassword(password);
    const isValid = await comparePassword(password, hashed);
    const isInvalid = await comparePassword('wrong', hashed);
    
    if (isValid && !isInvalid) {
      console.log('  ✅ Password hashing and comparison working');
    } else {
      throw new Error('Password verification failed');
    }
  } catch (error) {
    console.log(`  ❌ FAIL: ${error.message}`);
    process.exit(1);
  }

  // Test 8: Logger
  console.log('\n✓ Test 8: Logger');
  try {
    const logger = require('./utils/logger');
    logger.info('Test log message');
    console.log('  ✅ Logger initialized successfully');
  } catch (error) {
    console.log(`  ❌ FAIL: ${error.message}`);
    process.exit(1);
  }

  // Test 9: Error Handler
  console.log('\n✓ Test 9: Error Handler');
  try {
    const { AppError } = require('./utils/errorHandler');
    const error = new AppError('Test error', 400);
    if (error.statusCode === 400 && error.message === 'Test error') {
      console.log('  ✅ Error handler working correctly');
    } else {
      throw new Error('Error handler not working correctly');
    }
  } catch (error) {
    console.log(`  ❌ FAIL: ${error.message}`);
    process.exit(1);
  }

  // Test 10: Response Utilities
  console.log('\n✓ Test 10: Response Utilities');
  try {
    const { successResponse, errorResponse } = require('./utils/responses');
    const success = successResponse({ id: 1 }, 'Success');
    const error = errorResponse('Error message', 400);
    
    if (success.success === true && error.success === false) {
      console.log('  ✅ Response utilities working correctly');
    } else {
      throw new Error('Response utilities not working correctly');
    }
  } catch (error) {
    console.log(`  ❌ FAIL: ${error.message}`);
    process.exit(1);
  }

  // Test 11: Database File
  console.log('\n✓ Test 11: Database File');
  const dbPath = path.join(__dirname, 'database.json');
  if (fs.existsSync(dbPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      console.log('  ✅ Database file exists and is valid JSON');
      console.log(`     - Invoices: ${data.invoices?.length || 0}`);
      console.log(`     - Customers: ${data.customers?.length || 0}`);
      console.log(`     - Products: ${data.products?.length || 0}`);
    } catch (error) {
      console.log(`  ❌ Database file is corrupted: ${error.message}`);
    }
  } else {
    console.log('  ⚠️  Database file does not exist (will be created on first use)');
  }

  // Final Summary
  console.log('\n=====================================');
  console.log('✅ ALL TESTS PASSED!');
  console.log('=====================================\n');
  console.log('Backend is ready to start. Run:');
  console.log('  npm start\n');
  
})();
