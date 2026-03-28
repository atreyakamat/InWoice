require('dotenv').config();
const express = require('express');
const cors = require('cors');
const invoiceRoutes = require('./routes/invoiceRoutes');
const emailRoutes = require('./routes/emailRoutes');
const sheetRoutes = require('./routes/sheetRoutes');
const aiRoutes = require('./routes/aiRoutes');
const productRoutes = require('./routes/productRoutes');
const webInvoiceRoutes = require('./routes/webInvoiceRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Simple Auth Middleware
const authMiddleware = (req, res, next) => {
  const isPublicRoute = 
    req.path.startsWith('/api/auth') || 
    req.path.startsWith('/api/web-invoices');
  
  if (isPublicRoute) return next();

  const token = req.headers['authorization'];
  if (token === 'homelab-secure-token') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
};

app.use('/api/auth', authRoutes);
app.use('/api/web-invoices', webInvoiceRoutes);

// Protected routes
app.use('/api/invoices', authMiddleware, invoiceRoutes);
app.use('/api/email', authMiddleware, emailRoutes);
app.use('/api/data', authMiddleware, sheetRoutes);
app.use('/api/ai', authMiddleware, aiRoutes);
app.use('/api/products', authMiddleware, productRoutes);

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
