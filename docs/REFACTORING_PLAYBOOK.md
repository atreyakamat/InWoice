# InWoice V3.5 - Refactoring & Modernization Playbook

**Date:** June 12, 2026  
**Purpose:** Step-by-step implementation patterns for critical improvements

---

## PART 1: API RESPONSE STANDARDIZATION

### Problem
Inconsistent response formats across 18 route files:
```javascript
// invoiceRoutes
{message: '...', invoice: {}}

// settingsRoutes
{success: true, data: {}}

// accountingRoutes
{rows: [], totals: {}}
```

### Solution Template

**File: backend/utils/apiResponse.js**
```javascript
/**
 * Standardized API Response Handler
 * All endpoints should use these functions for consistency
 */

class ApiResponse {
  static success(res, data, statusCode = 200, message = 'Success') {
    res.status(statusCode).json({
      success: true,
      data: data,
      meta: {
        timestamp: new Date().toISOString(),
        version: '3.5'
      }
    });
  }

  static error(res, error, statusCode = 500, details = null) {
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
        details: process.env.NODE_ENV === 'development' ? details : undefined,
        timestamp: new Date().toISOString()
      }
    });
  }

  static paginated(res, items, total, page, limit, statusCode = 200) {
    res.status(statusCode).json({
      success: true,
      data: items,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '3.5'
      }
    });
  }
}

module.exports = ApiResponse;
```

### Refactoring Steps

**Step 1: invoiceRoutes.js**
```javascript
// BEFORE
router.post('/', validate(invoiceSchema), async (req, res) => {
  try {
    await addInvoice(invoiceData);
    res.status(201).json({ message: 'Invoice created successfully', invoice: invoiceData });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// AFTER
router.post('/', validate(invoiceSchema), async (req, res) => {
  try {
    const invoice = await addInvoice(invoiceData);
    ApiResponse.success(res, invoice, 201, 'Invoice created successfully');
  } catch (error) {
    logger.error('Invoice creation failed:', error);
    ApiResponse.error(res, {
      code: 'INVOICE_CREATE_FAILED',
      message: 'Failed to create invoice'
    }, 500, error.message);
  }
});
```

**Step 2: Apply to all routes** (Use find-and-replace)
- Pattern: `res.json\({.*?}\)` → `ApiResponse.success(res, data)`
- Pattern: `res.status\(.*?\).json\({error.*?}\)` → `ApiResponse.error(res, {...})`

**Effort:** 30 minutes for all 18 files using find-replace

---

## PART 2: INPUT VALIDATION & SANITIZATION

### Problem
No consistent validation across endpoints. Risk of:
- XSS attacks (user input rendered in PDFs)
- SQL injection (though mitigated by parameterized queries)
- Invalid data corruption

### Solution Templates

**File: backend/utils/validation.js**
```javascript
const { body, param, query, validationResult } = require('express-validator');
const xss = require('xss');

// Sanitization helpers
const sanitize = (input) => xss(input, {
  whiteList: {},
  stripIgnoredTag: true,
  stripLeadingAndTrailingSpace: true
});

// Validation schemas
exports.invoiceSchema = [
  body('customerName')
    .trim()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Customer name must be 1-100 characters')
    .customSanitizer(val => sanitize(val)),
  
  body('customerEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email format'),
  
  body('customerPhone')
    .optional()
    .isMobilePhone(['en-US', 'en-IN'])
    .withMessage('Invalid phone format'),
  
  body('grandTotal')
    .isFloat({ min: 0 })
    .withMessage('Grand total must be >= 0'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item required'),
  
  body('items.*.name')
    .trim()
    .isString()
    .isLength({ min: 1, max: 200 })
    .customSanitizer(val => sanitize(val))
];

exports.settingsSchema = [
  body('businessName')
    .trim()
    .optional()
    .isLength({ max: 255 })
    .customSanitizer(val => sanitize(val)),
  
  body('upiId')
    .optional()
    .matches(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/)
    .withMessage('Invalid UPI format')
];

exports.collectionSchema = [
  body('name')
    .trim()
    .isString()
    .isLength({ min: 1, max: 100 })
    .customSanitizer(val => sanitize(val)),
  
  body('description')
    .trim()
    .optional()
    .isLength({ max: 500 })
    .customSanitizer(val => sanitize(val))
];

// Middleware to check validation errors
exports.handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array().map(e => ({
          field: e.param,
          message: e.msg
        }))
      }
    });
  }
  next();
};
```

