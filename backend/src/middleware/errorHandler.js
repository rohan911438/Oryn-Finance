const logger = require('../config/logger');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

class StellarError extends AppError {
  constructor(message, stellarCode = null) {
    super(message, 500, 'STELLAR_ERROR');
    this.stellarCode = stellarCode;
  }
}

class SorobanError extends AppError {
  constructor(message, contractAddress = null) {
    super(message, 500, 'SOROBAN_ERROR');
    this.contractAddress = contractAddress;
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user?.walletAddress || 'anonymous',
    requestId: req.id
  });

  // MongoDB errors
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID format';
    error = new ValidationError(message);
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate value for field: ${field}`;
    error = new ConflictError(message);
  }

  // MongoDB validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => val.message);
    const message = errors.join('. ');
    error = new ValidationError(message);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new UnauthorizedError('Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    error = new UnauthorizedError('Token expired');
  }

  // Stellar SDK errors
  if (err.name === 'BadResponseError' || err.name === 'NetworkError') {
    error = new StellarError('Stellar network error: ' + err.message);
  }

  // Default to 500 server error
  if (!error.isOperational) {
    error = new AppError('Something went wrong', 500, 'INTERNAL_ERROR');
  }

  // Send error response
  const response = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    }
  };

  // Add additional error fields for specific error types
  if (error instanceof ValidationError && error.field) {
    response.error.field = error.field;
  }

  if (error instanceof StellarError && error.stellarCode) {
    response.error.stellarCode = error.stellarCode;
  }

  if (error instanceof SorobanError && error.contractAddress) {
    response.error.contractAddress = error.contractAddress;
  }

  res.status(error.statusCode || 500).json(response);
};

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Not found handler
const notFound = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFound,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  StellarError,
  SorobanError
};