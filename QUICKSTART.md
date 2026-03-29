# 🚀 Quick Start Guide - InWoice v2.0

## What Changed?

InWoice has been upgraded with **major security and performance improvements**:

- ✅ **JWT Authentication** (no more hardcoded tokens!)
- ✅ **Rate Limiting** (protection against abuse)
- ✅ **Secure CORS** (restricted origins)
- ✅ **Centralized API** (no hardcoded URLs)
- ✅ **Logging System** (Winston with file rotation)
- ✅ **Error Handling** (standardized responses)
- ✅ **Pagination** (better performance for large datasets)
- ✅ **Toast Notifications** (better UX)

---

## 📦 Step 1: Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd frontend  
npm install
```

**New packages installed:**
- bcryptjs, jsonwebtoken, express-rate-limit
- helmet, morgan, winston
- express-async-errors, generic-pool, node-cron
- react-toastify

---

## ⚙️ Step 2: Configure Environment

### Backend Environment (.env)

Create or update `backend/.env`:

```env
# REQUIRED - Generate a random secret
# Linux/Mac: openssl rand -base64 32
# Windows PowerShell:
#   $bytes = New-Object byte[] 32
#   [Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
#   [Convert]::ToBase64String($bytes)

JWT_SECRET=PASTE_YOUR_GENERATED_SECRET_HERE

# Optional but recommended
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# Keep your existing settings
ADMIN_PASSWORD=admin123
PORT=5000
# ... rest of your config
```

### Frontend Environment (.env)

Create `frontend/.env`:

```env
# For development
REACT_APP_API_URL=http://localhost:5000

# For production (example)
# REACT_APP_API_URL=https://api.yourdomain.com
```

---

## 🔑 Step 3: Generate JWT Secret (Required!)

### Option 1: Linux/Mac
```bash
openssl rand -base64 32
```

### Option 2: Windows PowerShell
```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

### Option 3: Online (Not Recommended for Production)
Visit: https://randomkeygen.com/ (Fort Knox Passwords section)

**Copy the generated secret and add to your `backend/.env`:**
```env
JWT_SECRET=your_generated_secret_paste_here
```

---

## ▶️ Step 4: Start Services

### Option A: Docker (Recommended)
```bash
docker-compose up -d
```

### Option B: Manual

**Backend:**
```bash
cd backend
npm start
# or with nodemon:
# npm run dev
```

**Frontend:**
```bash
cd frontend
npm start
```

---

## 🧪 Step 5: Test the Installation

### 1. Check Backend Health
```bash
curl http://localhost:5000/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-28T17:00:00.000Z",
  "uptime": 123,
  "environment": "development"
}
```

### 2. Test Login
1. Open browser: `http://localhost:3000/login`
2. Enter password: `admin123` (or your configured password)
3. Click "Access Dashboard"
4. You should be redirected to the dashboard

### 3. Check Logs
```bash
# View logs in real-time
tail -f backend/logs/combined.log

# Check for errors
cat backend/logs/error.log
```

---

## 🔐 Security Notes

### ⚠️ IMPORTANT: Change Default Password!

The default password `admin123` is **NOT SECURE** for production!

#### For Development:
Keep it as is, but ensure `NODE_ENV=development`

#### For Production:
**Option 1: Use plain password (not recommended)**
```env
ADMIN_PASSWORD=your_super_secure_password_here
```

**Option 2: Use hashed password (recommended)**

1. Start your server in development
2. Generate hash:
   ```bash
   curl -X POST http://localhost:5000/api/auth/hash-password \
     -H "Content-Type: application/json" \
     -d '{"password":"your_super_secure_password"}'
   ```
3. Copy the hash from the response
4. Update `.env`:
   ```env
   ADMIN_PASSWORD_HASH=$2a$10$...paste_hash_here
   # Remove or comment out ADMIN_PASSWORD
   ```

---

## 🎯 What Changed from v1.0?

### Authentication Flow

**Before:**
```javascript
// Hardcoded token
if (token === 'homelab-secure-token') {
  // Allow access
}
```

**After:**
```javascript
// JWT with expiration
const token = jwt.sign({ userId: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
// Token must be validated on every request
```

### API Calls

