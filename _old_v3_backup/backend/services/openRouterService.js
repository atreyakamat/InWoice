/**
 * OpenRouter Service - PHASE 1
 * 
 * Centralized wrapper for all OpenRouter API calls
 * Handles authentication, model selection, cost tracking, and error handling
 * 
 * SECURITY: Never call OpenRouter directly from routes or frontend
 * All AI requests MUST pass through this service
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errorHandler');

class OpenRouterService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    this.appName = process.env.OPENROUTER_APP_NAME || 'InWoice';
    this.initialized = !!this.apiKey;
    
    if (!this.initialized) {
      logger.warn('OpenRouter API key not configured. AI features disabled.');
    }

    // Initialize axios client with default headers
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': process.env.HTTP_REFERER || 'https://inwvoice.app',
        'X-Title': this.appName
      }
    });
  }

  /**
   * Call a model via OpenRouter
   * This is the PRIMARY method for all AI requests
   * 
   * @param {string} model - Model identifier (e.g., 'claude-3-sonnet', 'gpt-4')
   * @param {array} messages - Message array [{role, content}, ...]
   * @param {object} options - Optional parameters (temperature, maxTokens, etc)
   * @returns {Promise<object>} Response with content, tokens, cost
   */
  async callModel(model, messages, options = {}) {
    if (!this.initialized) {
      throw new AppError(
        'OpenRouter API key not configured',
        503,
        'OPENROUTER_NOT_CONFIGURED'
      );
    }

    try {
      const startTime = Date.now();

      const payload = {
        model,
        messages,
        temperature: options.temperature ?? parseFloat(process.env.AI_TEMPERATURE || 0.7),
        max_tokens: options.maxTokens ?? parseInt(process.env.AI_MAX_TOKENS || 2000),
        top_p: options.topP ?? 1,
        ...options.additionalParams
      };

      logger.info('Calling OpenRouter', { model, messagesCount: messages.length });

      const response = await this.client.post('/chat/completions', payload);

      const responseTime = Date.now() - startTime;
      const usage = response.data.usage || {};
      const cost = this.calculateCost(
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0,
        model
      );

      const result = {
        content: response.data.choices[0]?.message?.content || '',
        model,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        estimatedCost: cost,
        responseTimeMs: responseTime,
        finishReason: response.data.choices[0]?.finish_reason || 'stop',
        rawResponse: response.data
      };

      logger.info('OpenRouter response received', {
        model,
        tokens: result.totalTokens,
        cost: result.estimatedCost,
        time: responseTime
      });

      return result;
    } catch (error) {
      logger.error('OpenRouter API call failed', {
        model,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      if (error.response?.status === 401) {
        throw new AppError(
          'OpenRouter authentication failed. Invalid API key.',
          401,
          'OPENROUTER_AUTH_FAILED'
        );
      }

      if (error.response?.status === 429) {
        throw new AppError(
          'OpenRouter rate limit exceeded. Please try again later.',
          429,
          'OPENROUTER_RATE_LIMIT'
        );
      }

      throw new AppError(
        `OpenRouter API error: ${error.message}`,
        error.response?.status || 500,
        'OPENROUTER_ERROR',
        error.response?.data
      );
    }
  }

  /**
   * List all available models from OpenRouter
   * 
   * @returns {Promise<array>} Array of available models
   */
  async listModels() {
    if (!this.initialized) {
      logger.warn('OpenRouter not initialized, returning empty model list');
      return [];
    }

    try {
      const response = await this.client.get('/models');
      
      const models = response.data.data?.map(model => ({
        id: model.id,
        name: model.name,
        contextLength: model.context_length,
        costPer1kInputTokens: model.pricing?.prompt || 0,
        costPer1kOutputTokens: model.pricing?.completion || 0,
        architecture: model.architecture?.modality || 'text'
      })) || [];

      logger.info('Retrieved available models from OpenRouter', { count: models.length });
      return models;
    } catch (error) {
      logger.error('Failed to list models from OpenRouter', { error: error.message });
      return [];
    }
  }

  /**
   * Calculate estimated cost for a request
   * 
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @param {string} model - Model identifier
   * @returns {number} Estimated cost in USD
   */
  calculateCost(inputTokens, outputTokens, model) {
    // Model-specific pricing (per 1K tokens)
    const modelPricing = {
      'claude-3-opus': { input: 0.015, output: 0.075 },
      'claude-3-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-haiku': { input: 0.00025, output: 0.00125 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gemini-2.0-flash': { input: 0.000075, output: 0.0003 },
      'mistral-large': { input: 0.002, output: 0.006 },
      'default': { input: 0.001, output: 0.002 }
    };

    // Extract base model name (e.g., 'claude-3-sonnet' from 'claude-3-sonnet-20240229')
    const baseModel = Object.keys(modelPricing).find(m => model.includes(m)) || 'default';
    const pricing = modelPricing[baseModel];

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;

    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Test OpenRouter connection
   * 
   * @returns {Promise<boolean>} True if connection successful
   */
  async health() {
    if (!this.initialized) {
      return false;
    }

    try {
      const response = await this.callModel('gpt-4o-mini', [
        { role: 'user', content: 'Respond with: OK' }
      ], { maxTokens: 10 });

      return response.content.includes('OK');
    } catch (error) {
      logger.error('OpenRouter health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get current API key status without exposing the key
   * 
   * @returns {object} Status information
   */
  getStatus() {
    return {
      initialized: this.initialized,
      hasApiKey: !!this.apiKey,
      apiKeyPrefix: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : null,
      baseUrl: this.baseUrl,
      appName: this.appName
    };
  }

  /**
   * Legacy method for backward compatibility
   * Redirects to new callModel method
   */
  async sendToOpenRouter(messages, model, temperature, maxTokens) {
    const response = await this.callModel(model, messages, {
      temperature,
      maxTokens
    });
    
    return {
      content: response.content,
      model_used: response.model,
      tokens_used: response.totalTokens,
      estimated_cost: response.estimatedCost
    };
  }
}

module.exports = new OpenRouterService();
