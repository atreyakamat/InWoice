# Testing Guide for InWoice v2.0

## 🧪 Pre-Deployment Testing Checklist

This guide helps you test all the improvements before going to production.

---

## 1. Backend Tests

### A. Run Integration Tests

```bash
cd backend
node test-integration.js
```

**Expected Output:**
```
✅ All required environment variables present
✅ All core dependencies installed
✅ All service files loaded
✅ All utility files loaded
✅ All route files loaded
✅ JWT generation and verification working
✅ Password hashing working
✅ Logger initialized
✅ Error handler working
✅ Response utilities working
✅ Database file valid
```

### B. Manual Backend Tests

#### Test 1: Start Backend Server
```bash
cd backend
npm start
```

**Expected Output:**
```
{"level":"info","message":"Environment validation passed",...}
{"level":"info","message":"Backend server running on port 5000",...}
```

#### Test 2: Health Check
```bash
curl http://localhost:5000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-28T17:00:00.000Z",
  "uptime": 123,
  "environment": "development"
}
```

#### Test 3: Login (JWT Authentication)
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  }
}
```

**Save the token for next tests:**
```bash
TOKEN="<paste-token-here>"
```

#### Test 4: Get Invoices (Protected Route)
```bash
curl http://localhost:5000/api/invoices \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "invoices": [],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrev": false
  }
}
```

#### Test 5: Pagination
```bash
curl "http://localhost:5000/api/invoices?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

#### Test 6: Rate Limiting
```bash
# Try login 6 times quickly (should be blocked on 6th attempt)
for i in {1..6}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"password":"wrong"}' \
    -w "\n"
done
```

**Expected:** After 5 attempts, you should see:
```json
{
  "success": false,
  "error": "Too many login attempts, please try again later."
}
```

#### Test 7: Check Logs
```bash
# View logs
tail -f backend/logs/combined.log

# Check for errors
cat backend/logs/error.log
```

---

## 2. Frontend Tests

### A. Run Validation
```bash
cd frontend
node test-validation.js
```

**Expected Output:**
```
✅ .env file configured correctly
✅ All key source files present
✅ API Configuration complete
✅ All dependencies installed
✅ Login page integrated
✅ Toast notifications setup
```

### B. Manual Frontend Tests

#### Test 1: Start Frontend
```bash
cd frontend
npm start
```

**Expected:**
- Browser opens to http://localhost:3000/login
- No console errors
- Login page displays correctly

#### Test 2: Login Flow
1. Enter password: `admin123`
2. Click "Access Dashboard"
3. Should redirect to Dashboard
4. Check browser DevTools:
   - Application → Local Storage → token should be present
   - Console should show no errors

#### Test 3: Navigation
- Click through all sidebar links:
  - Dashboard ✓
  - Create Invoice ✓
  - Invoices ✓
  - Products ✓
  - Customers ✓
  - Analytics ✓
  - Settings ✓

#### Test 4: Toast Notifications
- Open browser console
- Type:
  ```javascript
  import { toast } from 'react-toastify';
  toast.success('Test notification!');
  ```
- Toast should appear top-right

#### Test 5: Authentication Persistence
1. Login successfully
2. Refresh the page
3. Should stay logged in (not redirect to login)
4. Clear Local Storage
5. Refresh page
6. Should redirect to login

#### Test 6: Token Expiration
1. Login and get token
2. In DevTools Console:
   ```javascript
   // Manually set an expired token
   localStorage.setItem('token', 'expired.invalid.token');
   ```
3. Try to navigate or make API call
4. Should auto-redirect to login

---

## 3. Integration Tests

### Test Full User Journey

#### Journey 1: Create and View Invoice

1. **Login**
   - Go to http://localhost:3000/login
   - Enter password: `admin123`
   - Click "Access Dashboard"

2. **Dashboard**
   - Verify stats display
   - Check recent invoices section

3. **Create Invoice**
   - Click "Create Invoice" in sidebar
   - Fill in customer details:
     - Name: Test Customer
     - Email: test@example.com
     - Phone: 1234567890
   - Add items:
     - Item 1: Laptop, Qty: 1, Price: 1000
   - Click "Save Invoice"
   - Should see success toast

4. **View Invoices**
   - Click "Invoices" in sidebar
   - Verify new invoice appears in list
   - Should show pagination info

5. **View Invoice Details**
   - Click on the invoice
   - Verify all details are correct

6. **Generate PDF**
   - Click "Download PDF"
   - PDF should download
   - Open PDF and verify formatting

7. **Send Email** (if SMTP configured)
   - Click "Send Email"
   - Enter email
   - Should send successfully

#### Journey 2: Settings & Products

1. **Settings**
   - Go to Settings
   - Update business name
   - Save settings
   - Should see success message

2. **Products**
   - Go to Products
   - Add new product
   - Edit product
   - Delete product

---

## 4. Security Tests

### Test 1: Unauthorized Access
```bash
# Try to access protected route without token
curl http://localhost:5000/api/invoices
```

