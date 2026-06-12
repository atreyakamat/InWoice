/**
 * AI Config Service - PHASE 1
 * 
 * Centralized configuration management for all AI services
 * Loads from environment variables, database, and defaults
 * 
 * Priority: Environment > Database > Defaults
 */

const logger = require('../utils/logger');

class AIConfigService {
  constructor() {
    this.config = this.loadConfiguration();
  }

  /**
   * Load all AI configuration
   * Merges environment variables, database settings, and defaults
   * 
   * @returns {object} Complete AI configuration
   */
  loadConfiguration() {
    logger.info('Loading AI configuration...');

    const config = {
      // OpenRouter Configuration
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY || null,
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        appName: process.env.OPENROUTER_APP_NAME || 'InWoice',
        httpReferer: process.env.HTTP_REFERER || 'https://inwvoice.app',
        initialized: !!process.env.OPENROUTER_API_KEY
      },

      // Model Configuration
      models: {
        default: process.env.DEFAULT_MODEL || 'gpt-4o-mini',
        fallback: process.env.FALLBACK_MODEL || 'gpt-4o',
        insights: process.env.INSIGHTS_MODEL || 'claude-3-sonnet',
        parsing: process.env.PARSING_MODEL || 'gpt-4-turbo',
        fast: process.env.FAST_MODEL || 'gpt-4o-mini',
        analysis: process.env.ANALYSIS_MODEL || 'claude-3-sonnet'
      },

      // Model Parameters
      parameters: {
        temperature: parseFloat(process.env.AI_TEMPERATURE || 0.7),
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || 2000),
        contextLength: parseInt(process.env.AI_CONTEXT_LENGTH || 8000),
        topP: parseFloat(process.env.AI_TOP_P || 1)
      },

      // Feature Flags
      features: {
        memoryEnabled: this.parseBoolean(process.env.ENABLE_AI_MEMORY, true),
        recommendationsEnabled: this.parseBoolean(process.env.ENABLE_RECOMMENDATIONS, true),
        businessInsightsEnabled: this.parseBoolean(process.env.ENABLE_BUSINESS_INSIGHTS, true),
        forecastingEnabled: this.parseBoolean(process.env.ENABLE_FORECASTING, false),
        fileIntelligenceEnabled: this.parseBoolean(process.env.ENABLE_FILE_INTELLIGENCE, false)
      },

      // Cost Configuration
      costs: {
        costPer1kInputTokens: parseFloat(process.env.COST_PER_1K_INPUT || 0.003),
        costPer1kOutputTokens: parseFloat(process.env.COST_PER_1K_OUTPUT || 0.009),
        maxCostPerRequest: parseFloat(process.env.MAX_COST_PER_REQUEST || 1.0),
        monthlyBudget: parseFloat(process.env.MONTHLY_AI_BUDGET || 100.0)
      },

      // Logging Configuration
      logging: {
        level: process.env.AI_LOG_LEVEL || 'info',
        logAllRequests: this.parseBoolean(process.env.AI_LOG_ALL_REQUESTS, true),
        logAllResponses: this.parseBoolean(process.env.AI_LOG_ALL_RESPONSES, false)
      },

      // Rate Limiting
      rateLimiting: {
        enabled: this.parseBoolean(process.env.AI_RATE_LIMITING, true),
        requestsPerMinute: parseInt(process.env.AI_REQUESTS_PER_MINUTE || 30),
        requestsPerHour: parseInt(process.env.AI_REQUESTS_PER_HOUR || 500),
        tokensPerMinute: parseInt(process.env.AI_TOKENS_PER_MINUTE || 10000)
      },

