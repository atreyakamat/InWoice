# InWoice V3.5 - Implementation Priority Matrix

**Date:** June 12, 2026

## CRITICAL PATH (Do First - Blocking Production)

### Week 1: Foundation

#### Priority 1.1: API Response Standardization ⭐⭐⭐
**Time:** 3 hours  
**Impact:** HIGH (blocks all refactoring after this)

**Action Items:**
```javascript
// 1. Create backend/utils/apiResponse.js
exports.success = (res, data, code=200, meta={}) => {...}
exports.error = (res, code, message, statusCode=500, details={}) => {...}

// 2. Update invoiceRoutes.js - 10 response statements
// 3. Update settingsRoutes.js - 3 response statements
// 4. Update collectionRoutes.js - 5 response statements
// 5. Update packRoutes.js - 6 response statements
// 6. Update otherRoutes.js - 25+ more statements
```

**Verification:**
```bash
# All /api/invoices/* calls should return { success, data, meta }
# All /api/settings/* calls should return { success, data, meta }
# All /api/*/error should return { success: false, error }
```

---

#### Priority 1.2: Input Validation & Sanitization ⭐⭐⭐
**Time:** 2.5 hours  
**Impact:** HIGH (security risk if not done)

**Action Items:**
```bash
npm install express-validator xss
```

```javascript
// 1. Create backend/utils/validators.js
const { body, param, query } = require('express-validator');
const xss = require('xss');

exports.validateInvoice = [
  body('customerName').trim().isString().isLength({min:1, max:100}).escape(),
  body('customerEmail').isEmail().normalizeEmail(),
  body('grandTotal').isFloat({min: 0})
];

// 2. Apply to all POST/PUT routes
router.post('/', validateInvoice, (req, res) => {
  // Handle validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({success: false, error: {code: 'VALIDATION_ERROR', message: '...'}});
  }
});

// 3. Sanitize before storing
const sanitized = xss(userInput);
```

**Routes to Update (Priority Order):**
1. `/invoices/POST` - 1 file
2. `/settings/PUT` - 1 file
3. `/collections/POST` - 1 file
4. `/packs/POST` - 1 file
5. `/products/POST` - 1 file
6. `/tasks/POST` - 1 file
7. `/timeline/POST` - 1 file

---

#### Priority 1.3: Database Index Optimization ⭐⭐
**Time:** 30 minutes  
**Impact:** HIGH (performance critical)

**Action Items:**
```sql
-- Run these SQL commands
CREATE INDEX idx_invoices_customerEmail ON invoices(customerEmail);
CREATE INDEX idx_invoices_paymentStatus ON invoices(paymentStatus);
CREATE INDEX idx_invoices_date ON invoices(date);
CREATE INDEX idx_timeline_customerId ON customer_timeline(customer_id);
CREATE INDEX idx_files_refId ON files(reference_id);
CREATE INDEX idx_ai_memory_entity ON ai_memory(entity_type, entity_id);
```

**Verification:**
```bash
# Run performance test
npm run test:performance
# Dashboard should load in < 2 seconds
# Analytics should load in < 3 seconds
```

---

#### Priority 1.4: Error Handling Wrapper ⭐⭐
**Time:** 1.5 hours  
**Impact:** MEDIUM (reduces crashes)

**Action Items:**
```javascript
// 1. Create backend/utils/errorHandler.js
class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// 2. Create centralized error handler middleware
app.use((err, req, res, next) => {
  logger.error({error: err.message, stack: err.stack});
  
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {code: err.code, message: err.message}
    });
  }
  
  res.status(500).json({success: false, error: {code: 'SERVER_ERROR'}});
});

// 3. Wrap all async route handlers
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
router.get('/', asyncHandler(async (req, res) => {...}));
```

---

### Week 2: Security & Stability

#### Priority 2.1: Database Query Pagination ⭐⭐
**Time:** 2 hours  
**Impact:** HIGH (prevents memory overload)

**Endpoints to Update:**
1. GET /api/customers → Add limit/offset
2. GET /api/products → Add limit/offset
3. GET /api/tasks → Add limit/offset
4. GET /api/collections → Add limit/offset
5. GET /api/packs → Add limit/offset
6. GET /api/files → Add limit/offset

