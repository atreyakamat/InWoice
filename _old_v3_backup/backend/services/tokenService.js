/**
 * JWT Token Service
 * Handles token generation and verification
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// Ensure JWT_SECRET is set
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (JWT_SECRET === 'CHANGE_THIS_IN_PRODUCTION' && process.env.NODE_ENV === 'production') {
  logger.warn('JWT_SECRET not set! Using default. This is INSECURE in production!');
}

/**
 * Generate a JWT token for a user
 * @param {string} userId - User identifier
 * @param {object} additionalData - Additional data to include in token
 * @returns {string} JWT token
 */
const generateToken = (userId = 'admin', additionalData = {}) => {
  try {
    const token = jwt.sign(
      {
        userId,
        ...additionalData,
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    logger.info('Token generated', { userId });
    return token;
  } catch (error) {
    logger.error('Token generation failed', { error: error.message });
    throw new Error('Failed to generate token');
  }
};

/**
 * Verify a JWT token
 * @param {string} token - JWT token to verify
 * @returns {object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Token expired', { error: error.message });
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid token', { error: error.message });
      throw new Error('Invalid token');
    }
    logger.error('Token verification failed', { error: error.message });
    throw new Error('Token verification failed');
  }
};

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    return hashed;
  } catch (error) {
    logger.error('Password hashing failed', { error: error.message });
    throw new Error('Failed to hash password');
  }
};

/**
 * Compare a plain text password with a hashed password
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password
 * @returns {Promise<boolean>} True if passwords match
 */
const comparePassword = async (password, hashedPassword) => {
  try {
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
  } catch (error) {
    logger.error('Password comparison failed', { error: error.message });
    throw new Error('Failed to compare passwords');
  }
};

/**
 * Decode a token without verifying (useful for debugging)
 * @param {string} token - JWT token
 * @returns {object} Decoded token payload
 */
const decodeToken = (token) => {
  return jwt.decode(token);
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  decodeToken
};