**File: backend/routes/invoiceRoutes.js (Updated)**
```javascript
const { invoiceSchema, handleValidationErrors } = require('../utils/validation');

router.post('/', 
  invoiceSchema,
  handleValidationErrors,
  async (req, res) => {
    try {
      // Sanitized data is automatically processed
      const invoiceData = req.body;
      await addInvoice(invoiceData);
      ApiResponse.success(res, invoiceData, 201);
    } catch (error) {
      ApiResponse.error(res, {code: 'CREATE_FAILED'}, 500);
    }
  }
);
```

### Implementation Checklist
- [ ] Install express-validator: `npm install express-validator xss`
- [ ] Create validation.js file
- [ ] Add schemas for: invoices, settings, collections, packs, products
- [ ] Update all POST/PUT routes to use validation middleware
- [ ] Add handleValidationErrors middleware
- [ ] Test with invalid data
- [ ] Verify XSS protection

---

## PART 3: DATABASE OPTIMIZATION

### Index Implementation

**File: backend/migrations/001-add-indexes.sql**
```sql
-- Performance Indexes for Common Queries
CREATE INDEX idx_invoices_customerEmail ON invoices(customerEmail);
CREATE INDEX idx_invoices_paymentStatus ON invoices(paymentStatus);
CREATE INDEX idx_invoices_date ON invoices(date DESC);
CREATE INDEX idx_invoices_date_status ON invoices(date DESC, paymentStatus);

CREATE INDEX idx_customers_email ON customers(email);

CREATE INDEX idx_timeline_customerId ON customer_timeline(customer_id);
CREATE INDEX idx_timeline_created ON customer_timeline(created_at DESC);

CREATE INDEX idx_files_refId ON files(reference_id);
CREATE INDEX idx_files_created ON files(created_at DESC);

CREATE INDEX idx_ai_memory_entity ON ai_memory(entity_type, entity_id);
CREATE INDEX idx_ai_memory_created ON ai_memory(created_at DESC);

CREATE INDEX idx_collection_products ON collection_products(collection_id);
CREATE INDEX idx_pack_items ON pack_items(pack_id);

CREATE INDEX idx_document_versions_invoice ON document_versions(invoice_id);
```

**Execution:**
```bash
# SQLite
sqlite3 data.db < backend/migrations/001-add-indexes.sql

# Verify
sqlite3 data.db ".indices"
```

### Query Optimization Patterns

**Pattern 1: Replace full table scans**
```javascript
// BEFORE: Slow - scans entire table
const invoices = db.prepare('SELECT * FROM invoices').all();
const filtered = invoices.filter(inv => inv.customerEmail === email);

// AFTER: Fast - uses index
const filtered = db.prepare(
  'SELECT * FROM invoices WHERE customerEmail = ? LIMIT 100'
).all(email);
```

**Pattern 2: Add pagination**
```javascript
// BEFORE: Loads all records into memory
const items = db.prepare('SELECT * FROM items').all();

// AFTER: Paginated
const page = Math.max(1, parseInt(req.query.page || 1));
const limit = Math.min(100, parseInt(req.query.limit || 50));
const items = db.prepare(`
  SELECT * FROM items 
  ORDER BY created_at DESC 
  LIMIT ? OFFSET ?
`).all(limit, (page - 1) * limit);

const total = db.prepare('SELECT COUNT(*) as count FROM items').get().count;
```

**Pattern 3: Reduce JOIN complexity**
```javascript
// BEFORE: Heavy JOIN
const result = db.prepare(`
  SELECT i.*, c.*, COALESCE(SUM(iv.amount), 0) as totalVersions
  FROM invoices i
  LEFT JOIN customers c ON i.customerEmail = c.email
  LEFT JOIN invoice_versions iv ON i.invoiceID = iv.invoice_id
  WHERE i.date > ?
  GROUP BY i.invoiceID
`).all(lastMonth);

// AFTER: Two queries (simpler, faster with indexes)
const invoices = db.prepare(`
  SELECT i.* FROM invoices i 
  WHERE i.date > ? 
  ORDER BY i.date DESC LIMIT ?
`).all(lastMonth, limit);

const customers = db.prepare('SELECT * FROM customers WHERE email IN (?)').all(
  invoices.map(i => i.customerEmail).join(',')
);

// Merge in JS (faster for small datasets)
const result = invoices.map(inv => ({
  ...inv,
  customer: customers.find(c => c.email === inv.customerEmail)
}));
```

---

