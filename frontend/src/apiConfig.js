/**
 * API Configuration
 * Centralized API endpoints and axios instance with auth
 */

import axios from 'axios';

const getEnvApiBaseUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  return 'http://localhost:5000';
};

// Base API URL from environment variable or default to localhost
export const API_BASE_URL = getEnvApiBaseUrl();

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 - Unauthorized (redirect to login)
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Only redirect if not already on login page
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  AUTH_LOGIN: `${API_BASE_URL}/api/auth/login`,
  AUTH_VERIFY: `${API_BASE_URL}/api/auth/verify`,
  
  // Invoices
  INVOICES: `${API_BASE_URL}/api/invoices`,
  INVOICE_BY_ID: (id) => `${API_BASE_URL}/api/invoices/${id}`,
  INVOICE_PDF: (id) => `${API_BASE_URL}/api/invoices/${id}/generate-pdf`,
  INVOICE_DUPLICATE: (id) => `${API_BASE_URL}/api/invoices/${id}/duplicate`,
  
  // Web invoices (public)
  WEB_INVOICES: `${API_BASE_URL}/api/web-invoices`,
  WEB_INVOICE_BY_ID: (id) => `${API_BASE_URL}/api/web-invoices/${id}`,
  
  // Email
  EMAIL_SEND: `${API_BASE_URL}/api/email/send`,
  EMAIL_REMINDER: `${API_BASE_URL}/api/email/reminder`,
  EMAIL_TEST: `${API_BASE_URL}/api/email/test-smtp`,
  
  // Data/Settings
  DATA_CUSTOMERS: `${API_BASE_URL}/api/data/customers`,
  DATA_SETTINGS: `${API_BASE_URL}/api/data/settings`,
  DATA_SYNC: `${API_BASE_URL}/api/data/sync`,
  DATA_SYNC_ALL: `${API_BASE_URL}/api/data/sync-all`,
  
  // Products
  PRODUCTS: `${API_BASE_URL}/api/products`,
  PRODUCT_BY_ID: (id) => `${API_BASE_URL}/api/products/${id}`,
  
  // Customers
  CUSTOMERS: {
    LIST: `${API_BASE_URL}/api/data/customers`,
    DETAIL: (email) => `${API_BASE_URL}/api/customers/${encodeURIComponent(email)}`,
    ANALYTICS: `${API_BASE_URL}/api/customers/analytics/summary`
  },
  
  // Export
  EXPORT: {
    INVOICES: `${API_BASE_URL}/api/export/invoices`,
    CUSTOMERS: `${API_BASE_URL}/api/export/customers`,
    PRODUCTS: `${API_BASE_URL}/api/export/products`
  },
  
  // AI
  AI_PARSE: `${API_BASE_URL}/api/ai/parse`,
  AI_INSIGHTS: `${API_BASE_URL}/api/ai/insights`,
  AI_OCR_BANK: `${API_BASE_URL}/api/ai/ocr-bank-statement`,
  AI_MARKETING_PLAN: `${API_BASE_URL}/api/ai/marketing-plan`,
  AI_CHAT: `${API_BASE_URL}/api/ai/chat`,

  // Mail
  MAIL: {
    INBOX: `${API_BASE_URL}/api/mail/inbox`,
    SYNC: `${API_BASE_URL}/api/mail/sync`,
    UPDATE: (id) => `${API_BASE_URL}/api/mail/inbox/${id}`,
    REPLY: `${API_BASE_URL}/api/mail/reply`
  },
  
  // Bank
  BANK_TRANSACTIONS: `${API_BASE_URL}/api/bank`,

  // Tasks
  TASKS: {
    LIST: `${API_BASE_URL}/api/tasks`,
    UPDATE: (id) => `${API_BASE_URL}/api/tasks/${id}`
  },

  // Marketing
  MARKETING: {
    LIST: `${API_BASE_URL}/api/marketing`,
    UPDATE: (id) => `${API_BASE_URL}/api/marketing/${id}`
  },

  // Orders
  ORDERS: {
    LIST: `${API_BASE_URL}/api/orders`,
    UPDATE_STATUS: (id) => `${API_BASE_URL}/api/orders/${id}/status`,
    DELETE: (id) => `${API_BASE_URL}/api/orders/${id}`,
    EXTRACT_AI: `${API_BASE_URL}/api/ai/extract-order`
  },
  
  // Analytics
  ANALYTICS: `${API_BASE_URL}/api/analytics`,

  // Accounting Reports
  ACCOUNTING_REPORTS: {
    TRIAL_BALANCE: `${API_BASE_URL}/api/accounting/reports/trial-balance?format=csv`,
    BALANCE_SHEET: `${API_BASE_URL}/api/accounting/reports/balance-sheet?format=csv`,
    PROFIT_LOSS: `${API_BASE_URL}/api/accounting/reports/profit-loss?format=csv`,
    GSTR1: `${API_BASE_URL}/api/accounting/reports/gstr1?format=csv`,
    GSTR2: `${API_BASE_URL}/api/accounting/reports/gstr2?format=csv`,
    GSTR3B: `${API_BASE_URL}/api/accounting/reports/gstr3b?format=csv`
  },
  
  // Upload
  UPLOAD: `${API_BASE_URL}/api/upload`
};

/**
 * API helper functions with error handling
 */
export const api = {
  // GET request
  get: async (url, config = {}) => {
    try {
      const response = await apiClient.get(url, config);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // POST request
  post: async (url, data = {}, config = {}) => {
    try {
      const response = await apiClient.post(url, data, config);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // PATCH request
  patch: async (url, data = {}, config = {}) => {
    try {
      const response = await apiClient.patch(url, data, config);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // DELETE request
  delete: async (url, config = {}) => {
    try {
      const response = await apiClient.delete(url, config);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }
};

/**
 * Handle API errors and extract user-friendly messages
 */
const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error status
    const message = error.response.data?.error || 
                   error.response.data?.message || 
                   'Server error occurred';
    const status = error.response.status;
    const details = error.response.data?.details;
    
    return {
      message,
      status,
      details,
      isApiError: true
    };
  } else if (error.request) {
    // Request made but no response
    return {
      message: 'No response from server. Please check your connection.',
      status: 0,
      isApiError: true
    };
  } else {
    // Something else happened
    return {
      message: error.message || 'An unexpected error occurred',
      status: 0,
      isApiError: true
    };
  }
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  return !!localStorage.getItem('token');
};

/**
 * Get stored auth token
 */
export const getToken = () => {
  return localStorage.getItem('token');
};

/**
 * Set auth token
 */
export const setToken = (token) => {
  localStorage.setItem('token', token);
};

/**
 * Remove auth token (logout)
 */
export const removeToken = () => {
  localStorage.removeItem('token');
};

export default apiClient;
