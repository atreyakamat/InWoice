/**
 * Environment Variable Validation
 * Validates required environment variables on server startup
 */

const logger = require('./logger');

// Define required environment variables
const requiredEnvVars = [
  'JWT_SECRET'
];

// Define recommended environment variables
const recommendedEnvVars = [
  'ADMIN_PASSWORD',
  'ADMIN_PASSWORD_HASH',
  'FRONTEND_URL',
  'NODE_ENV'
];

// Define optional environment variables with defaults
const optionalEnvVars = {
  PORT: '5000',
  JWT_EXPIRES_IN: '24h',
  LOG_LEVEL: 'info'
};

/**
 * Validate environment variables
 * @throws {Error} If required variables are missing
 */
const validateEnv = () => {
  const missingVars = [];
  const warnings = [];

  // Check required variables
  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    const errorMsg = `Missing required environment variables: ${missingVars.join(', ')}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Check recommended variables
  recommendedEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      warnings.push(varName);
    }
  });

  // Warn about missing recommended variables
  if (warnings.length > 0) {
    logger.warn(`Missing recommended environment variables: ${warnings.join(', ')}`);
  }

  // Check for insecure defaults
  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET === 'CHANGE_THIS_IN_PRODUCTION') {
      logger.error('JWT_SECRET is using default value in production! This is INSECURE!');
      throw new Error('JWT_SECRET must be changed in production');
    }

    if (process.env.ADMIN_PASSWORD === 'admin123' && !process.env.ADMIN_PASSWORD_HASH) {
      logger.warn('ADMIN_PASSWORD is using default value in production. Consider using ADMIN_PASSWORD_HASH instead.');
    }

    if (!process.env.FRONTEND_URL) {
      logger.warn('FRONTEND_URL not set. CORS will block requests from unknown origins.');
    }
  }

  // Set defaults for optional variables
  Object.entries(optionalEnvVars).forEach(([varName, defaultValue]) => {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue;
      logger.info(`Using default value for ${varName}: ${defaultValue}`);
    }
  });

  // Log environment info
  logger.info('Environment validation passed', {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    logLevel: process.env.LOG_LEVEL,
    hasAdminPasswordHash: !!process.env.ADMIN_PASSWORD_HASH,
    hasFrontendUrl: !!process.env.FRONTEND_URL,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasGoogleCreds: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
  });

  return true;
};

/**
 * Get environment info (safe for logging)
 */
const getEnvInfo = () => {
  return {
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || '5000',
    jwtConfigured: !!process.env.JWT_SECRET,
    authMethod: process.env.ADMIN_PASSWORD_HASH ? 'hashed' : 'plain',
    corsConfigured: !!process.env.FRONTEND_URL,
    aiEnabled: {
      ollama: process.env.USE_OLLAMA_AI === 'true',
      localPython: process.env.USE_LOCAL_PYTHON_AI === 'true',
      gemini: !!process.env.GEMINI_API_KEY
    },
    googleSheetsEnabled: !!process.env.GOOGLE_SPREADSHEET_ID,
    smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER)
  };
};

module.exports = {
  validateEnv,
  getEnvInfo
};
