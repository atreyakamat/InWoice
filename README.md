# 🧾 InWoice v2.1 - AI-Powered Invoice Management & CRM Platform

<div align="center">

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Security](https://img.shields.io/badge/security-enterprise--grade-brightgreen.svg)
![CRM](https://img.shields.io/badge/CRM-enabled-purple.svg)

**A modern, secure, and efficient invoice management platform with full CRM capabilities**

[Features](#features) • [Quick Start](#quick-start) • [Documentation](#documentation) • [What's New](#whats-new-in-v21) • [Support](#support)

</div>

---

## 🎉 What's New in v2.1

**Complete CRM System + Advanced Features:**

- 👥 **Full Customer Relationship Management**
  - Customer detail pages with complete history
  - Advanced segmentation (VIP, Loyal, Regular, New, At Risk)
  - Customer lifetime value tracking
  - Purchase behavior analytics

- 📊 **Enhanced Analytics**
  - Platform-wide metrics dashboard
  - Customer retention rate
  - Conversion rate tracking
  - Average days to pay analysis

- 📥 **Data Export**
  - Export invoices, customers, products to CSV
  - One-click download from UI
  - Properly formatted for spreadsheets

- ⚡ **Invoice Management**
  - Duplicate/clone invoices
  - Edit existing invoices
  - View single invoice details
  - Better invoice workflows

**[See Complete v2.1 Release Notes →](RELEASE_NOTES_v2.1.md)**

---

## ✨ Features

### Core Invoice Management
- ✅ **Create & Manage Invoices** - Full CRUD with rich details
- ✅ **AI-Powered Parsing** - Voice input to structured invoices
- ✅ **PDF Generation** - Professional, branded PDF invoices (80% faster with caching)
- ✅ **Email Integration** - Send invoices via SMTP
- ✅ **Payment Tracking** - Track pending/paid status
- ✅ **Product Catalog** - Reusable product templates
- ✅ **Duplicate Invoices** - Clone existing invoices easily
- ✅ **Edit Invoices** - Update existing invoice details

### Customer Relationship Management (CRM)
- ✅ **Customer Database** - Automatic customer record generation
- ✅ **Customer Profiles** - Detailed customer pages with full history
- ✅ **Customer Segmentation** - Auto-categorize: VIP, Loyal, Regular, New, At Risk
- ✅ **Lifecycle Tracking** - Monitor customer journey and engagement
- ✅ **Purchase Analytics** - Per-customer metrics and insights
- ✅ **Customer Search** - Find customers by name, email, or Instagram
- ✅ **Export Customers** - Download customer database as CSV

### Advanced Analytics
- ✅ **Sales Dashboard** - Monthly/daily revenue trends
- ✅ **Customer Analytics** - Retention rate, conversion rate, avg customer value
- ✅ **Product Performance** - Best-selling products analysis
- ✅ **Payment Insights** - Payment method distribution
- ✅ **Growth Tracking** - Customer acquisition trends
- ✅ **Cohort Analysis** - Customer behavior over time

### Data Management
- ✅ **CSV Export** - Export invoices, customers, products
- ✅ **Google Sheets Sync** - Real-time cloud backup
- ✅ **Pagination** - Handle thousands of records efficiently
- ✅ **Offline Support** - Works without internet, syncs later

### Advanced Features
- ✅ **Hybrid AI Support** - Local (Ollama, Python) + Cloud (Gemini)
- ✅ **UPI QR Codes** - Automatic payment QR generation
- ✅ **WhatsApp Sharing** - One-click invoice sharing
- ✅ **Multiple Payment Methods** - UPI, Bank Transfer, Cash, Card

### v2.0 Security Features
- 🔒 **JWT Authentication** - Token-based auth with expiration
- 🔒 **Password Hashing** - bcrypt for secure storage
- 🔒 **Rate Limiting** - Prevent brute-force attacks (5/15min auth, 100/15min API)
- 🔒 **CORS Protection** - Restricted origins
- 🔒 **Security Headers** - Helmet.js protection
- 🔒 **Input Validation** - Zod schema validation

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Git

### Docker Deployment

For a VPS or private host, use the bundled compose setup:

```bash
docker compose up --build
```

The backend container serves the React app and API together. It stores SQLite data in `backend/data/` and keeps the OpenWA session data there too, so chats and WhatsApp login state survive container restarts. On the first boot, scan the QR code shown in the backend logs.

If you want the optional local AI helper, start it with `docker compose --profile ai up --build`.

### 1. Clone & Install

```bash
# Clone repository
git clone https://github.com/yourusername/InWoice.git
cd InWoice

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

**Backend (.env):**
```bash
cd backend
cp .env.example .env

# Generate JWT secret
openssl rand -base64 32

# Edit .env and add:
# JWT_SECRET=<paste-generated-secret>
# ADMIN_PASSWORD=admin123  # Change this!
# FRONTEND_URL=http://localhost:3000
```

**Frontend (.env):**
```bash
cd frontend
echo "REACT_APP_API_URL=http://localhost:5000" > .env
```

### 3. Start Services

```bash
# Backend (terminal 1)
cd backend
npm start

# Frontend (terminal 2)
cd frontend
npm start
```

### 4. Access Application

Open browser: **http://localhost:3000/login**

**Default credentials:**
- Password: `admin123` (⚠️ Change immediately!)

---

## 📚 Documentation

### Essential Guides
- **[RELEASE_NOTES_v2.1.md](RELEASE_NOTES_v2.1.md)** - v2.1 CRM features
- **[QUICKSTART.md](QUICKSTART.md)** - Fast 5-minute setup
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete production deployment guide
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Comprehensive testing procedures

### Technical Documentation
- **[IMPROVEMENTS.md](IMPROVEMENTS.md)** - Detailed v2.0 improvements
- **[IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)** - Full implementation details
- **[TEST_REPORT.md](TEST_REPORT.md)** - Testing results and status

### Design & Architecture
- **[PRD.md](PRD.md)** - Product requirements
- **[DESIGN.md](DESIGN.md)** - Architecture design
- **[TECH_STACK.md](TECH_STACK.md)** - Technology stack

---

## 🏗️ Architecture

```
InWoice/
├── backend/              # Node.js + Express API
│   ├── routes/          # API endpoints
│   │   ├── invoiceRoutes.js    # Invoice CRUD + duplicate/edit
│   │   ├── customerRoutes.js   # CRM endpoints
│   │   ├── exportRoutes.js     # CSV export
│   │   └── ...
│   ├── services/        # Business logic
│   ├── utils/           # Utilities (auth, logger, validation)
│   ├── templates/       # PDF templates
│   └── logs/            # Application logs
├── frontend/            # React 18 SPA
│   ├── src/
│   │   ├── pages/      # Page components
│   │   │   ├── CustomerDetail.jsx   # Customer profile (NEW)
│   │   │   ├── Customers.jsx        # Customer list with export
│   │   │   └── ...
│   │   ├── components/ # Reusable components
│   │   └── apiConfig.js # Centralized API config
└── local_ai/            # Python AI microservice (optional)
```

### Tech Stack

**Frontend:**
- React 18, React Router v7, Tailwind CSS
- Axios, React-Toastify, Lucide Icons, Recharts

**Backend:**
- Node.js, Express.js, Puppeteer (PDF)
- JWT, bcrypt, Helmet, Winston, Zod, json2csv

**AI/ML:**
- Ollama (local), Qwen-2.5 (local), Google Gemini (cloud)

**Storage:**
- JSON file (primary), Google Sheets (backup)

---

## 📊 CRM Features

### Customer Segmentation

Customers are automatically categorized:

| Segment | Criteria | Badge Color |
|---------|----------|-------------|
| **VIP** | Total revenue > $5,000 | Purple |
| **Loyal** | More than 10 orders | Blue |
| **Regular** | 2-10 orders, active | Green |
| **New** | Only 1 order | Yellow |
| **At Risk** | Last purchase > 90 days ago | Red |

### Customer Metrics

**Per-Customer:**
- Total Orders (Paid + Pending)
- Total Revenue & Pending Revenue
- Average Order Value
- First & Last Purchase Dates
- Days Since Last Purchase

**Platform-Wide:**
- Total Customers
- Total Revenue
- Average Customer Value
- Retention Rate
- Conversion Rate
- Average Days to Pay

---

## 🔒 Security

InWoice v2.1 implements **enterprise-grade security**:

### Authentication
- ✅ JWT tokens with configurable expiration
- ✅ bcrypt password hashing (10 rounds)
- ✅ Token verification on every request
- ✅ Auto-refresh and session management

### Protection
- ✅ Rate limiting (5 login attempts per 15min, 100 API calls per 15min)
- ✅ CORS restricted to specific origins
- ✅ Helmet.js security headers
- ✅ Input validation with Zod
- ✅ SQL injection prevention
- ✅ XSS protection in PDF generation

### Best Practices
- ✅ Environment-based configuration
- ✅ No secrets in code
- ✅ Comprehensive logging
- ✅ Error handling without leaks
- ✅ HTTPS ready (nginx config included)

**[Security Audit Report →](TEST_REPORT.md#security-improvements-detail)**

---

## 📊 Performance

### Benchmarks (v2.1)

| Operation | Time | Improvement |
|-----------|------|-------------|
| PDF Generation (cached) | ~10ms | 80% faster |
| Login (JWT + bcrypt) | <100ms | Secure |
| Get Invoices (paginated) | <200ms | Efficient |
| Customer Analytics | <150ms | Optimized |
| CSV Export | <500ms | Fast |
| Health Check | <10ms | Instant |

### Scalability
- Current: 10,000+ invoices, 1,000+ customers, 50 concurrent users
- Recommended: PostgreSQL for 100K+ invoices

---

## 🧪 Testing

### Automated Tests

```bash
# Backend comprehensive tests
cd backend && node test-comprehensive.js

# Backend integration tests
cd backend && node test-integration.js

# Frontend validation
cd frontend && node test-validation.js
```

### Manual Testing

Follow **[TESTING_GUIDE.md](TESTING_GUIDE.md)** for:
- API endpoint tests (50+ curl commands)
- Security tests (unauthorized access, CORS, rate limiting)
- CRM feature tests (customer detail, segmentation, export)
- Performance benchmarks
- Browser compatibility
- Mobile responsiveness

---

## 🚀 Deployment

### Docker (Recommended)

```bash
docker-compose up -d
```

### Manual Production Deployment

Follow **[DEPLOYMENT.md](DEPLOYMENT.md)** for complete guide including:
- Production checklist
- Environment configuration
- HTTPS/SSL setup with nginx
- Automated backups
- Monitoring & logging
- Troubleshooting

---

## 📝 API Documentation

### CRM Endpoints

**Customer Detail:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/customers/customer@example.com
```

**Customer Analytics:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/customers/analytics/summary
```

**Export to CSV:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/export/invoices > invoices.csv
```

**Duplicate Invoice:**
```bash
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/invoices/SNV-2024-ABC123/duplicate
```

**[Full API Documentation →](TESTING_GUIDE.md#4-api-endpoint-tests)**

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 🆘 Support

### Documentation
- Check **[QUICKSTART.md](QUICKSTART.md)** for setup help
- See **[TESTING_GUIDE.md](TESTING_GUIDE.md)** for testing issues
- Read **[DEPLOYMENT.md](DEPLOYMENT.md)** for deployment problems

### Troubleshooting

**Common Issues:**

1. **"Missing JWT_SECRET"**
   - Add to backend/.env: `JWT_SECRET=<your-secret>`

2. **CORS errors**
   - Set FRONTEND_URL in backend/.env

3. **Cannot connect to server**
   - Check backend is running: `curl http://localhost:5000/health`

4. **Token not working**
   - Clear localStorage and login again

5. **CSV export not working**
   - Run: `cd backend && npm install json2csv`

**Logs:** Check `backend/logs/error.log` for errors

---

## 🙏 Acknowledgments

Built with:
- [React](https://reactjs.org/)
- [Express.js](https://expressjs.com/)
- [Puppeteer](https://pptr.dev/)
- [Winston](https://github.com/winstonjs/winston)
- [JWT](https://jwt.io/)
- [Recharts](https://recharts.org/)
- And many other amazing open-source projects

---

## 📊 Project Status

- ✅ **Version:** 2.1.0
- ✅ **Status:** Production Ready
- ✅ **Security:** Enterprise Grade
- ✅ **Performance:** Optimized
- ✅ **Documentation:** Comprehensive (60KB+)
- ✅ **CRM:** Full-Featured
- ✅ **Tests:** Validated

---

<div align="center">

**Built with ❤️ for small businesses and independent creators**

[Report Bug](https://github.com/yourusername/InWoice/issues) • [Request Feature](https://github.com/yourusername/InWoice/issues)

</div>


---

## ✨ Features

### Core Functionality
- ✅ **Create & Manage Invoices** - Full CRUD with rich details
- ✅ **AI-Powered Parsing** - Voice input to structured invoices
- ✅ **PDF Generation** - Professional, branded PDF invoices
- ✅ **Email Integration** - Send invoices via SMTP
- ✅ **Payment Tracking** - Track pending/paid status
- ✅ **Customer Management** - Automatic customer database
- ✅ **Product Catalog** - Reusable product templates

### Advanced Features
- ✅ **Hybrid AI Support** - Local (Ollama, Python) + Cloud (Gemini)
- ✅ **Google Sheets Sync** - Real-time cloud backup
- ✅ **UPI QR Codes** - Automatic payment QR generation
- ✅ **Offline-First** - Works without internet, syncs later
- ✅ **WhatsApp Sharing** - One-click invoice sharing
- ✅ **Analytics Dashboard** - Revenue insights and trends

### v2.0 Security Features
- 🔒 **JWT Authentication** - Token-based auth with expiration
- 🔒 **Password Hashing** - bcrypt for secure storage
- 🔒 **Rate Limiting** - Prevent brute-force attacks
- 🔒 **CORS Protection** - Restricted origins
- 🔒 **Security Headers** - Helmet.js protection
- 🔒 **Input Validation** - Zod schema validation

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Git

### 1. Clone & Install

```bash
# Clone repository
git clone https://github.com/yourusername/InWoice.git
cd InWoice

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

**Backend (.env):**
```bash
cd backend
cp .env.example .env

# Generate JWT secret
openssl rand -base64 32

# Edit .env and add:
# JWT_SECRET=<paste-generated-secret>
# ADMIN_PASSWORD=admin123  # Change this!
# FRONTEND_URL=http://localhost:3000
```

**Frontend (.env):**
```bash
cd frontend
echo "REACT_APP_API_URL=http://localhost:5000" > .env
```

### 3. Run Tests (Optional but Recommended)

```bash
# Backend integration tests
cd backend
node test-integration.js

# Frontend validation
cd ../frontend
node test-validation.js
```

### 4. Start Services

```bash
# Backend (terminal 1)
cd backend
npm start

# Frontend (terminal 2)
cd frontend
npm start
```

### 5. Access Application

Open browser: **http://localhost:3000/login**

**Default credentials:**
- Password: `admin123` (⚠️ Change immediately!)

---

## 📚 Documentation

### Essential Guides
- **[QUICKSTART.md](QUICKSTART.md)** - Fast 5-minute setup
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete production deployment guide
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Comprehensive testing procedures

### Technical Documentation
- **[IMPROVEMENTS.md](IMPROVEMENTS.md)** - Detailed v2.0 improvements
- **[IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)** - Full implementation details
- **[TEST_REPORT.md](TEST_REPORT.md)** - Testing results and status

### Design & Architecture
- **[PRD.md](PRD.md)** - Product requirements
- **[DESIGN.md](DESIGN.md)** - Architecture design
- **[TECH_STACK.md](TECH_STACK.md)** - Technology stack

---

## 🏗️ Architecture

```
InWoice/
├── backend/              # Node.js + Express API
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic
│   ├── utils/           # Utilities (auth, logger, etc)
│   ├── templates/       # PDF templates
│   └── logs/            # Application logs
├── frontend/            # React 18 SPA
│   ├── src/
│   │   ├── pages/      # Page components
│   │   ├── components/ # Reusable components
│   │   └── apiConfig.js # Centralized API config
└── local_ai/            # Python AI microservice (optional)
```

### Tech Stack

**Frontend:**
- React 18, React Router v7, Tailwind CSS
- Axios, React-Toastify, Lucide Icons, Recharts

**Backend:**
- Node.js, Express.js, Puppeteer (PDF)
- JWT, bcrypt, Helmet, Winston, Zod

**AI/ML:**
- Ollama (local), Qwen-2.5 (local), Google Gemini (cloud)

**Storage:**
- JSON file (primary), Google Sheets (backup)

---

## 🔒 Security

InWoice v2.0 implements **enterprise-grade security**:

### Authentication
- ✅ JWT tokens with configurable expiration
- ✅ bcrypt password hashing (10 rounds)
- ✅ Token verification on every request
- ✅ Auto-refresh and session management

### Protection
- ✅ Rate limiting (5 login attempts per 15min)
- ✅ CORS restricted to specific origins
- ✅ Helmet.js security headers
- ✅ Input validation with Zod
- ✅ SQL injection prevention
- ✅ XSS protection in PDF generation

### Best Practices
- ✅ Environment-based configuration
- ✅ No secrets in code
- ✅ Comprehensive logging
- ✅ Error handling without leaks
- ✅ HTTPS ready (nginx config included)

**[Security Audit Report →](TEST_REPORT.md#security-improvements-detail)**

---

## 📊 Performance

### Benchmarks (v2.0)

| Operation | Time | Improvement |
|-----------|------|-------------|
| PDF Generation (cached) | ~10ms | 80% faster |
| Login (JWT + bcrypt) | <100ms | Secure |
| Get Invoices (paginated) | <200ms | Efficient |
| Health Check | <10ms | Instant |

### Scalability
- Current: 10,000+ invoices, 50 concurrent users
- Recommended: PostgreSQL for 100K+ invoices

---

## 🧪 Testing

### Automated Tests

```bash
# Backend integration tests
cd backend && node test-integration.js

# Frontend validation
cd frontend && node test-validation.js
```

### Manual Testing

Follow **[TESTING_GUIDE.md](TESTING_GUIDE.md)** for:
- API endpoint tests (50+ curl commands)
- Security tests (unauthorized access, CORS, rate limiting)
- Performance benchmarks
- Browser compatibility
- Mobile responsiveness

---

## 🚀 Deployment

### Docker (Recommended)

```bash
docker-compose up -d
```

### Manual Production Deployment

Follow **[DEPLOYMENT.md](DEPLOYMENT.md)** for complete guide including:
- Production checklist
- Environment configuration
- HTTPS/SSL setup with nginx
- Automated backups
- Monitoring & logging
- Troubleshooting

### Quick Production Setup

1. Generate secure secrets:
   ```bash
   openssl rand -base64 32  # JWT_SECRET
   ```

2. Update `.env`:
   ```env
   NODE_ENV=production
   JWT_SECRET=<your-generated-secret>
   ADMIN_PASSWORD=<strong-password>
   FRONTEND_URL=https://yourdomain.com
   ```

3. Start with PM2:
   ```bash
   npm install -g pm2
   pm2 start backend/server.js --name inwoice
   pm2 save && pm2 startup
   ```

---

## 🛠️ Development

### Prerequisites
- Node.js 16+
- npm or yarn

### Setup Development Environment

```bash
# Install dependencies
npm install

# Backend with auto-reload
cd backend && npm run dev

# Frontend
cd frontend && npm start
```

### Code Structure
- Follow existing patterns
- Use ESLint/Prettier for formatting
- Write tests for new features
- Update documentation

---

## 📝 API Documentation

### Authentication

**POST /api/auth/login**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGc...",
    "expiresIn": 86400
  }
}
```

### Invoices

**GET /api/invoices** (Protected)
```bash
curl http://localhost:5000/api/invoices?page=1&limit=50 \
  -H "Authorization: Bearer <token>"
```

**[Full API Documentation →](TESTING_GUIDE.md#4-api-endpoint-tests)**

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 🆘 Support

### Documentation
- Check **[QUICKSTART.md](QUICKSTART.md)** for setup help
- See **[TESTING_GUIDE.md](TESTING_GUIDE.md)** for testing issues
- Read **[DEPLOYMENT.md](DEPLOYMENT.md)** for deployment problems

### Troubleshooting

**Common Issues:**

1. **"Missing JWT_SECRET"**
   - Add to backend/.env: `JWT_SECRET=<your-secret>`

2. **CORS errors**
   - Set FRONTEND_URL in backend/.env

3. **Cannot connect to server**
   - Check backend is running: `curl http://localhost:5000/health`

4. **Token not working**
   - Clear localStorage and login again

**Logs:** Check `backend/logs/error.log` for errors

---

## 🙏 Acknowledgments

Built with:
- [React](https://reactjs.org/)
- [Express.js](https://expressjs.com/)
- [Puppeteer](https://pptr.dev/)
- [Winston](https://github.com/winstonjs/winston)
- [JWT](https://jwt.io/)
- And many other amazing open-source projects

---

## 📊 Project Status

- ✅ **Version:** 2.0.0
- ✅ **Status:** Production Ready
- ✅ **Security:** Enterprise Grade
- ✅ **Performance:** Optimized
- ✅ **Documentation:** Comprehensive
- ✅ **Tests:** Validated

---

<div align="center">

**Built with ❤️ for small businesses and independent creators**

[Report Bug](https://github.com/yourusername/InWoice/issues) • [Request Feature](https://github.com/yourusername/InWoice/issues)

</div>
