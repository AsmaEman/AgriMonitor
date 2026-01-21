import * as fc from 'fast-check';
import { WeatherService } from './WeatherService';
import { dbManager } from '../database';

// Feature: agrimonitor-lite, Property 6: Weather Data Retrieval
// **Validates: Requirements 3.1, 3.2**

describe('Weather Data Retrieval Property Tests', () => {
  let weatherService: WeatherService;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.OPENWEATHER_API_KEY = 'mock-api-key'; // Use mock data for testing
    await dbManager.initialize();
    weatherService = new WeatherService();
  });

  afterAll(async () => {
    await dbManager.close();
  });

  test('Property 6: Weather Data Retrieval - Current weather data should have valid ranges and required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.float({ min: Math.fround(-90), max: Math.fround(90) }),
          longitude: fc.float({ min: Math.fround(-180), max: Math.fround(180) })
        }),
        async (coords) => {
          const weatherData = await weatherService.getCurrentWeather(coords.latitude, coords.longitude);

          // Verify required fields exist
          expect(weatherData.temperature).toBeDefined();
          expect(weatherData.humidity).toBeDefined();
          expect(weatherData.precipitation).toBeDefined();
          expect(weatherData.windSpeed).toBeDefined();
          expect(weatherData.pressure).toBeDefined();
          expect(weatherData.cloudCover).toBeDefined();
          expect(weatherData.timestamp).toBeInstanceOf(Date);

          // Verify data ranges are realistic
          expect(weatherData.temperature).toBeGreaterThanOrEqual(-50); // Extreme cold
          expect(weatherData.temperature).toBeLessThanOrEqual(60);     // Extreme heat

          expect(weatherData.humidity).toBeGreaterThanOrEqual(0);
          expect(weatherData.humidity).toBeLessThanOrEqual(100);

          expect(weatherData.precipitation).toBeGreaterThanOrEqual(0);
          expect(weatherData.precipitation).toBeLessThanOrEqual(1000); // Extreme rainfall

          expect(weatherData.windSpeed).toBeGreaterThanOrEqual(0);
          expect(weatherData.windSpeed).toBeLessThanOrEqual(200); // Hurricane speeds

          expect(weatherData.pressure).toBeGreaterThanOrEqual(800);  // Extreme low pressure
          expect(weatherData.pressure).toBeLessThanOrEqual(1100);    // Extreme high pressure

          expect(weatherData.cloudCover).toBeGreaterThanOrEqual(0);
          expect(weatherData.cloudCover).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 6: Weather Forecast Data - 5-day forecast should have valid structure and data ranges', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.float({ min: Math.fround(-90), max: Math.fround(90) }),
          longitude: fc.float({ min: Math.fround(-180), max: Math.fround(180) })
        }),
        async (coords) => {
          const forecastData = await weatherService.getForecast(coords.latitude, coords.longitude);

          // Verify forecast structure
          expect(Array.isArray(forecastData)).toBe(true);
          expect(forecastData.length).toBeGreaterThan(0);
          expect(forecastData.length).toBeLessThanOrEqual(5);

          for (const day of forecastData) {
            // Verify required fields
            expect(day.date).toBeDefined();
            expect(typeof day.date).toBe('string');
            expect(day.temperature).toBeDefined();
            expect(day.temperature.min).toBeDefined();
            expect(day.temperature.max).toBeDefined();
            expect(day.humidity).toBeDefined();
            expect(day.precipitation).toBeDefined();
            expect(day.windSpeed).toBeDefined();
            expect(day.pressure).toBeDefined();
            expect(day.cloudCover).toBeDefined();

            // Verify temperature logic
            expect(day.temperature.min).toBeLessThanOrEqual(day.temperature.max);
            expect(day.temperature.min).toBeGreaterThanOrEqual(-50);
            expect(day.temperature.max).toBeLessThanOrEqual(60);

            // Verify other data ranges
            expect(day.humidity).toBeGreaterThanOrEqual(0);
            expect(day.humidity).toBeLessThanOrEqual(100);

            expect(day.precipitation).toBeGreaterThanOrEqual(0);
            expect(day.precipitation).toBeLessThanOrEqual(1000);

            expect(day.windSpeed).toBeGreaterThanOrEqual(0);
            expect(day.windSpeed).toBeLessThanOrEqual(200);

            expect(day.pressure).toBeGreaterThanOrEqual(800);
            expect(day.pressure).toBeLessThanOrEqual(1100);

            expect(day.cloudCover).toBeGreaterThanOrEqual(0);
            expect(day.cloudCover).toBeLessThanOrEqual(100);

            // Verify date format (YYYY-MM-DD)
            expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  test('Property 6: Weather Data Caching - Multiple requests for same coordinates should use cache', async () => {
    // Use fixed coordinates to ensure consistent behavior
    const testLat = 40.7128;
    const testLon = -74.0060;

    // Create a new WeatherService instance to ensure clean cache
    const testWeatherService = new WeatherService();

    const initialCacheSize = testWeatherService.getCacheStats().size;

    // First request should populate cache
    const weather1 = await testWeatherService.getCurrentWeather(testLat, testLon);
    const cacheAfterFirst = testWeatherService.getCacheStats().size;

    // Second request should use cache
    const weather2 = await testWeatherService.getCurrentWeather(testLat, testLon);
    const cacheAfterSecond = testWeatherService.getCacheStats().size;

    // Verify cache behavior
    expect(cacheAfterFirst).toBeGreaterThan(initialCacheSize);
    expect(cacheAfterSecond).toBe(cacheAfterFirst); // No new cache entries

    // Verify data consistency (since we're using mock data, values should be identical)
    expect(weather1.temperature).toBe(weather2.temperature);
    expect(weather1.humidity).toBe(weather2.humidity);
    expect(weather1.precipitation).toBe(weather2.precipitation);
    expect(weather1.windSpeed).toBe(weather2.windSpeed);
    expect(weather1.pressure).toBe(weather2.pressure);
    expect(weather1.cloudCover).toBe(weather2.cloudCover);
  });
});