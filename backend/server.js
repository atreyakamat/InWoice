require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Validate environment variables before starting
const { validateEnv } = require('./utils/envValidator');
try {
  validateEnv();
} catch (error) {
  console.error('Environment validation failed:', error.message);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const invoiceRoutes = require('./routes/invoiceRoutes');
const emailRoutes = require('./routes/emailRoutes');
const sheetRoutes = require('./routes/sheetRoutes');
const aiRoutes = require('./routes/aiRoutes');
const productRoutes = require('./routes/productRoutes');
const webInvoiceRoutes = require('./routes/webInvoiceRoutes');
const authRoutes = require('./routes/authRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const accountingRoutes = require('./routes/accountingRoutes');
const taskRoutes = require('./routes/taskRoutes');
const bankRoutes = require('./routes/bankRoutes');
const mailRoutes = require('./routes/mailRoutes');
const marketingRoutes = require('./routes/marketingRoutes');
const orderRoutes = require('./routes/orderRoutes');

const { authMiddleware } = require('./utils/authMiddleware');
const { errorHandler, notFoundHandler } = require('./utils/errorHandler');
const logger = require('./utils/logger');
const { getMarketingPosts, updateMarketingPost } = require('./services/dbService');

const app = express();

// Set up Cron Job for Marketing Posts
cron.schedule('* * * * *', async () => {
    try {
        const posts = await getMarketingPosts();
        const now = new Date();
        for (const post of posts) {
            if (post.status === 'Scheduled' && post.scheduledAt) {
                const scheduledTime = new Date(post.scheduledAt);
                if (scheduledTime <= now) {
                    // Simulate posting to social media platforms
                    console.log(`[Marketing Cron] Publishing post ${post.id} to ${post.platforms}...`);
                    await updateMarketingPost(post.id, { ...post, status: 'Published' });
                }
            }
        }
    } catch (err) {
        console.error('[Marketing Cron] Error checking scheduled posts:', err);
    }
});

// Middleware
const PORT = process.env.PORT || 5000;

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Schedule database backup: daily at 3:00 AM
cron.schedule('0 3 * * *', async () => {
  logger.info('Running scheduled database backup...');
  await backupDatabase();
});

// Run backup once on startup in production
if (process.env.NODE_ENV === 'production') {
  backupDatabase();
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for PDF generation
  crossOriginEmbedderPolicy: false
}));

// CORS configuration - restrict to specific origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL || 'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
} else {
  app.use(morgan('dev'));
}

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    error: 'Too many login attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Public routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/web-invoices', webInvoiceRoutes);

// Protected routes with rate limiting
app.use('/api/invoices', authMiddleware, apiLimiter, invoiceRoutes);
app.use('/api/email', authMiddleware, apiLimiter, emailRoutes);
app.use('/api/data', authMiddleware, apiLimiter, sheetRoutes);
app.use('/api/ai', authMiddleware, apiLimiter, aiRoutes);
app.use('/api/products', authMiddleware, apiLimiter, productRoutes);
app.use('/api/analytics', authMiddleware, apiLimiter, analyticsRoutes);
app.use('/api/upload', authMiddleware, apiLimiter, uploadRoutes);
app.use('/api/customers', authMiddleware, apiLimiter, require('./routes/customerRoutes'));
app.use('/api/export', authMiddleware, apiLimiter, require('./routes/exportRoutes'));

app.use('/api/accounting', authMiddleware, apiLimiter, accountingRoutes);
app.use('/api/tasks', authMiddleware, apiLimiter, taskRoutes);
app.use('/api/bank', authMiddleware, apiLimiter, bankRoutes);
app.use('/api/mail', authMiddleware, apiLimiter, mailRoutes);
app.use('/api/marketing', authMiddleware, apiLimiter, marketingRoutes);
app.use('/api/orders', apiLimiter, orderRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

const server = app.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});

module.exports = app; // Export for testing
