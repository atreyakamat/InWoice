/**
 * Frontend Integration Check Script
 * Validates frontend configuration and key files
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 InWoice Frontend Validation\n');
console.log('=====================================\n');

// Test 1: Environment File
console.log('✓ Test 1: Environment Configuration');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  if (envContent.includes('REACT_APP_API_URL')) {
    console.log('  ✅ PASS: .env file configured correctly');
  } else {
    console.log('  ❌ FAIL: REACT_APP_API_URL not found in .env');
    process.exit(1);
  }
} else {
  console.log('  ❌ FAIL: .env file not found');
  console.log('     Create frontend/.env with:');
  console.log('     REACT_APP_API_URL=http://localhost:5000');
  process.exit(1);
}

// Test 2: Key Source Files
console.log('\n✓ Test 2: Key Source Files');
const sourceFiles = [
  'src/App.js',
  'src/index.js',
  'src/apiConfig.js',
  'src/pages/Login.jsx',
  'src/pages/Dashboard.jsx',
  'src/components/Sidebar.jsx'
];

let filesOk = true;
sourceFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - NOT FOUND`);
    filesOk = false;
  }
});

if (!filesOk) {
  console.log('\n  ⚠️  Some files are missing');
}

// Test 3: API Config
console.log('\n✓ Test 3: API Configuration');
const apiConfigPath = path.join(__dirname, 'src/apiConfig.js');
if (fs.existsSync(apiConfigPath)) {
  const content = fs.readFileSync(apiConfigPath, 'utf-8');
  const checks = [
    { name: 'API_BASE_URL', present: content.includes('API_BASE_URL') },
    { name: 'API_ENDPOINTS', present: content.includes('API_ENDPOINTS') },
    { name: 'isAuthenticated', present: content.includes('isAuthenticated') },
    { name: 'setToken', present: content.includes('setToken') },
    { name: 'axios interceptors', present: content.includes('interceptors') }
  ];
  
  checks.forEach(check => {
    if (check.present) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ❌ ${check.name} - NOT FOUND`);
      filesOk = false;
    }
  });
} else {
  console.log('  ❌ apiConfig.js not found');
  filesOk = false;
}

// Test 4: Package Dependencies
console.log('\n✓ Test 4: Package Dependencies');
const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  const requiredDeps = [
    'react',
    'react-dom',
    'react-router-dom',
    'axios',
    'react-toastify'
  ];
  
  requiredDeps.forEach(dep => {
    if (pkg.dependencies[dep]) {
      console.log(`  ✅ ${dep}`);
    } else {
      console.log(`  ❌ ${dep} - NOT INSTALLED`);
      filesOk = false;
    }
  });
}

// Test 5: Login Page Integration
console.log('\n✓ Test 5: Login Page Integration');
const loginPath = path.join(__dirname, 'src/pages/Login.jsx');
if (fs.existsSync(loginPath)) {
  const content = fs.readFileSync(loginPath, 'utf-8');
  const checks = [
    { name: 'API_ENDPOINTS import', present: content.includes('API_ENDPOINTS') },
    { name: 'setToken import', present: content.includes('setToken') },
    { name: 'isLoading state', present: content.includes('isLoading') },
    { name: 'Error handling', present: content.includes('error') }
  ];
  
  checks.forEach(check => {
    if (check.present) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ⚠️  ${check.name} - not found (may be expected)`);
    }
  });
}

// Test 6: App.js Toast Integration
console.log('\n✓ Test 6: App.js Toast Integration');
const appPath = path.join(__dirname, 'src/App.js');
if (fs.existsSync(appPath)) {
  const content = fs.readFileSync(appPath, 'utf-8');
  const checks = [
    { name: 'ToastContainer import', present: content.includes('ToastContainer') },
    { name: 'react-toastify CSS', present: content.includes('react-toastify/dist/ReactToastify.css') },
    { name: 'isAuthenticated import', present: content.includes('isAuthenticated') }
  ];
  
  checks.forEach(check => {
    if (check.present) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ⚠️  ${check.name} - not found`);
    }
  });
}

// Final Summary
console.log('\n=====================================');
if (filesOk) {
  console.log('✅ FRONTEND VALIDATION PASSED!');
  console.log('=====================================\n');
  console.log('Frontend is ready. To start:');
  console.log('  1. Ensure backend is running on http://localhost:5000');
  console.log('  2. Run: npm start');
  console.log('  3. Visit: http://localhost:3000\n');
} else {
  console.log('⚠️  SOME CHECKS FAILED');
  console.log('=====================================\n');
  console.log('Please review the errors above.\n');
}