      // Response Timeout
      timeouts: {
        requestTimeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS || 30000),
        contextAssemblyTimeoutMs: parseInt(process.env.AI_CONTEXT_TIMEOUT_MS || 5000)
      },

      // Caching
      caching: {
        enabled: this.parseBoolean(process.env.AI_RESPONSE_CACHE_ENABLED, true),
        ttlSeconds: parseInt(process.env.AI_RESPONSE_CACHE_TTL || 3600),
        maxSize: parseInt(process.env.AI_RESPONSE_CACHE_SIZE || 1000)
      }
    };

    this.logConfiguration(config);
    return config;
  }

  /**
   * Get a configuration value by path
   * Example: getConfig('openrouter.apiKey')
   * 
   * @param {string} path - Dot-notation path to config value
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Configuration value
   */
  getConfig(path, defaultValue = null) {
    let value = this.config;

    for (const segment of path.split('.')) {
      if (value && typeof value === 'object' && segment in value) {
        value = value[segment];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Set a configuration value at runtime
   * 
   * @param {string} path - Dot-notation path to config value
   * @param {*} value - New value
   */
  setConfig(path, value) {
    const segments = path.split('.');
    let current = this.config;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (!(segment in current)) {
        current[segment] = {};
      }
      current = current[segment];
    }

    const lastSegment = segments[segments.length - 1];
    current[lastSegment] = value;

    logger.info(`Configuration updated: ${path}`, { value });
  }

  /**
   * Check if OpenRouter is properly configured
   * 
   * @returns {boolean} True if configured
   */
  isOpenRouterConfigured() {
    return this.config.openrouter.initialized;
  }

  /**
   * Check if a feature is enabled
   * 
   * @param {string} featureName - Feature name
   * @returns {boolean} True if enabled
   */
  isFeatureEnabled(featureName) {
    return this.config.features[`${featureName}Enabled`] === true;
  }

  /**
   * Get system status and configuration summary
   * 
   * @returns {object} System status
   */
  getStatus() {
    return {
      openRouterConfigured: this.config.openrouter.initialized,
      openRouterKeyPrefix: this.config.openrouter.apiKey 
        ? `${this.config.openrouter.apiKey.substring(0, 10)}...`
        : 'NOT SET',
      defaultModel: this.config.models.default,
      fallbackModel: this.config.models.fallback,
      featuresEnabled: Object.entries(this.config.features)
        .filter(([, value]) => value === true)
        .map(([key]) => key.replace('Enabled', '')),
      rateLimitingEnabled: this.config.rateLimiting.enabled,
      cachingEnabled: this.config.caching.enabled,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get all configuration (public version, excludes secrets)
   * 
   * @returns {object} Public configuration
   */
  getPublicConfig() {
    return {
      openrouter: {
        baseUrl: this.config.openrouter.baseUrl,
        appName: this.config.openrouter.appName,
        initialized: this.config.openrouter.initialized
      },
      models: this.config.models,
      parameters: this.config.parameters,
      features: this.config.features,
      rateLimiting: {
        enabled: this.config.rateLimiting.enabled,
        requestsPerMinute: this.config.rateLimiting.requestsPerMinute
      },
      caching: this.config.caching,
      timeouts: this.config.timeouts
    };
  }

  /**
   * Validate configuration
   * Checks for required settings and valid values
   * 
   * @returns {object} Validation result {valid, errors}
   */
  validate() {
    const errors = [];

    // Check OpenRouter API key
    if (!this.config.openrouter.apiKey) {
      errors.push('OPENROUTER_API_KEY not configured. Set environment variable to enable AI features.');
    }

    // Check models are valid
    if (!this.config.models.default) {
      errors.push('DEFAULT_MODEL not configured');
    }

    if (!this.config.models.fallback) {
      errors.push('FALLBACK_MODEL not configured');
    }

    // Check parameters are in valid ranges
    if (this.config.parameters.temperature < 0 || this.config.parameters.temperature > 2) {
      errors.push('AI_TEMPERATURE must be between 0 and 2');
    }

    if (this.config.parameters.maxTokens < 100 || this.config.parameters.maxTokens > 128000) {
      errors.push('AI_MAX_TOKENS must be between 100 and 128000');
    }

    // Check rate limiting
    if (this.config.rateLimiting.enabled && this.config.rateLimiting.requestsPerMinute < 1) {
      errors.push('AI_REQUESTS_PER_MINUTE must be >= 1 when rate limiting is enabled');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Parse boolean strings
   * 
   * @param {string|boolean} value - Value to parse
   * @param {boolean} defaultValue - Default if not specified
   * @returns {boolean} Parsed boolean
   */
  parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
  }

  /**
   * Log configuration (without secrets)
   * 
   * @param {object} config - Configuration to log
   */
  logConfiguration(config) {
    logger.info('AI Configuration Loaded', {
      openRouterUrl: config.openrouter.baseUrl,
      defaultModel: config.models.default,
      fallbackModel: config.models.fallback,
      temperature: config.parameters.temperature,
      maxTokens: config.parameters.maxTokens,
      featuresEnabled: Object.entries(config.features)
        .filter(([, value]) => value === true)
        .map(([key]) => key),
      rateLimitingEnabled: config.rateLimiting.enabled,
      cachingEnabled: config.caching.enabled
    });
  }
}

module.exports = new AIConfigService();