## PART 4: ERROR HANDLING ENHANCEMENT

### Centralized Error Handler

**File: backend/utils/errorHandler.js**
```javascript
const logger = require('./logger');

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async route wrapper to catch all errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global error handling middleware
 * Must be added LAST in middleware chain
 */
const errorHandler = (err, req, res, next) => {
  logger.error('Request Error', {
    error: err.message,
    code: err.code,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Handle known errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: process.env.NODE_ENV === 'development' ? err.details : undefined
      }
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {code: 'INVALID_TOKEN', message: 'Invalid authentication token'}
    });
  }

  // Handle validation errors from express-validator
  if (err.array && typeof err.array === 'function') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.array()
      }
    });
  }

  // Handle unknown errors
  res.status(500).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred'
    }
  });
};

module.exports = {
  AppError,
  asyncHandler,
  errorHandler
};
```

### Using Error Handler

**File: backend/routes/invoiceRoutes.js**
```javascript
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/:id', asyncHandler(async (req, res) => {
  const invoice = await getInvoice(req.params.id);
  
  if (!invoice) {
    throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
  }
  
  ApiResponse.success(res, invoice);
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!req.body.customerName) {
    throw new AppError('Customer name required', 400, 'MISSING_FIELD', 
      {field: 'customerName'});
  }
  
  const invoice = await addInvoice(req.body);
  ApiResponse.success(res, invoice, 201);
}));
```

### Middleware Setup (server.js)

```javascript
const { errorHandler } = require('./utils/errorHandler');

// ... other middleware ...

// Error handling (must be LAST)
app.use(errorHandler);

// Catch 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {code: 'NOT_FOUND', message: 'Endpoint not found'}
  });
});
```

---

## PART 5: PAGINATION IMPLEMENTATION

### Pattern for All List Endpoints

**File: backend/utils/pagination.js**
```javascript
/**
 * Parse and validate pagination parameters
 */
const parsePagination = (req, defaultLimit = 50, maxLimit = 100) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  
  return {page, limit, offset};
};

/**
 * Build paginated response
 */
const paginatedResponse = (items, total, page, limit) => {
  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  };
};

module.exports = {parsePagination, paginatedResponse};
```

### Apply to Endpoints

**Before:**
```javascript
router.get('/', async (req, res) => {
  const items = await getItems();  // All items!
  res.json(items);
});
```

**After:**
```javascript
const {parsePagination, paginatedResponse} = require('../utils/pagination');

router.get('/', asyncHandler(async (req, res) => {
  const {page, limit, offset} = parsePagination(req);
  
  const allItems = await getItems();
  const total = allItems.length;
  const items = allItems.slice(offset, offset + limit);
  
  ApiResponse.success(res, paginatedResponse(items, total, page, limit));
}));
```

---

## PART 6: TESTING TEMPLATES

### Backend Unit Test Template

**File: backend/__tests__/routes/invoiceRoutes.test.js**
```javascript
const request = require('supertest');
const db = require('../../services/dbService');
const app = require('../../server');

describe('invoiceRoutes', () => {
  let testToken;
  
  beforeAll(() => {
    testToken = require('jsonwebtoken').sign(
      {id: 'test-user'},
      process.env.JWT_SECRET
    );
  });
  
  describe('POST /api/invoices', () => {
    test('should create invoice with valid data', async () => {
      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          customerName: 'John Doe',
          customerEmail: 'john@test.com',
          items: [{name: 'Item 1', quantity: 2, price: 100}],
          grandTotal: 200
        });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('invoiceID');
      expect(res.body.data.invoiceID).toMatch(/^SNV-\d{4}-[A-Z0-9]{6}$/);
    });
    
    test('should reject invalid email', async () => {
      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          customerName: 'John',
          customerEmail: 'invalid-email',
          items: [{name: 'Item', quantity: 1, price: 100}],
          grandTotal: 100
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
  
  describe('GET /api/invoices', () => {
    test('should return paginated invoices', async () => {
      const res = await request(app)
        .get('/api/invoices?page=1&limit=10')
        .set('Authorization', `Bearer ${testToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
    });
  });
});
```

### Frontend Component Test Template

**File: frontend/src/__tests__/Dashboard.test.jsx**
```javascript
import {render, screen, waitFor} from '@testing-library/react';
import Dashboard from '../pages/Dashboard';
import * as api from '../apiConfig';

jest.mock('../apiConfig');

