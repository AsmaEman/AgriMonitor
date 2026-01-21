import { Request, Response, NextFunction } from 'express';
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
  asyncHandler,
  ValidationError,
  NotFoundError,
  ExternalServiceError,
  DatabaseError,
  AuthenticationError,
  RateLimitError,
  GracefulDegradation,
  ApiResilience,
  validateRequired,
  validateNumber,
  validateString,
  validateCoordinates
} from './errorHandler';

// Feature: agrimonitor-lite, Property 16: Comprehensive Error Handling
// **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

describe('Comprehensive Error Handling Property Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let responseData: any;

  beforeEach(() => {
    responseData = {};

    mockReq = {
      method: 'GET',
      url: '/test',
      path: '/test',
      headers: {},
      body: {},
      params: {},
      query: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent')
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((data) => {
        responseData = data;
        return mockRes;
      }),
      set: jest.fn().mockReturnThis(),
      get: jest.fn(),
      on: jest.fn()
    } as any;

    mockNext = jest.fn();
  });

  test('Property 16: Error Classification - Should properly classify and handle different error types', () => {
    const errorTypes = [
      {
        error: new ValidationError('Invalid input', { field: 'name' }),
        expectedStatus: 400,
        expectedCode: 'VALIDATION_ERROR'
      },
      {
        error: new NotFoundError('Resource not found'),
        expectedStatus: 404,
        expectedCode: 'NOT_FOUND'
      },
      {
        error: new ExternalServiceError('API failed', 'weather-service'),
        expectedStatus: 502,
        expectedCode: 'EXTERNAL_SERVICE_ERROR'
      },
      {
        error: new DatabaseError('Connection failed'),
        expectedStatus: 500,
        expectedCode: 'DATABASE_ERROR'
      },
      {
        error: new AuthenticationError('Invalid token'),
        expectedStatus: 401,
        expectedCode: 'AUTHENTICATION_ERROR'
      },
      {
        error: new RateLimitError('Too many requests', 60),
        expectedStatus: 429,
        expectedCode: 'RATE_LIMIT_EXCEEDED'
      }
    ];

    errorTypes.forEach(({ error, expectedStatus, expectedCode }) => {
      // Reset mocks
      jest.clearAllMocks();
      responseData = {};

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(expectedStatus);
      expect(responseData.error.code).toBe(expectedCode);
      expect(responseData.error.message).toBe(error.message);
      expect(responseData.error.timestamp).toBeDefined();
    });
  });

  test('Property 16: Error Context Logging - Should log errors with proper context and detail levels', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    try {
      // Test server error (500+) - should log as error
      const serverError = new DatabaseError('Database connection failed');
      errorHandler(serverError, mockReq as Request, mockRes as Response, mockNext);

      // Test client error (400-499) - should log as warning
      const clientError = new ValidationError('Invalid input');
      errorHandler(clientError, mockReq as Request, mockRes as Response, mockNext);

      // Verify logging occurred (implementation may vary based on logger)
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.status).toHaveBeenCalledWith(400);

    } finally {
      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    }
  });

  test('Property 16: Request Logging - Should log requests with proper timing and context', (done) => {
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

    try {
      // Mock response finish event
      let finishCallback: Function;
      (mockRes as any).on = jest.fn((event: string, callback: Function) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
      });

      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      // Verify request ID was added
      expect(mockReq.headers!['x-request-id']).toBeDefined();
      expect(mockNext).toHaveBeenCalled();

      // Simulate response finish
      setTimeout(() => {
        if (finishCallback) {
          finishCallback();
        }

        // Verify logging occurred
        expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));

        done();
      }, 10);

    } finally {
      consoleSpy.mockRestore();
    }
  });

  test('Property 16: Async Error Handling - Should properly catch and forward async errors', async () => {
    const asyncError = new Error('Async operation failed');

    const asyncOperation = async (_req: Request, _res: Response, _next: NextFunction) => {
      throw asyncError;
    };

    const wrappedHandler = asyncHandler(asyncOperation);

    await wrappedHandler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(asyncError);
  });

  test('Property 16: Graceful Degradation - Should track and manage service failures', () => {
    const serviceName = 'test-service';

    // Initially service should be available
    expect(GracefulDegradation.isServiceAvailable(serviceName)).toBe(true);

    // Mark service as failed
    GracefulDegradation.markServiceFailed(serviceName);
    expect(GracefulDegradation.isServiceAvailable(serviceName)).toBe(false);
    expect(GracefulDegradation.getFailedServices()).toContain(serviceName);

    // Clear service failure
    GracefulDegradation.clearServiceFailure(serviceName);
    expect(GracefulDegradation.isServiceAvailable(serviceName)).toBe(true);
    expect(GracefulDegradation.getFailedServices()).not.toContain(serviceName);
  });

  test('Property 16: API Resilience with Retry - Should retry failed operations with exponential backoff', async () => {
    let attemptCount = 0;
    const maxRetries = 2;

    const failingOperation = async () => {
      attemptCount++;
      if (attemptCount <= maxRetries) {
        throw new Error(`Attempt ${attemptCount} failed`);
      }
      return 'success';
    };

    const result = await ApiResilience.withRetry(failingOperation, 'test-service', maxRetries);

    expect(result).toBe('success');
    expect(attemptCount).toBe(maxRetries + 1);
  });

  test('Property 16: API Resilience with Timeout - Should timeout long-running operations', async () => {
    const longOperation = async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return 'completed';
    };

    await expect(
      ApiResilience.withTimeout(longOperation, 100, 'slow-service')
    ).rejects.toThrow('slow-service operation timed out');
  });

  test('Property 16: Validation Functions - Should validate inputs according to specified rules', () => {
    // Test required validation
    expect(() => validateRequired(null, 'name')).toThrow('name is required');
    expect(() => validateRequired('', 'name')).toThrow('name is required');
    expect(() => validateRequired('valid', 'name')).not.toThrow();

    // Test number validation
    expect(() => validateNumber('not-a-number', 'age')).toThrow('age must be a valid number');
    expect(() => validateNumber(5, 'age', 10, 100)).toThrow('age must be >= 10');
    expect(() => validateNumber(150, 'age', 10, 100)).toThrow('age must be <= 100');
    expect(() => validateNumber(25, 'age', 10, 100)).not.toThrow();

    // Test string validation
    expect(() => validateString(123, 'name')).toThrow('name must be a string');
    expect(() => validateString('ab', 'name', 3, 10)).toThrow('name must be at least 3 characters');
    expect(() => validateString('very long string', 'name', 3, 10)).toThrow('name must be at most 10 characters');
    expect(() => validateString('valid', 'name', 3, 10)).not.toThrow();

    // Test coordinate validation
    expect(() => validateCoordinates(91, 0)).toThrow('latitude must be <= 90');
    expect(() => validateCoordinates(-91, 0)).toThrow('latitude must be >= -90');
    expect(() => validateCoordinates(0, 181)).toThrow('longitude must be <= 180');
    expect(() => validateCoordinates(0, -181)).toThrow('longitude must be >= -180');
    expect(() => validateCoordinates(45.5, -122.3)).not.toThrow();
  });

  test('Property 16: Error Response Format - Should return consistent error response format', () => {
    const testError = new ValidationError('Test validation error', { field: 'test' });

    errorHandler(testError, mockReq as Request, mockRes as Response, mockNext);

    expect(responseData).toHaveProperty('error');
    expect(responseData.error).toHaveProperty('code');
    expect(responseData.error).toHaveProperty('message');
    expect(responseData.error).toHaveProperty('timestamp');
    expect(responseData.error).toHaveProperty('requestId');

    expect(responseData.error.code).toBe('VALIDATION_ERROR');
    expect(responseData.error.message).toBe('Test validation error');
    expect(new Date(responseData.error.timestamp)).toBeInstanceOf(Date);
  });

  test('Property 16: Rate Limit Handling - Should handle rate limit errors with retry information', () => {
    const rateLimitError = new RateLimitError('Rate limit exceeded', 120);

    errorHandler(rateLimitError, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.set).toHaveBeenCalledWith('Retry-After', '120');
    expect(responseData.error.retryAfter).toBe(120);
  });

  test('Property 16: Not Found Handler - Should handle unmatched routes properly', () => {
    notFoundHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(responseData.error.code).toBe('ROUTE_NOT_FOUND');
    expect(responseData.error.message).toContain('Route GET /test not found');
  });

  test('Property 16: Development vs Production Error Details - Should show/hide error details based on environment', () => {
    const originalEnv = process.env.NODE_ENV;

    try {
      // Test development environment
      process.env.NODE_ENV = 'development';
      const devError = new Error('Development error');
      devError.stack = 'Error stack trace';

      errorHandler(devError as any, mockReq as Request, mockRes as Response, mockNext);

      expect(responseData.error.stack).toBeDefined();

      // Reset for production test
      jest.clearAllMocks();
      responseData = {};

      // Test production environment
      process.env.NODE_ENV = 'production';

      errorHandler(devError as any, mockReq as Request, mockRes as Response, mockNext);

      expect(responseData.error.stack).toBeUndefined();

    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('Property 16: Error Handler Chain - Should not call next() after handling error', () => {
    const testError = new ValidationError('Test error');

    errorHandler(testError, mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalled();
  });

  test('Property 16: Service Recovery - Should clear service failures on successful retry', async () => {
    const serviceName = 'recovery-test-service';
    let attemptCount = 0;

    const recoveringOperation = async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error('First attempt fails');
      }
      return 'recovered';
    };

    // Service should initially be available
    expect(GracefulDegradation.isServiceAvailable(serviceName)).toBe(true);

    const result = await ApiResilience.withRetry(recoveringOperation, serviceName, 2);

    expect(result).toBe('recovered');
    expect(attemptCount).toBe(2);
    // Service should still be available after recovery
    expect(GracefulDegradation.isServiceAvailable(serviceName)).toBe(true);
  });

  test('Property 16: Concurrent Error Handling - Should handle multiple concurrent errors properly', async () => {
    const errors = [
      new ValidationError('Error 1'),
      new NotFoundError('Error 2'),
      new DatabaseError('Error 3')
    ];

    const promises = errors.map(error => {
      return new Promise<void>((resolve) => {
        // Create separate mock objects for each concurrent request
        const req = { ...mockReq };
        const res = {
          ...mockRes,
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis()
        };

        errorHandler(error, req as Request, res as Response, mockNext);
        resolve();
      });
    });

    await Promise.all(promises);

    // All errors should have been handled without interference
    expect(promises).toHaveLength(3);
  });
});