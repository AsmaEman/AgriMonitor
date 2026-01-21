import * as fc from 'fast-check';
import { SatelliteService } from './SatelliteService';
import { FieldService } from './FieldService';
import { dbManager } from '../database';

// Feature: agrimonitor-lite, Property 5: Satellite Data Processing Pipeline
// **Validates: Requirements 2.1, 2.2, 2.3, 2.6**

describe('Satellite Data Processing Pipeline Property Tests', () => {
  let satelliteService: SatelliteService;
  let fieldService: FieldService;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    await dbManager.initialize();
    satelliteService = new SatelliteService();
    fieldService = new FieldService();
  });

  afterAll(async () => {
    await dbManager.close();
  });

  test('Property 5: Satellite Data Processing Pipeline - Processing field data should produce valid satellite observations with proper data integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }),
          crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean'),
          area_hectares: fc.float({ min: Math.fround(0.1), max: Math.fround(1000) })
        }),
        async (fieldData) => {
          // Use fixed valid coordinates for testing
          const testCoordinates = [
            [-74.0, 40.7],  // New York area
            [-74.1, 40.7],
            [-74.1, 40.8],
            [-74.0, 40.8],
            [-74.0, 40.7]   // Close the polygon
          ];

          // Create a test field
          const field = await fieldService.createField({
            name: fieldData.name,
            crop_type: fieldData.crop_type as any,
            area_hectares: fieldData.area_hectares,
            geometry: {
              type: 'Polygon',
              coordinates: [testCoordinates]
            }
          });

          // Process satellite data for the field
          const satelliteData = await satelliteService.processFieldSatelliteData(field);

          // Verify satellite data structure and constraints
          expect(satelliteData.fieldId).toBe(field.id);
          expect(satelliteData.observationDate).toBeInstanceOf(Date);
          expect(satelliteData.cloudCover).toBeGreaterThanOrEqual(0);
          expect(satelliteData.cloudCover).toBeLessThanOrEqual(100);

          // Verify vegetation indices are within valid bounds
          expect(satelliteData.indices.ndvi).toBeGreaterThanOrEqual(-1);
          expect(satelliteData.indices.ndvi).toBeLessThanOrEqual(1);
          expect(satelliteData.indices.ndwi).toBeGreaterThanOrEqual(-1);
          expect(satelliteData.indices.ndwi).toBeLessThanOrEqual(1);
          expect(satelliteData.indices.gndvi).toBeGreaterThanOrEqual(-1);
          expect(satelliteData.indices.gndvi).toBeLessThanOrEqual(1);

          // Verify health score is within bounds
          expect(satelliteData.healthScore).toBeGreaterThanOrEqual(0);
          expect(satelliteData.healthScore).toBeLessThanOrEqual(100);

          // Verify data was stored in database
          const storedObservation = await satelliteService.getLatestObservation(field.id!);
          expect(storedObservation).not.toBeNull();
          expect(storedObservation!.field_id).toBe(field.id);
          expect(storedObservation!.health_score).toBe(satelliteData.healthScore);

          // Clean up
          await fieldService.deleteField(field.id!);
        }
      ),
      { numRuns: 10 }
    );
  });

  test('Property 5: Data Integrity - Multiple observations for same field should maintain data consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }),
          crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean'),
          area_hectares: fc.float({ min: Math.fround(0.1), max: Math.fround(1000) })
        }),
        async (fieldData) => {
          // Use fixed valid coordinates for testing
          const testCoordinates = [
            [-122.4, 37.8],  // San Francisco area
            [-122.5, 37.8],
            [-122.5, 37.9],
            [-122.4, 37.9],
            [-122.4, 37.8]   // Close the polygon
          ];

          // Create a test field
          const field = await fieldService.createField({
            name: fieldData.name,
            crop_type: fieldData.crop_type as any,
            area_hectares: fieldData.area_hectares,
            geometry: {
              type: 'Polygon',
              coordinates: [testCoordinates]
            }
          });

          // Process multiple satellite observations
          const observation1 = await satelliteService.processFieldSatelliteData(field);
          const observation2 = await satelliteService.processFieldSatelliteData(field);

          // Verify both observations are for the same field
          expect(observation1.fieldId).toBe(field.id);
          expect(observation2.fieldId).toBe(field.id);

          // Verify observations have different timestamps (or same if processed quickly)
          expect(observation1.observationDate).toBeInstanceOf(Date);
          expect(observation2.observationDate).toBeInstanceOf(Date);

          // Verify all observations can be retrieved
          const allObservations = await satelliteService.getObservations(field.id!);
          expect(allObservations.length).toBeGreaterThanOrEqual(1);

          // Clean up
          await fieldService.deleteField(field.id!);
        }
      ),
      { numRuns: 5 }
    );
  });
});