**Before (Frontend):**
```javascript
axios.post('http://localhost:5000/api/invoices', data, {
  headers: { Authorization: 'homelab-secure-token' }
});
```

**After (Frontend):**
```javascript
import { api, API_ENDPOINTS } from '../apiConfig';
await api.post(API_ENDPOINTS.INVOICES, data);
// Token automatically included, URL centralized
```

### Error Handling

**Before:**
```javascript
try {
  // code
} catch (error) {
  res.status(500).json({ error: 'Something went wrong' });
}
```

**After:**
```javascript
// Just throw, global error handler catches it
const invoice = await getInvoice(id);
// Errors automatically logged and formatted
```

---

## 🐛 Troubleshooting

### Issue: "Missing required environment variables: JWT_SECRET"
**Solution:** Add `JWT_SECRET` to your `backend/.env` file (see Step 3)

### Issue: "Cannot connect to server"
**Solution:** 
1. Check if backend is running: `curl http://localhost:5000/health`
2. Verify `REACT_APP_API_URL` in `frontend/.env`
3. Check backend logs: `cat backend/logs/error.log`

### Issue: "Invalid token" or "Unauthorized"
**Solution:**
1. Clear localStorage: Open DevTools → Application → Local Storage → Clear
2. Login again to get new JWT token
3. Old `homelab-secure-token` no longer works!

### Issue: "Too many login attempts"
**Solution:** Wait 15 minutes or restart backend to reset rate limiter

### Issue: "CORS error"
**Solution:**
1. Ensure `FRONTEND_URL` in `backend/.env` matches your frontend URL
2. For development, set: `FRONTEND_URL=http://localhost:3000`

### Issue: Frontend can't find apiConfig
**Solution:** File is at `frontend/src/apiConfig.js` - import it:
```javascript
import { api, API_ENDPOINTS } from '../apiConfig';
```

---

## 📂 New Directory Structure

```
InWoice/
├── backend/
│   ├── logs/               # ✨ NEW - Winston logs
│   │   ├── error.log
│   │   └── combined.log
│   ├── services/
│   │   └── tokenService.js # ✨ NEW - JWT handling
│   ├── utils/
│   │   ├── authMiddleware.js   # ✨ NEW - Auth middleware
│   │   ├── errorHandler.js     # ✨ NEW - Error handling
│   │   ├── responses.js        # ✨ NEW - Standardized responses
│   │   ├── logger.js           # ✨ NEW - Winston logger
│   │   └── envValidator.js     # ✨ NEW - Env validation
│   └── .env                # ⚠️ UPDATE REQUIRED
│
├── frontend/
│   ├── src/
│   │   └── apiConfig.js    # ✨ NEW - Centralized API
│   └── .env                # ✨ NEW - Create this file
│
├── DEPLOYMENT.md           # ✨ NEW - Deployment guide
├── IMPROVEMENTS.md         # ✨ NEW - Improvements summary
└── IMPLEMENTATION_COMPLETE.md  # ✨ NEW - This file!
```

---

## 📖 Additional Documentation

- **DEPLOYMENT.md** - Complete production deployment guide
- **IMPROVEMENTS.md** - Detailed list of all improvements
- **IMPLEMENTATION_COMPLETE.md** - Full implementation summary

---

## ✅ Post-Installation Checklist

- [ ] Installed backend dependencies (`npm install`)
- [ ] Installed frontend dependencies (`npm install`)
- [ ] Generated JWT_SECRET and added to `.env`
- [ ] Created `frontend/.env` with `REACT_APP_API_URL`
- [ ] Started backend successfully
- [ ] Started frontend successfully
- [ ] Tested `/health` endpoint
- [ ] Successfully logged in with new JWT system
- [ ] Verified API calls work with new auth
- [ ] Checked logs for any errors

---

## 🎉 You're All Set!

Your InWoice installation is now upgraded with:

✅ **Enterprise-grade security**  
✅ **Better performance**  
✅ **Improved error handling**  
✅ **Comprehensive logging**  
✅ **Production-ready architecture**

**Need Help?**
- Check `backend/logs/error.log` for errors
- Review DEPLOYMENT.md for detailed guides
- Ensure all environment variables are set

**Happy Invoicing! 🚀**
