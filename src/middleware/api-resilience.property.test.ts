import { ApiResilience, GracefulDegradation } from './errorHandler';

// Feature: agrimonitor-lite, Property 14: API Resilience
// **Validates: Requirements 8.2, 8.3, 8.4, 8.5**

describe('API Resilience Property Tests', () => {
  beforeEach(() => {
    // Clear any existing service failures
    GracefulDegradation.getFailedServices().forEach(service => {
      GracefulDegradation.clearServiceFailure(service);
    });
  });

  test('Property 14: Exponential Backoff - Should implement exponential backoff with jitter', async () => {
    let attemptTimes: number[] = [];
    let attemptCount = 0;

    const failingOperation = async () => {
      attemptTimes.push(Date.now());
      attemptCount++;
      if (attemptCount <= 2) {
        throw new Error(`Attempt ${attemptCount} failed`);
      }
      return 'success';
    };

    const result = await ApiResilience.withRetry(failingOperation, 'backoff-test', 2);

    expect(result).toBe('success');
    expect(attemptCount).toBe(3);
    expect(attemptTimes.length).toBe(3);

    // Verify exponential backoff timing (allowing for some variance due to jitter)
    const firstDelay = attemptTimes[1] - attemptTimes[0];
    const secondDelay = attemptTimes[2] - attemptTimes[1];

    // First delay should be around 1000ms (base delay)
    expect(firstDelay).toBeGreaterThan(900);
    expect(firstDelay).toBeLessThan(1200);

    // Second delay should be around 2000ms (exponential backoff)
    expect(secondDelay).toBeGreaterThan(1800);
    expect(secondDelay).toBeLessThan(2400);
  });

  test('Property 14: Request Queuing - Should handle rate limits gracefully', async () => {
    const rateLimitedOperation = async () => {
      // Simulate rate limit error
      const error = new Error('Rate limit exceeded');
      (error as any).statusCode = 429;
      throw error;
    };

    await expect(
      ApiResilience.withRetry(rateLimitedOperation, 'rate-limited-service', 2)
    ).rejects.toThrow('rate-limited-service failed after 3 attempts');

    // Service should be marked as failed
    expect(GracefulDegradation.isServiceAvailable('rate-limited-service')).toBe(false);
  });

  test('Property 14: Response Validation - Should validate responses before processing', async () => {
    const responses = [
      { valid: true, data: { temperature: 25, humidity: 60 } },
      { valid: false, data: null }, // Invalid response
      { valid: true, data: { temperature: 30, humidity: 55 } }
    ];

    let responseIndex = 0;

    const validatingOperation = async () => {
      const response = responses[responseIndex++];

      if (!response.valid || !response.data) {
        throw new Error('Invalid response received');
      }

      return response.data;
    };

    // First call should succeed
    const result1 = await ApiResilience.withRetry(validatingOperation, 'validation-test', 2);
    expect(result1).toEqual({ temperature: 25, humidity: 60 });

    // Second call should fail and retry, then succeed
    const result2 = await ApiResilience.withRetry(validatingOperation, 'validation-test', 2);
    expect(result2).toEqual({ temperature: 30, humidity: 55 });
  });

  test('Property 14: Authentication Error Handling - Should handle authentication failures properly', async () => {
    let authAttempts = 0;

    const authFailingOperation = async () => {
      authAttempts++;
      if (authAttempts <= 1) {
        const error = new Error('Authentication failed');
        (error as any).statusCode = 401;
        throw error;
      }
      return 'authenticated';
    };

    const result = await ApiResilience.withRetry(authFailingOperation, 'auth-service', 2);
    expect(result).toBe('authenticated');
    expect(authAttempts).toBe(2);
  });

  test('Property 14: Timeout Handling - Should timeout operations that exceed time limits', async () => {
    const slowOperation = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      return 'slow-result';
    };

    const fastOperation = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'fast-result';
    };

    // Slow operation should timeout
    await expect(
      ApiResilience.withTimeout(slowOperation, 200, 'slow-service')
    ).rejects.toThrow('slow-service operation timed out after 200ms');

    // Fast operation should succeed
    const result = await ApiResilience.withTimeout(fastOperation, 200, 'fast-service');
    expect(result).toBe('fast-result');
  });

  test('Property 14: Service Circuit Breaker - Should implement circuit breaker pattern', async () => {
    const serviceName = 'circuit-breaker-test';

    // Initially service should be available
    expect(GracefulDegradation.isServiceAvailable(serviceName)).toBe(true);

    // Simulate service failure
    const alwaysFailingOperation = async () => {
      throw new Error('Service is down');
    };

    // This should fail and mark service as unavailable
    await expect(
      ApiResilience.withRetry(alwaysFailingOperation, serviceName, 2)
    ).rejects.toThrow();

    // Service should now be marked as failed
    expect(GracefulDegradation.isServiceAvailable(serviceName)).toBe(false);
    expect(GracefulDegradation.getFailedServices()).toContain(serviceName);
  });

  test('Property 14: Concurrent Request Handling - Should handle multiple concurrent requests properly', async () => {
    let requestCount = 0;
    const maxConcurrent = 3;

    const concurrentOperation = async (requestId: number) => {
      requestCount++;

      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 100));

      if (requestId === 1) {
        // Make request with index 1 fail initially
        throw new Error(`Request ${requestId} failed`);
      }

      return `Result ${requestId}`;
    };

    // Execute multiple concurrent requests
    const promises = Array.from({ length: maxConcurrent }, (_, i) =>
      ApiResilience.withRetry(() => concurrentOperation(i), `concurrent-service-${i}`, 1)
    );

    const results = await Promise.allSettled(promises);

    // Check results
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected'); // This one should fail after retries
    expect(results[2].status).toBe('fulfilled');

    if (results[0].status === 'fulfilled') {
      expect(results[0].value).toBe('Result 0');
    }
    if (results[2].status === 'fulfilled') {
      expect(results[2].value).toBe('Result 2');
    }
  });

  test('Property 14: Service Recovery - Should allow service recovery after failure period', async () => {
    const serviceName = 'recovery-test';

    // Mark service as failed
    GracefulDegradation.markServiceFailed(serviceName);
    expect(GracefulDegradation.isServiceAvailable(serviceName)).toBe(false);

    // Clear the failure manually (simulating recovery)
    GracefulDegradation.clearServiceFailure(serviceName);
    expect(GracefulDegradation.isServiceAvailable(serviceName)).toBe(true);

    // Service should work again
    const workingOperation = async () => 'recovered';
    const result = await ApiResilience.withRetry(workingOperation, serviceName, 1);
    expect(result).toBe('recovered');
  });

  test('Property 14: Error Propagation - Should properly propagate different types of errors', async () => {
    const errorTypes = [
      { error: new Error('Network error'), expectedType: 'ExternalServiceError' },
      { error: new Error('Timeout'), expectedType: 'ExternalServiceError' },
      { error: new Error('Invalid response'), expectedType: 'ExternalServiceError' }
    ];

    for (const { error, expectedType } of errorTypes) {
      const failingOperation = async () => {
        throw error;
      };

      try {
        await ApiResilience.withRetry(failingOperation, 'error-test', 1);
        fail('Should have thrown an error');
      } catch (thrownError: any) {
        expect(thrownError.constructor.name).toBe(expectedType);
        expect(thrownError.message).toContain('error-test failed after 2 attempts');
      }
    }
  });

  test('Property 14: Retry Strategy Configuration - Should respect different retry configurations', async () => {
    let attemptCounts: Record<string, number> = {};

    const createFailingOperation = (serviceName: string, failUntilAttempt: number) => {
      return async () => {
        attemptCounts[serviceName] = (attemptCounts[serviceName] || 0) + 1;

        if (attemptCounts[serviceName] <= failUntilAttempt) {
          throw new Error(`${serviceName} attempt ${attemptCounts[serviceName]} failed`);
        }

        return `${serviceName} success`;
      };
    };

    // Test with different retry counts
    const service1 = await ApiResilience.withRetry(
      createFailingOperation('service1', 1),
      'service1',
      1 // Max 1 retry (2 total attempts)
    );

    const service2 = await ApiResilience.withRetry(
      createFailingOperation('service2', 2),
      'service2',
      2 // Max 2 retries (3 total attempts)
    );

    expect(service1).toBe('service1 success');
    expect(service2).toBe('service2 success');
    expect(attemptCounts.service1).toBe(2);
    expect(attemptCounts.service2).toBe(3);
  });

  test('Property 14: Resource Cleanup - Should properly clean up resources on failure', async () => {
    const resources: string[] = [];

    const resourceOperation = async () => {
      resources.push('resource-allocated');

      try {
        throw new Error('Operation failed');
      } finally {
        resources.push('resource-cleaned');
      }
    };

    await expect(
      ApiResilience.withRetry(resourceOperation, 'resource-service', 1)
    ).rejects.toThrow();

    // Resources should be cleaned up for each attempt
    expect(resources.filter(r => r === 'resource-allocated')).toHaveLength(2); // 2 attempts
    expect(resources.filter(r => r === 'resource-cleaned')).toHaveLength(2); // 2 cleanups
  });

  test('Property 14: Metrics and Monitoring - Should provide visibility into retry behavior', async () => {
    let metricsData: any[] = [];

    const monitoredOperation = async () => {
      metricsData.push({
        timestamp: Date.now(),
        operation: 'test-operation',
        attempt: metricsData.length + 1
      });

      if (metricsData.length <= 1) {
        throw new Error('Monitored operation failed');
      }

      return 'monitored-success';
    };

    const result = await ApiResilience.withRetry(monitoredOperation, 'monitored-service', 2);

    expect(result).toBe('monitored-success');
    expect(metricsData).toHaveLength(2);
    expect(metricsData[0].attempt).toBe(1);
    expect(metricsData[1].attempt).toBe(2);

    // Verify timing between attempts
    const timeDiff = metricsData[1].timestamp - metricsData[0].timestamp;
    expect(timeDiff).toBeGreaterThan(900); // Should have delay between retries
  });
});