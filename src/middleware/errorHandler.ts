import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class ValidationError extends Error implements ApiError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error implements ApiError {
  statusCode = 404;
  code = 'NOT_FOUND';

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ExternalServiceError extends Error implements ApiError {
  statusCode = 502;
  code = 'EXTERNAL_SERVICE_ERROR';

  constructor(message: string, public service: string, public details?: any) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}

export class DatabaseError extends Error implements ApiError {
  statusCode = 500;
  code = 'DATABASE_ERROR';

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class AuthenticationError extends Error implements ApiError {
  statusCode = 401;
  code = 'AUTHENTICATION_ERROR';

  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends Error implements ApiError {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';

  constructor(message: string = 'Rate limit exceeded', public retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Global error handling middleware
 */
export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log error with context
  const errorContext = {
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    },
    timestamp: new Date().toISOString()
  };

  // Determine log level based on error type
  if (error.statusCode && error.statusCode >= 500) {
    logger.error('Server error occurred', errorContext);
  } else if (error.statusCode && error.statusCode >= 400) {
    logger.warn('Client error occurred', errorContext);
  } else {
    logger.error('Unexpected error occurred', errorContext);
  }

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Prepare error response
  const errorResponse: any = {
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] || 'unknown'
    }
  };

  // Add details for development environment
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = error.stack;
    errorResponse.error.details = error.details;
  }

  // Add retry information for rate limit errors
  if (error instanceof RateLimitError && error.retryAfter) {
    res.set('Retry-After', error.retryAfter.toString());
    errorResponse.error.retryAfter = error.retryAfter;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 handler for unmatched routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);

  logger.warn('Route not found', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: error.message,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] || 'unknown'
    }
  });
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  // Generate request ID if not present
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Log request
  logger.info('Incoming request', {
    requestId: req.headers['x-request-id'],
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString()
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.info('Request completed', {
      requestId: req.headers['x-request-id'],
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      timestamp: new Date().toISOString()
    });
  });

  next();
};

/**
 * Graceful degradation handler
 */
export class GracefulDegradation {
  private static failedServices = new Set<string>();
  private static serviceRetryTimes = new Map<string, number>();
  private static readonly RETRY_DELAY = 5 * 60 * 1000; // 5 minutes

  static markServiceFailed(serviceName: string): void {
    this.failedServices.add(serviceName);
    this.serviceRetryTimes.set(serviceName, Date.now() + this.RETRY_DELAY);

    logger.error('Service marked as failed', {
      service: serviceName,
      retryAt: new Date(Date.now() + this.RETRY_DELAY).toISOString()
    });
  }

  static isServiceAvailable(serviceName: string): boolean {
    if (!this.failedServices.has(serviceName)) {
      return true;
    }

    const retryTime = this.serviceRetryTimes.get(serviceName);
    if (retryTime && Date.now() > retryTime) {
      // Time to retry
      this.failedServices.delete(serviceName);
      this.serviceRetryTimes.delete(serviceName);
      logger.info('Service retry time reached, marking as available', { service: serviceName });
      return true;
    }

    return false;
  }

  static getFailedServices(): string[] {
    return Array.from(this.failedServices);
  }

  static clearServiceFailure(serviceName: string): void {
    this.failedServices.delete(serviceName);
    this.serviceRetryTimes.delete(serviceName);
    logger.info('Service failure cleared', { service: serviceName });
  }
}

/**
 * API resilience wrapper with exponential backoff
 */
export class ApiResilience {
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY = 1000; // 1 second

  static async withRetry<T>(
    operation: () => Promise<T>,
    serviceName: string,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();

        // Clear any previous service failures on success
        if (attempt > 0) {
          GracefulDegradation.clearServiceFailure(serviceName);
          logger.info('Service recovered after retry', {
            service: serviceName,
            attempt: attempt + 1
          });
        }

        return result;
      } catch (error: any) {
        lastError = error;

        logger.warn('API operation failed', {
          service: serviceName,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          error: error.message
        });

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Calculate exponential backoff delay
        const delay = this.BASE_DELAY * Math.pow(2, attempt);
        const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
        const totalDelay = delay + jitter;

        logger.info('Retrying API operation', {
          service: serviceName,
          nextAttempt: attempt + 2,
          delayMs: Math.round(totalDelay)
        });

        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }

    // Mark service as failed after all retries exhausted
    GracefulDegradation.markServiceFailed(serviceName);

    throw new ExternalServiceError(
      `${serviceName} failed after ${maxRetries + 1} attempts: ${lastError.message}`,
      serviceName,
      { attempts: maxRetries + 1, lastError: lastError.message }
    );
  }

  static async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    serviceName: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new ExternalServiceError(
          `${serviceName} operation timed out after ${timeoutMs}ms`,
          serviceName,
          { timeoutMs }
        ));
      }, timeoutMs);
    });

    return Promise.race([operation(), timeoutPromise]);
  }
}

/**
 * Validation helper functions
 */
export const validateRequired = (value: any, fieldName: string): void => {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${fieldName} is required`);
  }
};

export const validateNumber = (value: any, fieldName: string, min?: number, max?: number): void => {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  if (min !== undefined && value < min) {
    throw new ValidationError(`${fieldName} must be >= ${min}`);
  }

  if (max !== undefined && value > max) {
    throw new ValidationError(`${fieldName} must be <= ${max}`);
  }
};

export const validateString = (value: any, fieldName: string, minLength?: number, maxLength?: number): void => {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  if (minLength !== undefined && value.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters`);
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(`${fieldName} must be at most ${maxLength} characters`);
  }
};

export const validateEmail = (value: string, fieldName: string = 'email'): void => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new ValidationError(`${fieldName} must be a valid email address`);
  }
};

export const validateCoordinates = (latitude: number, longitude: number): void => {
  validateNumber(latitude, 'latitude', -90, 90);
  validateNumber(longitude, 'longitude', -180, 180);
};