**Expected:**
```json
{
  "success": false,
  "error": "No token provided"
}
```

### Test 2: Invalid Token
```bash
curl http://localhost:5000/api/invoices \
  -H "Authorization: Bearer invalid.token.here"
```

**Expected:**
```json
{
  "success": false,
  "error": "Invalid token"
}
```

### Test 3: CORS Protection
```bash
# Try from unauthorized origin
curl http://localhost:5000/api/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Origin: http://evil.com"
```

**Expected:** CORS error (blocked)

### Test 4: Rate Limiting
- Already tested in Backend Test 6

---

## 5. Performance Tests

### Test 1: Pagination Performance
```bash
# Create multiple invoices first, then test pagination
curl "http://localhost:5000/api/invoices?page=1&limit=50" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\nTime: %{time_total}s\n"
```

**Expected:** < 0.5 seconds

### Test 2: PDF Generation
```bash
# Time PDF generation
time curl -X POST "http://localhost:5000/api/invoices/{id}/generate-pdf" \
  -H "Authorization: Bearer $TOKEN" \
  --output test.pdf
```

**Expected:** < 2 seconds for first generation, < 0.5s for subsequent

---

## 6. Error Handling Tests

### Test 1: Validation Errors
```bash
# Send invalid invoice data
curl -X POST http://localhost:5000/api/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "",
    "customerEmail": "invalid-email"
  }'
```

**Expected:**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {...}
}
```

### Test 2: 404 Errors
```bash
curl http://localhost:5000/api/nonexistent \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**
```json
{
  "success": false,
  "error": "Route /api/nonexistent not found",
  "statusCode": 404
}
```

---

## 7. Logging Tests

### Check Log Files
```bash
# Backend logs should contain:
cat backend/logs/combined.log | grep "info"
cat backend/logs/error.log

# Should see:
# - Server startup messages
# - API requests
# - Authentication events
# - Any errors
```

### Verify Log Rotation
```bash
# Logs should not exceed 5MB
du -h backend/logs/*.log

# Multiple log files if rotated
ls -lh backend/logs/
```

---

## 8. Browser Compatibility Tests

Test in multiple browsers:
- ✓ Chrome/Edge (Chromium)
- ✓ Firefox
- ✓ Safari (if on Mac)

### Test in Each Browser:
1. Login
2. Navigate all pages
3. Create invoice
4. Generate PDF
5. Check console for errors

---

## 9. Mobile Responsiveness Tests

1. Open DevTools
2. Toggle device toolbar
3. Test on different sizes:
   - iPhone SE (375px)
   - iPhone 12 Pro (390px)
   - iPad (768px)
   - Desktop (1920px)

### Check:
- Login page responsive
- Dashboard cards stack properly
- Invoice table scrolls on mobile
- Sidebar converts to mobile menu (if implemented)

---

## 10. Stress Tests

### Test 1: Concurrent Requests
```bash
# Send 50 concurrent requests
for i in {1..50}; do
  curl http://localhost:5000/api/invoices \
    -H "Authorization: Bearer $TOKEN" &
done
wait
```

**Expected:** All should succeed within rate limit

### Test 2: Large Dataset
1. Create 100+ invoices
2. Test pagination
3. Test search/filter
4. Verify performance

---

## ✅ Final Checklist

Before deployment, ensure all tests pass:

- [ ] Backend integration tests pass
- [ ] All API endpoints work with JWT
- [ ] Rate limiting is functioning
- [ ] CORS is properly configured
- [ ] Frontend validation passes
- [ ] Login/logout flow works
- [ ] Toast notifications display
- [ ] All pages load without errors
- [ ] Invoice creation works
- [ ] PDF generation works
- [ ] Email sending works (if configured)
- [ ] Pagination works correctly
- [ ] Unauthorized access is blocked
- [ ] Invalid tokens are rejected
- [ ] Logs are being written
- [ ] Error handling works correctly
- [ ] Mobile responsive
- [ ] Browser compatibility confirmed

---

## 🐛 Common Issues

### Issue: "Missing JWT_SECRET"
**Solution:** Add to backend/.env:
```env
JWT_SECRET=dev-secret-change-in-production
```

### Issue: CORS errors
**Solution:** Check FRONTEND_URL in backend/.env matches frontend URL

### Issue: "Cannot find module"
**Solution:** Run `npm install` in both backend and frontend

### Issue: Token not persisting
**Solution:** Check browser Local Storage, clear and re-login

### Issue: Rate limiting too strict
**Solution:** Adjust limits in backend/server.js (for testing only!)

---

## 📊 Performance Benchmarks

**Expected Performance:**
- Health check: < 10ms
- Login: < 100ms
- Get invoices (paginated): < 200ms
- PDF generation: < 2s (first), < 500ms (cached)
- API requests: < 300ms

---

**Ready for Production?**

If all tests pass:
1. Review DEPLOYMENT.md
2. Set production environment variables
3. Change ADMIN_PASSWORD
4. Generate secure JWT_SECRET
5. Deploy!

🚀 **Happy Testing!**