describe('Dashboard', () => {
  test('should render loading state initially', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    
    expect(screen.getByText(/Loading Dashboard/i)).toBeInTheDocument();
  });
  
  test('should display stats cards when data loads', async () => {
    api.get.mockResolvedValue({
      summary: {
        totalRevenue: 10000,
        totalInvoices: 50,
        avgOrderValue: 200
      },
      trends: {},
      distributions: {},
      settings: {}
    });
    
    render(<Dashboard />);
    
    await waitFor(() => {
      expect(screen.getByText(/Total Revenue/i)).toBeInTheDocument();
      expect(screen.getByText('$10000.00')).toBeInTheDocument();
    });
  });
  
  test('should show error message on API failure', async () => {
    api.get.mockRejectedValue(new Error('API Error'));
    
    render(<Dashboard />);
    
    await waitFor(() => {
      expect(screen.getByText(/Failed to load dashboard/i)).toBeInTheDocument();
    });
  });
});
```

---

## PART 7: DEPLOYMENT CHECKLIST

```markdown
# Pre-Deployment Verification

## Code Quality
- [ ] All tests passing: `npm run test`
- [ ] Code coverage ≥ 70%: `npm run test:coverage`
- [ ] No console.log() or debugger statements
- [ ] No commented-out code
- [ ] ESLint passes: `npm run lint`

## Security
- [ ] All user inputs validated
- [ ] XSS protection enabled (xss package)
- [ ] CSRF protection configured
- [ ] Rate limiting enabled
- [ ] SQL injection protected (parameterized queries ✅)
- [ ] Secrets not in code (environment variables ✅)

## Database
- [ ] Backup created
- [ ] Indexes created and verified
- [ ] Migrations tested
- [ ] Foreign key constraints enabled
- [ ] Data integrity verified

## API
- [ ] All responses standardized
- [ ] Pagination implemented on list endpoints
- [ ] Error handling comprehensive
- [ ] API documentation updated
- [ ] Rate limiting tested

## Frontend
- [ ] Bundle size < 1MB (main.js)
- [ ] No console errors in production build
- [ ] Responsive design tested on mobile
- [ ] Accessibility (a11y) basics checked
- [ ] Performance tested (< 3s load time)

## Deployment
- [ ] Environment variables configured
- [ ] SSL certificate valid
- [ ] Monitoring/alerts configured
- [ ] Logging service (Sentry) configured
- [ ] Backup strategy tested
- [ ] Rollback plan documented

## Post-Deployment
- [ ] Monitor error rates for 24 hours
- [ ] Verify all critical paths working
- [ ] Check performance metrics
- [ ] Validate database backups
- [ ] Document any issues found
```

---

## QUICK START SCRIPT

```bash
#!/bin/bash
# setup-v3.5-hardening.sh

echo "🚀 Starting InWoice V3.5 Hardening..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install express-validator xss node-cache

# Create directories
echo "📁 Creating directories..."
mkdir -p backend/__tests__/{routes,services,utils}
mkdir -p backend/migrations
mkdir -p frontend/src/__tests__/{pages,components}

# Create core files
echo "📝 Creating core files..."

# 1. API Response wrapper
touch backend/utils/apiResponse.js
touch backend/utils/validation.js
touch backend/utils/errorHandler.js
touch backend/utils/pagination.js

# 2. Migrations
touch backend/migrations/001-add-indexes.sql

# 3. Test files
touch backend/__tests__/routes/invoiceRoutes.test.js
touch frontend/src/__tests__/Dashboard.test.jsx

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy templates from REFACTORING_PLAYBOOK.md"
echo "2. Update backend/utils/ files"
echo "3. Run migrations: sqlite3 data.db < backend/migrations/001-add-indexes.sql"
echo "4. Update routes to use new wrappers"
echo "5. Run tests: npm test"
echo ""
echo "🎯 Estimated time: 3-4 weeks for full implementation"
```

---

## CONCLUSION

This playbook provides:
1. ✅ Standardized response format for all endpoints
2. ✅ Input validation & XSS protection
3. ✅ Database optimization with indexes
4. ✅ Error handling patterns
5. ✅ Pagination implementation
6. ✅ Testing templates
7. ✅ Deployment checklist

**Implementation Order:**
1. Week 1: Responses + Validation + Indexes
2. Week 2: Error Handling + Pagination  
3. Week 3: Testing
4. Week 4: Performance Optimization

**Questions?** Refer to PRODUCTION_HARDENING_AUDIT_REPORT.md for detailed analysis.

