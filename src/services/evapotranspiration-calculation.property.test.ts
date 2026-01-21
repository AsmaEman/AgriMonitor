import { EvapotranspirationService, WeatherDataForET } from './EvapotranspirationService';

// Feature: agrimonitor-lite, Property 7: Evapotranspiration Calculation
// **Validates: Requirements 3.3**

describe('Evapotranspiration Calculation Property Tests', () => {
  let etService: EvapotranspirationService;

  beforeAll(() => {
    etService = new EvapotranspirationService();
  });

  test('Property 7: ET₀ Calculation - Should produce valid results for reasonable weather conditions', () => {
    // Use fixed reasonable weather conditions to avoid edge cases
    const testCases = [
      { temperatureMax: 25, temperatureMin: 15, humidity: 60, windSpeed: 2 },
      { temperatureMax: 30, temperatureMin: 20, humidity: 50, windSpeed: 3 },
      { temperatureMax: 35, temperatureMin: 25, humidity: 40, windSpeed: 4 },
      { temperatureMax: 20, temperatureMin: 10, humidity: 70, windSpeed: 1 },
      { temperatureMax: 28, temperatureMin: 18, humidity: 55, windSpeed: 2.5 }
    ];

    testCases.forEach((weatherData) => {
      const result = etService.calculateET0(weatherData, 40, 150);

      // Verify result structure
      expect(result.et0).toBeDefined();
      expect(result.method).toBeDefined();
      expect(result.dataQuality).toBeDefined();

      // Verify ET₀ is non-negative and within reasonable bounds
      expect(result.et0).toBeGreaterThanOrEqual(0);
      expect(result.et0).toBeLessThanOrEqual(15); // Reasonable upper bound

      // Verify method is one of expected values
      expect(['FAO Penman-Monteith', 'Hargreaves (simplified)']).toContain(result.method);

      // Verify data quality is valid
      expect(['high', 'medium', 'low']).toContain(result.dataQuality);

      // For reasonable conditions, ET₀ should be positive
      expect(result.et0).toBeGreaterThan(0);
    });
  });

  test('Property 7: ET₀ Calculation - Results should be consistent for identical inputs', () => {
    const weatherData: WeatherDataForET = {
      temperatureMax: 25,
      temperatureMin: 15,
      humidity: 60,
      windSpeed: 2
    };

    // Calculate ET₀ multiple times with identical inputs
    const results = Array.from({ length: 5 }, () =>
      etService.calculateET0(weatherData, 40, 150)
    );

    // All results should be identical
    const firstResult = results[0];
    results.forEach(result => {
      expect(result.et0).toBe(firstResult.et0);
      expect(result.method).toBe(firstResult.method);
      expect(result.dataQuality).toBe(firstResult.dataQuality);
    });
  });

  test('Property 7: ET₀ Calculation - Higher temperatures should generally produce higher ET₀', () => {
    const baseWeatherData: WeatherDataForET = {
      temperatureMax: 20,
      temperatureMin: 10,
      humidity: 60,
      windSpeed: 2
    };

    const hotWeatherData: WeatherDataForET = {
      temperatureMax: 35,
      temperatureMin: 25,
      humidity: 60,
      windSpeed: 2
    };

    const resultLow = etService.calculateET0(baseWeatherData, 40, 150);
    const resultHigh = etService.calculateET0(hotWeatherData, 40, 150);

    // Higher temperature should produce higher ET₀
    expect(resultHigh.et0).toBeGreaterThan(resultLow.et0);
  });

  test('Property 7: Crop Evapotranspiration - ETc should be proportional to ET₀ and crop coefficient', () => {
    const testCases = [
      { et0: 5, cropCoefficient: 1.0 },
      { et0: 3, cropCoefficient: 0.8 },
      { et0: 7, cropCoefficient: 1.2 },
      { et0: 4.5, cropCoefficient: 0.6 }
    ];

    testCases.forEach(({ et0, cropCoefficient }) => {
      const etc = etService.calculateETc(et0, cropCoefficient);

      // ETc should be proportional to ET₀ and Kc
      const expectedETc = et0 * cropCoefficient;
      expect(etc).toBeCloseTo(expectedETc, 10);

      // ETc should be non-negative
      expect(etc).toBeGreaterThanOrEqual(0);

      // ETc should scale with crop coefficient
      if (cropCoefficient > 1) {
        expect(etc).toBeGreaterThan(et0);
      } else if (cropCoefficient < 1) {
        expect(etc).toBeLessThan(et0);
      } else {
        expect(etc).toBe(et0);
      }
    });
  });

  test('Property 7: Crop Coefficients - Should return valid coefficients for supported crops', () => {
    const supportedCrops = ['wheat', 'rice', 'maize', 'cotton', 'soybean'];
    const growthStages = ['initial', 'development', 'mid_season', 'late_season'];

    supportedCrops.forEach(crop => {
      growthStages.forEach(stage => {
        const kc = etService.getCropCoefficients(crop, stage);

        // Crop coefficient should be positive and reasonable
        expect(kc).toBeGreaterThan(0);
        expect(kc).toBeLessThanOrEqual(2.0); // Upper bound for most crops

        // Verify specific ranges for known crops
        if (crop === 'rice') {
          expect(kc).toBeGreaterThanOrEqual(0.9); // Rice has high water requirements
        } else {
          expect(kc).toBeGreaterThanOrEqual(0.3); // Minimum for other crops
        }
      });
    });

    // Test unsupported crop returns default
    const defaultKc = etService.getCropCoefficients('unknown_crop', 'initial');
    expect(defaultKc).toBe(1.0);
  });

  test('Property 7: Error Handling - Invalid inputs should be handled gracefully', () => {
    // Test invalid temperature data
    expect(() => {
      etService.validateWeatherDataStrict({
        temperatureMax: 10,
        temperatureMin: 20, // Min > Max
        humidity: 50
      });
    }).toThrow();

    // Test missing required data
    expect(() => {
      etService.validateWeatherDataStrict({
        temperatureMax: 25,
        temperatureMin: 15
        // Missing humidity
      } as WeatherDataForET);
    }).toThrow();

    // Test invalid humidity
    expect(() => {
      etService.validateWeatherDataStrict({
        temperatureMax: 25,
        temperatureMin: 15,
        humidity: 150 // > 100%
      });
    }).toThrow();

    // Test negative ETc inputs
    expect(() => {
      etService.calculateETc(-1, 1.0);
    }).toThrow();

    expect(() => {
      etService.calculateETc(5, -0.5);
    }).toThrow();

    // Test NaN inputs
    expect(() => {
      etService.calculateETc(NaN, 1.0);
    }).toThrow();

    expect(() => {
      etService.calculateETc(5, NaN);
    }).toThrow();
  });
});