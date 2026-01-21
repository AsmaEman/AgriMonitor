import * as fc from 'fast-check';
import { FieldService } from './FieldService';
import { dbManager } from '../database';
import { CropType } from '../models/types';

// Feature: agrimonitor-lite, Property 2: GeoJSON Parsing Consistency
// **Validates: Requirements 1.2**

describe('GeoJSON Parsing Consistency Property Tests', () => {
  let fieldService: FieldService;

  beforeAll(async () => {
    // Initialize in-memory database for testing
    process.env.DATABASE_PATH = ':memory:';
    await dbManager.initialize();
    fieldService = new FieldService();
  });

  afterAll(async () => {
    await dbManager.close();
  });

  beforeEach(async () => {
    // Clean up fields table before each test
    const db = dbManager.getDatabase();
    await db.run('DELETE FROM fields');
  });

  // Simple generator for valid coordinates within reasonable bounds
  const reasonableCoordinateArbitrary = fc.tuple(
    fc.integer({ min: -179, max: 179 }), // longitude as integer to avoid float issues
    fc.integer({ min: -89, max: 89 })    // latitude as integer to avoid float issues
  );

  // Generator for simple valid polygons (rectangles)
  const simplePolygonArbitrary = reasonableCoordinateArbitrary.map(([baseLon, baseLat]) => {
    return [
      [baseLon, baseLat],
      [baseLon + 1, baseLat],
      [baseLon + 1, baseLat + 1],
      [baseLon, baseLat + 1],
      [baseLon, baseLat] // Close the polygon
    ];
  });

  // Generator for simple field data
  const simpleFieldDataArbitrary = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
    crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean') as fc.Arbitrary<CropType>,
    area_hectares: fc.integer({ min: 1, max: 1000 }), // Use integers to avoid float precision issues
    geometry: fc.record({
      type: fc.constant('Polygon'),
      coordinates: fc.array(simplePolygonArbitrary, { minLength: 1, maxLength: 1 })
    })
  });

  test('Property 2: GeoJSON Parsing Consistency - For any valid GeoJSON polygon, parsing and storing the geometry should result in boundary data that accurately represents the original coordinates', async () => {
    await fc.assert(
      fc.asyncProperty(simpleFieldDataArbitrary, async (fieldData) => {
        // Create field with the generated GeoJSON geometry
        const createdField = await fieldService.createField(fieldData);

        // Verify the field was created successfully
        expect(createdField).toBeDefined();
        expect(createdField.id).toBeDefined();

        // Retrieve the field from database
        const retrievedField = await fieldService.getFieldById(createdField.id!);
        expect(retrievedField).toBeDefined();

        // Verify geometry consistency
        expect(retrievedField!.geometry.type).toBe('Polygon');
        expect(retrievedField!.geometry.coordinates).toHaveLength(fieldData.geometry.coordinates.length);

        // Verify coordinate precision is maintained for each ring
        for (let ringIndex = 0; ringIndex < fieldData.geometry.coordinates.length; ringIndex++) {
          const originalRing = fieldData.geometry.coordinates[ringIndex];
          const retrievedRing = retrievedField!.geometry.coordinates[ringIndex];

          expect(retrievedRing).toHaveLength(originalRing.length);

          for (let coordIndex = 0; coordIndex < originalRing.length; coordIndex++) {
            const [origLon, origLat] = originalRing[coordIndex];
            const [retrLon, retrLat] = retrievedRing[coordIndex];

            // Coordinates should be exactly equal for integers
            expect(retrLon).toBe(origLon);
            expect(retrLat).toBe(origLat);
          }
        }

        // Verify that the geometry can be used to get center point
        const centerPoint = retrievedField!.getCenterPoint();
        expect(centerPoint).toBeDefined();
        expect(centerPoint).toHaveLength(2);
        expect(typeof centerPoint![0]).toBe('number');
        expect(typeof centerPoint![1]).toBe('number');

        // Verify center point is within reasonable bounds
        expect(centerPoint![0]).toBeGreaterThanOrEqual(-180);
        expect(centerPoint![0]).toBeLessThanOrEqual(180);
        expect(centerPoint![1]).toBeGreaterThanOrEqual(-90);
        expect(centerPoint![1]).toBeLessThanOrEqual(90);
      }),
      { numRuns: 50, timeout: 30000 }
    );
  });

  test('Property 2 Validation: GeoJSON validation correctly identifies valid simple geometries', async () => {
    // Test with known valid geometries
    const validGeometries = [
      {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      },
      {
        type: 'Polygon',
        coordinates: [[[-10, -10], [-9, -10], [-9, -9], [-10, -9], [-10, -10]]]
      },
      {
        type: 'Polygon',
        coordinates: [[[100, 50], [101, 50], [101, 51], [100, 51], [100, 50]]]
      }
    ];

    for (const geometry of validGeometries) {
      expect(fieldService.validateGeoJSONGeometry(geometry)).toBe(true);
    }
  });

  test('Property 2 Validation: GeoJSON validation correctly identifies invalid geometries', async () => {
    // Test various invalid GeoJSON structures
    const invalidGeometries = [
      null,
      undefined,
      {},
      { type: 'Point' },
      { type: 'Polygon' },
      { type: 'Polygon', coordinates: [] },
      { type: 'Polygon', coordinates: [[]] },
      { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }, // Not enough points
      { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0]]] }, // Not closed
      { type: 'Polygon', coordinates: [[[200, 0], [1, 1], [1, 0], [200, 0]]] }, // Invalid longitude
      { type: 'Polygon', coordinates: [[[0, 100], [1, 1], [1, 0], [0, 100]]] }, // Invalid latitude
    ];

    for (const invalidGeometry of invalidGeometries) {
      expect(fieldService.validateGeoJSONGeometry(invalidGeometry)).toBe(false);
    }
  });
});