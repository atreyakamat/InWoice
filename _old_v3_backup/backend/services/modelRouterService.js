/**
 * Model Router Service - PHASE 1
 * 
 * Intelligent model selection based on task type, context, and user settings
 * Routes different types of requests to most appropriate model
 * 
 * DESIGN PRINCIPLE: Models selected by configuration, never hardcoded
 */

const logger = require('../utils/logger');
const { AppError } = require('../utils/errorHandler');

class ModelRouterService {
  constructor() {
    this.modelConfig = this.initializeModelConfig();
  }

  /**
   * Initialize model configuration from environment & defaults
   * 
   * Structure:
   * {
   *   taskType: {
   *     primary: 'model-id',
   *     fallback: 'model-id',
   *     settings: {temperature, maxTokens}
   *   }
   * }
   */
  initializeModelConfig() {
    return {
      // Business Insights & Analysis
      'business-insights': {
        primary: process.env.INSIGHTS_MODEL || 'claude-3-sonnet',
        fallback: process.env.INSIGHTS_FALLBACK || 'gpt-4o',
        settings: {
          temperature: 0.5,
          maxTokens: 2500,
          contextLength: 8000,
          description: 'Deep analysis of business trends'
        }
      },

      // Invoice & Document Parsing
      'document-parsing': {
        primary: process.env.PARSING_MODEL || 'gpt-4-turbo',
        fallback: process.env.PARSING_FALLBACK || 'claude-3-sonnet',
        settings: {
          temperature: 0.2,
          maxTokens: 1500,
          contextLength: 8000,
          description: 'Precise document extraction and parsing'
        }
      },

      // Fast Summaries & Quick Answers
      'fast-summary': {
        primary: process.env.FAST_MODEL || 'gpt-4o-mini',
        fallback: process.env.FAST_FALLBACK || 'gemini-2.0-flash',
        settings: {
          temperature: 0.6,
          maxTokens: 1000,
          contextLength: 4000,
          description: 'Quick, lightweight responses'
        }
      },

      // Deep Analysis & Strategic Planning
      'deep-analysis': {
        primary: process.env.ANALYSIS_MODEL || 'claude-3-sonnet',
        fallback: process.env.ANALYSIS_FALLBACK || 'gpt-4',
        settings: {
          temperature: 0.7,
          maxTokens: 3000,
          contextLength: 16000,
          description: 'In-depth analysis and strategic insights'
        }
      },

      // Customer Intelligence
      'customer-intelligence': {
        primary: process.env.CUSTOMER_MODEL || 'claude-3-sonnet',
        fallback: process.env.CUSTOMER_FALLBACK || 'gpt-4o',
        settings: {
          temperature: 0.5,
          maxTokens: 2000,
          contextLength: 8000,
          description: 'Customer behavior analysis and insights'
        }
      },

      // Revenue & Financial Analysis
      'revenue-analysis': {
        primary: process.env.REVENUE_MODEL || 'claude-3-sonnet',
        fallback: process.env.REVENUE_FALLBACK || 'gpt-4o',
        settings: {
          temperature: 0.3,
          maxTokens: 2000,
          contextLength: 8000,
          description: 'Financial metrics and revenue trends'
        }
      },

      // Recommendation Engine
      'recommendations': {
        primary: process.env.RECOMMEND_MODEL || 'claude-3-sonnet',
        fallback: process.env.RECOMMEND_FALLBACK || 'gpt-4o',
        settings: {
          temperature: 0.6,
          maxTokens: 1500,
          contextLength: 8000,
          description: 'Smart business recommendations'
        }
      },

      // Code Generation (Future)
      'code-generation': {
        primary: process.env.CODE_MODEL || 'gpt-4-turbo',
        fallback: process.env.CODE_FALLBACK || 'claude-3-sonnet',
        settings: {
          temperature: 0.2,
          maxTokens: 2000,
          contextLength: 8000,
          description: 'Code generation and technical assistance'
        }
      },

      // Default Fallback
      'default': {
        primary: process.env.DEFAULT_MODEL || 'gpt-4o-mini',
        fallback: process.env.FALLBACK_MODEL || 'gpt-4o',
        settings: {
          temperature: 0.7,
          maxTokens: 2000,
          contextLength: 8000,
          description: 'General-purpose responses'
        }
      }
    };
  }

  /**
   * Select best model for a task
   * 
   * @param {string} taskType - Type of task (e.g., 'business-insights', 'document-parsing')
   * @param {object} context - Additional context (optional)
   * @returns {object} Selected model configuration with primary & fallback
   */
  selectModel(taskType, context = {}) {
    const config = this.modelConfig[taskType] || this.modelConfig['default'];

    logger.info('Model selected', {
      taskType,
      primary: config.primary,
      fallback: config.fallback
    });

    return {
      primary: config.primary,
      fallback: config.fallback,
      settings: { ...config.settings },
      description: config.description
    };
  }

