const express = require('express');
const router = express.Router();
const { generateToken, comparePassword, hashPassword } = require('../services/tokenService');
const { successResponse, errorResponse } = require('../utils/responses');
const logger = require('../utils/logger');

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json(errorResponse('Password is required', 400));
    }

    // Get admin password from environment
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    // For backward compatibility: if ADMIN_PASSWORD is plain text, hash it
    // In production, ADMIN_PASSWORD_HASH should be used
    let isValid = false;
    
    if (process.env.ADMIN_PASSWORD_HASH) {
      // Use pre-hashed password (recommended)
      isValid = await comparePassword(password, process.env.ADMIN_PASSWORD_HASH);
    } else {
      // Direct comparison for plain text (not recommended, but backward compatible)
      isValid = password === adminPassword;
      
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Using plain text password comparison. Set ADMIN_PASSWORD_HASH for better security.');
      }
    }

    if (!isValid) {
      logger.warn('Failed login attempt', { ip: req.ip });
      return res.status(401).json(errorResponse('Invalid password', 401));
    }

    // Generate JWT token
    const token = generateToken('admin', { role: 'admin' });

    logger.info('Successful login', { userId: 'admin', ip: req.ip });

    res.json(successResponse({ 
      token,
      expiresIn: 86400 // 24 hours in seconds
    }, 'Login successful'));

  } catch (error) {
    logger.error('Login error', { error: error.message });
    next(error);
  }
});

/**
 * POST /api/auth/verify
 * Verify if a token is valid
 */
router.post('/verify', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json(errorResponse('Token is required', 400));
    }

    const { verifyToken } = require('../services/tokenService');
    const decoded = verifyToken(token);

    res.json(successResponse({ 
      valid: true,
      userId: decoded.userId,
      expiresAt: decoded.exp
    }, 'Token is valid'));

  } catch (error) {
    res.status(401).json(errorResponse('Invalid or expired token', 401));
  }
});

/**
 * Utility route to generate password hash
 * Should be removed or protected in production
 */
if (process.env.NODE_ENV !== 'production') {
  router.post('/hash-password', async (req, res) => {
    try {
      const { password } = req.body;
      const hashed = await hashPassword(password);
      res.json({ hash: hashed });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = router;