**Implementation Pattern:**
```javascript
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  
  const items = await db.getItems();
  const total = items.length;
  const start = (page - 1) * limit;
  
  return res.json({
    success: true,
    data: items.slice(start, start + limit),
    pagination: {page, limit, total, pages: Math.ceil(total/limit)}
  });
});
```

---

#### Priority 2.2: JWT Refresh Token Implementation ⭐⭐
**Time:** 1.5 hours  
**Impact:** HIGH (security best practice)

**Action Items:**
```javascript
// 1. Add refresh token table
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  token TEXT UNIQUE,
  expires_at TEXT,
  created_at TEXT
);

// 2. Issue tokens on login
const accessToken = jwt.sign({id: user.id}, process.env.JWT_SECRET, {expiresIn: '15m'});
const refreshToken = jwt.sign({id: user.id}, process.env.REFRESH_SECRET, {expiresIn: '7d'});
db.saveRefreshToken({userId: user.id, token: refreshToken});

// 3. Add refresh endpoint
router.post('/refresh', (req, res) => {
  const token = req.cookies.refreshToken || req.body.refreshToken;
  const stored = db.getRefreshToken(token);
  
  if (!stored || new Date(stored.expires_at) < new Date()) {
    return res.status(401).json({error: 'Invalid token'});
  }
  
  const newAccessToken = jwt.sign({id: stored.user_id}, process.env.JWT_SECRET, {expiresIn: '15m'});
  res.json({accessToken: newAccessToken});
});
```

---

#### Priority 2.3: File Upload Security Hardening ⭐⭐
**Time:** 1 hour  
**Impact:** MEDIUM (prevents file exploits)

**Action Items:**
```javascript
// 1. Sanitize filenames
const sanitizeFilename = (name) => {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
};

// 2. Use unique names
const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${sanitizeFilename(originalName)}`;

// 3. Add virus scanning (optional - ClamAV)
// For MVP: skip, add in v3.6

// 4. Verify file access
router.get('/files/:id', authMiddleware, (req, res) => {
  const file = db.getFile(id);
  if (file.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({error: 'Access denied'});
  }
  res.download(file.path);
});
```

---

### Week 3: Testing Infrastructure

#### Priority 3.1: Jest Setup & Backend Unit Tests ⭐⭐⭐
**Time:** 12 hours  
**Impact:** HIGH (prevents regressions)

**Setup:**
```bash
npm install --save-dev jest supertest @jest/globals
npx jest --init

# Create test files
mkdir -p backend/__tests__/{routes,services,utils}
```

**Test Suite Structure:**
```
backend/__tests__/
├── routes/
│   ├── invoiceRoutes.test.js (8 tests)
│   ├── customerRoutes.test.js (6 tests)
│   ├── settingsRoutes.test.js (4 tests)
│   ├── collectionRoutes.test.js (5 tests)
│   ├── packRoutes.test.js (5 tests)
│   └── accountingRoutes.test.js (6 tests)
├── services/
│   ├── dbService.test.js (12 tests)
│   ├── pdfService.test.js (8 tests)
│   ├── emailService.test.js (6 tests)
│   └── aiRoutes.test.js (8 tests)
└── utils/
    ├── validation.test.js (5 tests)
    ├── errorHandler.test.js (4 tests)
    └── auth.test.js (6 tests)

TOTAL: ~79 tests → 80%+ coverage on critical paths
```

**Example Test:**
```javascript
describe('invoiceRoutes', () => {
  let app, db;
  
  beforeEach(() => {
    app = require('../server');
    db = require('../services/dbService');
  });
  
  test('POST /invoices creates invoice with unique ID', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .send({
        customerName: 'John',
        customerEmail: 'john@test.com',
        items: [{name: 'Item', quantity: 1, price: 100}],
        grandTotal: 100
      });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invoiceID).toMatch(/^SNV-\d{4}-[A-Z0-9]{6}$/);
  });
  
  test('GET /invoices returns paginated results', async () => {
    const res = await request(app).get('/api/invoices?page=1&limit=10');
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('page', 'limit', 'total');
  });
});
```

---

#### Priority 3.2: Frontend Component Tests ⭐⭐
**Time:** 8 hours  
**Impact:** MEDIUM (prevents UI regressions)

**Setup:**
```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom
```

**Test Files:**
```
frontend/src/__tests__/
├── Dashboard.test.jsx (5 tests)
├── Analytics.test.jsx (4 tests)
├── CreateInvoice.test.jsx (6 tests)
├── CustomerDetail.test.jsx (3 tests)
└── components/
    ├── StatsCards.test.jsx (2 tests)
    └── InvoiceForm.test.jsx (6 tests)