  /**
   * Get configuration for a specific model
   * 
   * @param {string} modelId - Model identifier
   * @returns {object} Model configuration
   */
  getModelConfig(modelId) {
    const modelDetails = {
      'claude-3-opus': {
        provider: 'Anthropic',
        strength: 'Deep reasoning, long context',
        cost: 'High',
        speed: 'Slow',
        bestFor: ['deep-analysis', 'business-insights']
      },
      'claude-3-sonnet': {
        provider: 'Anthropic',
        strength: 'Balanced, good reasoning',
        cost: 'Medium',
        speed: 'Medium',
        bestFor: ['business-insights', 'recommendations']
      },
      'claude-3-haiku': {
        provider: 'Anthropic',
        strength: 'Fast, lightweight',
        cost: 'Very Low',
        speed: 'Very Fast',
        bestFor: ['fast-summary']
      },
      'gpt-4': {
        provider: 'OpenAI',
        strength: 'Excellent reasoning',
        cost: 'High',
        speed: 'Medium',
        bestFor: ['deep-analysis', 'code-generation']
      },
      'gpt-4-turbo': {
        provider: 'OpenAI',
        strength: 'Balance of speed & capability',
        cost: 'Medium-High',
        speed: 'Medium-Fast',
        bestFor: ['document-parsing', 'code-generation']
      },
      'gpt-4o': {
        provider: 'OpenAI',
        strength: 'Fast & capable',
        cost: 'Medium',
        speed: 'Fast',
        bestFor: ['business-insights', 'recommendations']
      },
      'gpt-4o-mini': {
        provider: 'OpenAI',
        strength: 'Very fast & cheap',
        cost: 'Very Low',
        speed: 'Very Fast',
        bestFor: ['fast-summary']
      },
      'gemini-2.0-flash': {
        provider: 'Google',
        strength: 'Very fast & capable',
        cost: 'Very Low',
        speed: 'Very Fast',
        bestFor: ['fast-summary', 'recommendations']
      },
      'mistral-large': {
        provider: 'Mistral',
        strength: 'Balanced & open',
        cost: 'Low',
        speed: 'Medium',
        bestFor: ['recommendations', 'business-insights']
      }
    };

    return modelDetails[modelId] || {
      provider: 'Unknown',
      strength: 'Check OpenRouter for details',
      cost: 'Varies',
      speed: 'Unknown',
      bestFor: []
    };
  }

  /**
   * Get fallback model for primary model
   * 
   * @param {string} primaryModel - Primary model that failed
   * @returns {string} Fallback model ID
   */
  getFallbackModel(primaryModel) {
    // Find which task type uses this primary model
    for (const [taskType, config] of Object.entries(this.modelConfig)) {
      if (config.primary === primaryModel) {
        logger.warn(`Using fallback for failed model: ${primaryModel}`, {
          taskType,
          fallback: config.fallback
        });
        return config.fallback;
      }
    }

    // Default fallback if not found in config
    return process.env.FALLBACK_MODEL || 'gpt-4o';
  }

  /**
   * Get all available models for a task type
   * 
   * @param {string} taskType - Task type to filter by
   * @returns {array} List of suitable models
   */
  getAvailableModels(taskType) {
    const config = this.modelConfig[taskType] || this.modelConfig['default'];

    return [
      config.primary,
      config.fallback
    ].filter(Boolean);
  }

  /**
   * Update model configuration at runtime
   * 
   * @param {string} taskType - Task type to update
   * @param {object} newConfig - New configuration
   */
  updateModelConfig(taskType, newConfig) {
    if (!this.modelConfig[taskType]) {
      logger.warn(`Task type not found, creating new: ${taskType}`);
    }

    this.modelConfig[taskType] = {
      ...this.modelConfig[taskType],
      ...newConfig
    };

    logger.info(`Model configuration updated for task type: ${taskType}`, newConfig);
  }

  /**
   * Get summary of all task types and their models
   * 
   * @returns {object} Summary of model routing configuration
   */
  getSummary() {
    const summary = {};

    for (const [taskType, config] of Object.entries(this.modelConfig)) {
      summary[taskType] = {
        primary: config.primary,
        fallback: config.fallback,
        settings: {
          temperature: config.settings.temperature,
          maxTokens: config.settings.maxTokens
        },
        description: config.description
      };
    }

    return summary;
  }

  /**
   * Detect task type from question or context
   * 
   * @param {string} question - User question
   * @param {object} context - Additional context
   * @returns {string} Detected task type
   */
  detectTaskType(question, context = {}) {
    const q = question.toLowerCase();

    // Business insights indicators
    if (q.includes('trend') || q.includes('insight') || q.includes('analysis') || q.includes('perform')) {
      return 'business-insights';
    }

    // Customer analysis indicators
    if (q.includes('customer') || q.includes('clients') || q.includes('buyer')) {
      return 'customer-intelligence';
    }

    // Revenue indicators
    if (q.includes('revenue') || q.includes('profit') || q.includes('income') || q.includes('sales')) {
      return 'revenue-analysis';
    }

    // Recommendation indicators
    if (q.includes('recommend') || q.includes('should i') || q.includes('should we')) {
      return 'recommendations';
    }

    // Document parsing indicators
    if (q.includes('parse') || q.includes('extract') || q.includes('invoice') || q.includes('pdf')) {
      return 'document-parsing';
    }

    // Quick summary indicators
    if (q.includes('summary') || q.includes('quick') || q.includes('briefly')) {
      return 'fast-summary';
    }

    // Default
    return 'default';
  }

  /**
   * Legacy method for backward compatibility
   */
  routeModel(taskType) {
    const config = this.selectModel(taskType);
    return config.primary;
  }

  /**
   * Legacy method for backward compatibility
   */
  async processTask(taskType, params) {
    throw new Error('Use specialized services instead. Model routing only handles model selection.');
  }
}

module.exports = new ModelRouterService();
