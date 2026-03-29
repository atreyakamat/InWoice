/**
 * Standardized API response utilities
 */

/**
 * Create a success response
 * @param {*} data - The data to return
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {object} Standardized success response
 */
const successResponse = (data, message = 'Success', statusCode = 200) => {
  return {
    success: true,
    message,
    data,
    statusCode
  };
};

/**
 * Create an error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {*} details - Additional error details
 * @returns {object} Standardized error response
 */
const errorResponse = (message, statusCode = 500, details = null) => {
  const response = {
    success: false,
    error: message,
    statusCode
  };
  
  if (details) {
    response.details = details;
  }
  
  return response;
};

/**
 * Create a validation error response
 * @param {object} validationErrors - Validation error details from Zod
 * @returns {object} Standardized validation error response
 */
const validationErrorResponse = (validationErrors) => {
  return {
    success: false,
    error: 'Validation failed',
    statusCode: 400,
    details: validationErrors
  };
};

module.exports = {
  successResponse,
  errorResponse,
  validationErrorResponse
};
