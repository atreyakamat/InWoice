/**
 * Authentication Middleware
 * Verifies JWT tokens and protects routes
 */

const { verifyToken } = require('../services/tokenService');
const { AppError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * Middleware to verify JWT token
 * Checks Authorization header for Bearer token
 */
const authMiddleware = (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new AppError('No token provided', 401);
    }

    // Check if it's a Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AppError('Invalid token format. Use: Bearer <token>', 401);
    }

    const token = parts[1];

    // Verify token
    const decoded = verifyToken(token);
    
    // Attach user info to request
    req.user = decoded;
    
    logger.debug('User authenticated', { userId: decoded.userId });
    next();
  } catch (error) {
    logger.warn('Authentication failed', { 
      error: error.message,
      path: req.path 
    });
    
    if (error.isOperational) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }
    
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }
};

/**
 * Optional auth middleware - doesn't fail if no token provided
 * Useful for routes that work differently for authenticated users
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const token = parts[1];
        const decoded = verifyToken(token);
        req.user = decoded;
      }
    }
  } catch (error) {
    // Silently fail - just don't attach user
    logger.debug('Optional auth failed', { error: error.message });
  }
  
  next();
};

module.exports = {
  authMiddleware,
  optionalAuth
};
