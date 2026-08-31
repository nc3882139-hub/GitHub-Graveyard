/**
 * Error handling utility for consistent error responses
 */

class APIError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.name = 'APIError';
        this.statusCode = statusCode;
        this.details = details;
    }
}

// Common error classes
class ValidationError extends APIError {
    constructor(message, details = null) {
        super(message, 400, details);
        this.name = 'ValidationError';
    }
}

class NotFoundError extends APIError {
    constructor(message = 'Resource not found', details = null) {
        super(message, 404, details);
        this.name = 'NotFoundError';
    }
}

class AuthenticationError extends APIError {
    constructor(message = 'Authentication required', details = null) {
        super(message, 401, details);
        this.name = 'AuthenticationError';
    }
}

class UnauthorizedError extends APIError {
    constructor(message = 'Unauthorized', details = null) {
        super(message, 403, details);
        this.name = 'UnauthorizedError';
    }
}

class GitHubAPIError extends APIError {
    constructor(message, statusCode = 500, details = null) {
        super(message, statusCode, details);
        this.name = 'GitHubAPIError';
    }
}

/**
 * Express error handling middleware
 * Place this at the end of your route definitions
 */
function errorHandler(err, req, res, next) {
    // Log the error
    console.error('[ERROR]', err.name || 'Unknown Error', err.message);
    
    // Handle known API errors
    if (err instanceof APIError) {
        return res.status(err.statusCode).json({
            error: err.message,
            type: err.name,
            details: err.details,
            timestamp: new Date().toISOString()
        });
    }

    // Handle unknown errors
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message;

    res.status(statusCode).json({
        error: message,
        type: 'InternalError',
        timestamp: new Date().toISOString()
    });
}

module.exports = {
    APIError,
    ValidationError,
    NotFoundError,
    AuthenticationError,
    UnauthorizedError,
    GitHubAPIError,
    errorHandler
};
