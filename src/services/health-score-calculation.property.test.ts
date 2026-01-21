import * as fc from 'fast-check';
import { SatelliteService } from './SatelliteService';
import { dbManager } from '../database';

// Feature: agrimonitor-lite, Property 4: Health Score Calculation
// **Validates: Requirements 2.4, 2.5**

describe('Health Score Calculation Property Tests', () => {
  let satelliteService: SatelliteService;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    await dbManager.initialize();
    satelliteService = new SatelliteService();
  });

  afterAll(async () => {
    await dbManager.close();
  });

  test('Property 4: Health Score Calculation - For any set of vegetation indices, the health score should use the weighted formula and produce a result bounded between 0 and 100', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          ndvi: fc.float({ min: -1, max: 1 }),
          ndwi: fc.float({ min: -1, max: 1 }),
          gndvi: fc.float({ min: -1, max: 1 })
        }),
        (indices) => {
          const healthScore = satelliteService.calculateHealthScore(indices);

          // Health score must be between 0 and 100
          expect(healthScore).toBeGreaterThanOrEqual(0);
          expect(healthScore).toBeLessThanOrEqual(100);

          // Verify weighted formula calculation
          const normalizedNDVI = ((indices.ndvi + 1) / 2) * 100;
          const normalizedNDWI = ((indices.ndwi + 1) / 2) * 100;
          const normalizedGNDVI = ((indices.gndvi + 1) / 2) * 100;

          const expectedScore = (normalizedNDVI * 0.4) + (normalizedNDWI * 0.3) + (normalizedGNDVI * 0.3);
          const boundedExpected = Math.max(0, Math.min(100, expectedScore));

          expect(healthScore).toBeCloseTo(boundedExpected, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 4: Vegetation Index Calculations - NDVI, NDWI, GNDVI calculations are correct', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          red: fc.float({ min: 0, max: 1 }),
          green: fc.float({ min: 0, max: 1 }),
          nir: fc.float({ min: 0, max: 1 })
        }),
        (bands) => {
          const ndvi = satelliteService.calculateNDVI(bands.red, bands.nir);
          const ndwi = satelliteService.calculateNDWI(bands.green, bands.nir);
          const gndvi = satelliteService.calculateGNDVI(bands.green, bands.nir);

          // All indices should be between -1 and 1
          expect(ndvi).toBeGreaterThanOrEqual(-1);
          expect(ndvi).toBeLessThanOrEqual(1);
          expect(ndwi).toBeGreaterThanOrEqual(-1);
          expect(ndwi).toBeLessThanOrEqual(1);
          expect(gndvi).toBeGreaterThanOrEqual(-1);
          expect(gndvi).toBeLessThanOrEqual(1);

          // Verify formulas
          if (bands.red + bands.nir > 0) {
            const expectedNDVI = (bands.nir - bands.red) / (bands.nir + bands.red);
            expect(ndvi).toBeCloseTo(expectedNDVI, 5);
          }

          if (bands.green + bands.nir > 0) {
            const expectedNDWI = (bands.green - bands.nir) / (bands.green + bands.nir);
            const expectedGNDVI = (bands.nir - bands.green) / (bands.nir + bands.green);
            expect(ndwi).toBeCloseTo(expectedNDWI, 5);
            expect(gndvi).toBeCloseTo(expectedGNDVI, 5);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});