TOTAL: ~26 tests → 70%+ coverage
```

---

#### Priority 3.3: CI/CD Pipeline ⭐⭐
**Time:** 2 hours  
**Impact:** MEDIUM (automates testing)

**Create .github/workflows/test.yml:**
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test -- --coverage
      - uses: codecov/codecov-action@v2
```

---

### Week 4: Performance & Features

#### Priority 4.1: Global Settings Context ⭐
**Time:** 1.5 hours  
**Impact:** MEDIUM (reduces API calls)

**Implementation:**
```javascript
// frontend/src/context/AppContext.jsx
const AppContext = createContext();

export const AppProvider = ({children}) => {
  const [settings, setSettings] = useState(null);
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    api.get('/api/settings').then(setSettings);
  }, []);
  
  return (
    <AppContext.Provider value={{settings, user}}>
      {children}
    </AppContext.Provider>
  );
};

// Usage:
const {settings} = useContext(AppContext);
```

---

#### Priority 4.2: Component Splitting ⭐
**Time:** 8 hours  
**Impact:** LOW (maintainability)

**Components to Extract:**
1. CreateInvoice → InvoiceFormContainer (120 lines)
2. InvoiceForm → ItemsList + CustomerInput (2 files)
3. Dashboard → RevenueChart + StatsCards + ActivityFeed (3 files)
4. Analytics → ChartContainer + AIInsights (2 files)

---

#### Priority 4.3: Response Caching ⭐
**Time:** 1.5 hours  
**Impact:** MEDIUM (performance)

**Implementation:**
```javascript
// Install: npm install node-cache
const NodeCache = require('node-cache');
const cache = new NodeCache({stdTTL: 300});  // 5 minute TTL

router.get('/analytics', (req, res) => {
  const cached = cache.get('analytics');
  if (cached) return res.json(cached);
  
  const data = calculateAnalytics();
  cache.set('analytics', data);
  res.json(data);
});
```

---

## CRITICAL PATH SUMMARY

### Must Complete (Blocking)
1. ✅ API Response Wrapper - **3 hours**
2. ✅ Input Validation - **2.5 hours**
3. ✅ Database Indexes - **0.5 hours**
4. ✅ Test Infrastructure - **14 hours**
5. ✅ Database Pagination - **2 hours**

**Total Critical Path: ~22 hours = ~3 days intensive**

### Should Complete (Before Production)
6. ✅ JWT Refresh Tokens - **1.5 hours**
7. ✅ File Upload Security - **1 hour**
8. ✅ Error Handling - **1.5 hours**
9. ✅ Settings Context - **1.5 hours**
10. ✅ Response Caching - **1.5 hours**

**Total Should-Do: ~8.5 hours = ~1 day**

### Nice-to-Have (After Launch)
11. ⭐ Component Splitting - **8 hours**
12. ⭐ CI/CD Pipeline - **2 hours**
13. ⭐ AI Memory Assembly - **4 hours**
14. ⭐ PDF Optimization - **3 hours**

---

## ESTIMATED TIMELINE

| Week | Focus | Hours | Deliverable |
|---|---|---|---|
| **Week 1** | Foundation | 10 | API responses, validation, indexes |
| **Week 2** | Security | 8.5 | Pagination, JWT, file security |
| **Week 3** | Testing | 14 | 79 unit tests, CI/CD |
| **Week 4** | Performance | 9 | Caching, context, components |
| **Total** | | 41.5 | Production-Ready V3.5 |

---

## DEPLOYMENT CHECKLIST

- [ ] All tests passing (npm run test)
- [ ] Code coverage ≥ 70%
- [ ] API response standardized
- [ ] Input validation on all endpoints
- [ ] Database backed up
- [ ] Environment variables configured
- [ ] SSL certificate valid
- [ ] Error logging configured (Sentry)
- [ ] Monitoring alerts set up
- [ ] Rollback plan documented

