import * as fc from 'fast-check';
import { FieldService } from './FieldService';
import { dbManager } from '../database';

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

  // Generator for valid GeoJSON polygon coordinates
  const validCoordinateArbitrary = fc.tuple(
    fc.float({ min: -180, max: 180 }), // longitude
    fc.float({ min: -90, max: 90 })    // latitude
  );

  // Generator for valid polygon rings (closed rings with at least 4 points)
  const validPolygonRingArbitrary = fc.array(validCoordinateArbitrary, { minLength: 4, maxLength: 10 })
    .map(coords => {
      // Ensure the ring is closed by making the last coordinate equal to the first
      const closedCoords = [...coords];
      closedCoords[closedCoords.length - 1] = coords[0];
      return closedCoords;
    });

  // Generator for valid GeoJSON polygon geometry
  const validGeoJSONPolygonArbitrary = fc.record({
    type: fc.constant('Polygon'),
    coordinates: fc.array(validPolygonRingArbitrary, { minLength: 1, maxLength: 3 })
  });

  // Generator for complete field data with valid GeoJSON
  const validFieldDataArbitrary = fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean'),
    area_hectares: fc.float({ min: 0.1, max: 10000 }),
    geometry: validGeoJSONPolygonArbitrary,
    field_capacity: fc.option(fc.float({ min: 0, max: 100 }), { nil: undefined }),
    wilting_point: fc.option(fc.float({ min: 0, max: 50 }), { nil: undefined }),
    planting_date: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString().split('T')[0]), { nil: undefined }),
    growth_stage: fc.option(fc.constantFrom('initial', 'development', 'mid_season', 'late_season'), { nil: undefined })
  }).filter(data => {
    // Ensure wilting_point < field_capacity when both are present
    if (data.field_capacity !== undefined && data.wilting_point !== undefined) {
      return data.wilting_point < data.field_capacity;
    }
    return true;
  });

  test('Property 2: GeoJSON Parsing Consistency - For any valid GeoJSON polygon, parsing and storing the geometry should result in boundary data that accurately represents the original coordinates', async () => {
    await fc.assert(
      fc.asyncProperty(validFieldDataArbitrary, async (fieldData) => {
        // Create field with the generated GeoJSON geometry
        const createdField = await fieldService.createField(fieldData);

        // Verify the field was created successfully
        expect(createdField).toBeDefined();
        expect(createdField.id).toBeDefined();

        // Retrieve the field from database
        const retrievedField = await fieldService.getFieldById(createdField.id!);
        expect(retrievedField).toBeDefined();

        // Verify geometry consistency
        expect(retrievedField!.geometry).toEqual(fieldData.geometry);
        expect(retrievedField!.geometry.type).toBe('Polygon');
        expect(retrievedField!.geometry.coordinates).toEqual(fieldData.geometry.coordinates);

        // Verify coordinate precision is maintained
        const originalCoords = fieldData.geometry.coordinates;
        const retrievedCoords = retrievedField!.geometry.coordinates;

        expect(retrievedCoords).toHaveLength(originalCoords.length);

        for (let ringIndex = 0; ringIndex < originalCoords.length; ringIndex++) {
          const originalRing = originalCoords[ringIndex];
          const retrievedRing = retrievedCoords[ringIndex];

          expect(retrievedRing).toHaveLength(originalRing.length);

          for (let coordIndex = 0; coordIndex < originalRing.length; coordIndex++) {
            const [origLon, origLat] = originalRing[coordIndex];
            const [retrLon, retrLat] = retrievedRing[coordIndex];

            // Allow for small floating point precision differences
            expect(Math.abs(retrLon - origLon)).toBeLessThan(0.000001);
            expect(Math.abs(retrLat - origLat)).toBeLessThan(0.000001);
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
      { numRuns: 100, timeout: 30000 }
    );
  });

  test('Property 2 Edge Case: GeoJSON parsing handles complex polygons with multiple rings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean'),
          area_hectares: fc.float({ min: 1, max: 100 }),
          geometry: fc.record({
            type: fc.constant('Polygon'),
            coordinates: fc.array(validPolygonRingArbitrary, { minLength: 2, maxLength: 3 }) // Multiple rings
          })
        }),
        async (fieldData) => {
          const createdField = await fieldService.createField(fieldData);
          const retrievedField = await fieldService.getFieldById(createdField.id!);

          // Verify all rings are preserved
          expect(retrievedField!.geometry.coordinates).toHaveLength(fieldData.geometry.coordinates.length);

          // Verify each ring maintains its structure
          for (let i = 0; i < fieldData.geometry.coordinates.length; i++) {
            const originalRing = fieldData.geometry.coordinates[i];
            const retrievedRing = retrievedField!.geometry.coordinates[i];

            expect(retrievedRing).toHaveLength(originalRing.length);

            // Verify ring closure (first and last coordinates should be equal)
            const firstCoord = retrievedRing[0];
            const lastCoord = retrievedRing[retrievedRing.length - 1];
            expect(firstCoord[0]).toBeCloseTo(lastCoord[0], 6);
            expect(firstCoord[1]).toBeCloseTo(lastCoord[1], 6);
          }
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
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

  test('Property 2 Validation: GeoJSON validation correctly identifies valid geometries', async () => {
    await fc.assert(
      fc.property(validGeoJSONPolygonArbitrary, (geometry) => {
        expect(fieldService.validateGeoJSONGeometry(geometry)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});