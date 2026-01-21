import * as fc from 'fast-check';
import { FieldService } from './FieldService';
import { Field } from '../models/Field';
import { dbManager } from '../database';
import { CropType, GeoJSONPolygon } from '../models/types';

// Feature: agrimonitor-lite, Property 3: Coordinate Validation Boundaries
// **Validates: Requirements 1.3**

describe('Coordinate Validation Property Tests', () => {
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

  // Generator for valid coordinates within geographic bounds
  const validCoordinateArbitrary = fc.tuple(
    fc.float({ min: Math.fround(-180), max: Math.fround(180) }), // longitude
    fc.float({ min: Math.fround(-90), max: Math.fround(90) })    // latitude
  );

  // Generator for invalid coordinates outside geographic bounds
  const invalidCoordinateArbitrary = fc.oneof(
    // Invalid longitude (outside -180 to 180)
    fc.tuple(
      fc.oneof(
        fc.float({ min: Math.fround(-1000), max: Math.fround(-180.1) }),
        fc.float({ min: Math.fround(180.1), max: Math.fround(1000) })
      ),
      fc.float({ min: Math.fround(-90), max: Math.fround(90) })
    ),
    // Invalid latitude (outside -90 to 90)
    fc.tuple(
      fc.float({ min: Math.fround(-180), max: Math.fround(180) }),
      fc.oneof(
        fc.float({ min: Math.fround(-1000), max: Math.fround(-90.1) }),
        fc.float({ min: Math.fround(90.1), max: Math.fround(1000) })
      )
    ),
    // Both invalid
    fc.tuple(
      fc.oneof(
        fc.float({ min: Math.fround(-1000), max: Math.fround(-180.1) }),
        fc.float({ min: Math.fround(180.1), max: Math.fround(1000) })
      ),
      fc.oneof(
        fc.float({ min: Math.fround(-1000), max: Math.fround(-90.1) }),
        fc.float({ min: Math.fround(90.1), max: Math.fround(1000) })
      )
    )
  );

  // Generator for valid polygon with valid coordinates
  const validPolygonArbitrary = fc.array(validCoordinateArbitrary, { minLength: 4, maxLength: 8 })
    .map(coords => {
      // Ensure polygon is closed and has distinct points
      const distinctCoords = coords.filter((coord, index, arr) =>
        index === 0 || (coord[0] !== arr[index - 1][0] || coord[1] !== arr[index - 1][1])
      );

      // Ensure we have at least 3 distinct points
      if (distinctCoords.length < 3) {
        distinctCoords.push([distinctCoords[0][0] + 0.1, distinctCoords[0][1]]);
        distinctCoords.push([distinctCoords[0][0], distinctCoords[0][1] + 0.1]);
      }

      // Close the polygon
      distinctCoords.push(distinctCoords[0]);
      return distinctCoords;
    });

  // Generator for polygon with invalid coordinates
  const invalidPolygonArbitrary = fc.array(
    fc.oneof(validCoordinateArbitrary, invalidCoordinateArbitrary),
    { minLength: 4, maxLength: 8 }
  )
    .filter(coords => coords.some(coord => {
      const [lon, lat] = coord;
      return lon < -180 || lon > 180 || lat < -90 || lat > 90;
    }))
    .map(coords => {
      // Close the polygon
      const closedCoords = [...coords];
      closedCoords.push(coords[0]);
      return closedCoords;
    });

  test('Property 3: Coordinate Validation Boundaries - For any coordinate pair, validation should accept coordinates within valid geographic ranges and reject coordinates outside these ranges', async () => {
    // Test valid coordinates are accepted
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean') as fc.Arbitrary<CropType>,
          area_hectares: fc.float({ min: Math.fround(0.1), max: Math.fround(1000) }),
          geometry: fc.record({
            type: fc.constant('Polygon'),
            coordinates: fc.array(validPolygonArbitrary, { minLength: 1, maxLength: 1 })
          })
        }),
        async (fieldData) => {
          // Valid coordinates should be accepted
          const field = new Field();
          field.name = fieldData.name;
          field.crop_type = fieldData.crop_type;
          field.area_hectares = fieldData.area_hectares;
          field.geometry = fieldData.geometry as GeoJSONPolygon;

          const validationErrors = await field.validate();

          // Filter out non-coordinate related errors
          const coordinateErrors = validationErrors.filter(error =>
            error.property === 'geometry' &&
            (error.constraints?.longitudeRange || error.constraints?.latitudeRange)
          );

          // Should have no coordinate validation errors for valid coordinates
          expect(coordinateErrors).toHaveLength(0);

          // Verify coordinates are within bounds
          for (const ring of fieldData.geometry.coordinates) {
            for (const coord of ring) {
              const [longitude, latitude] = coord;
              expect(longitude).toBeGreaterThanOrEqual(-180);
              expect(longitude).toBeLessThanOrEqual(180);
              expect(latitude).toBeGreaterThanOrEqual(-90);
              expect(latitude).toBeLessThanOrEqual(90);
            }
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });

  test('Property 3: Invalid coordinates are rejected', async () => {
    // Test invalid coordinates are rejected
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean') as fc.Arbitrary<CropType>,
          area_hectares: fc.float({ min: Math.fround(0.1), max: Math.fround(1000) }),
          geometry: fc.record({
            type: fc.constant('Polygon'),
            coordinates: fc.array(invalidPolygonArbitrary, { minLength: 1, maxLength: 1 })
          })
        }),
        async (fieldData) => {
          // Invalid coordinates should be rejected
          const field = new Field();
          field.name = fieldData.name;
          field.crop_type = fieldData.crop_type;
          field.area_hectares = fieldData.area_hectares;
          field.geometry = fieldData.geometry as GeoJSONPolygon;

          const validationErrors = await field.validate();

          // Should have coordinate validation errors for invalid coordinates
          const coordinateErrors = validationErrors.filter(error =>
            error.property === 'geometry' &&
            (error.constraints?.longitudeRange || error.constraints?.latitudeRange)
          );

          expect(coordinateErrors.length).toBeGreaterThan(0);

          // Verify at least one coordinate is out of bounds
          let hasInvalidCoordinate = false;
          for (const ring of fieldData.geometry.coordinates) {
            for (const coord of ring) {
              const [longitude, latitude] = coord;
              if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
                hasInvalidCoordinate = true;
                break;
              }
            }
            if (hasInvalidCoordinate) break;
          }

          expect(hasInvalidCoordinate).toBe(true);
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  });

  test('Property 3: Boundary values are handled correctly', async () => {
    // Test exact boundary values
    const boundaryCoordinates = [
      [-180, -90], // Southwest corner
      [-180, 90],  // Northwest corner
      [180, -90],  // Southeast corner
      [180, 90],   // Northeast corner
      [0, 0],      // Origin
      [-180, 0],   // West boundary
      [180, 0],    // East boundary
      [0, -90],    // South boundary
      [0, 90]      // North boundary
    ];

    for (const [lon, lat] of boundaryCoordinates) {
      const geometry: GeoJSONPolygon = {
        type: 'Polygon',
        coordinates: [[
          [lon, lat],
          [lon + (lon < 180 ? 0.1 : -0.1), lat],
          [lon + (lon < 180 ? 0.1 : -0.1), lat + (lat < 90 ? 0.1 : -0.1)],
          [lon, lat + (lat < 90 ? 0.1 : -0.1)],
          [lon, lat] // Close the polygon
        ]]
      };

      const field = new Field();
      field.name = `Boundary Test ${lon},${lat}`;
      field.crop_type = 'wheat';
      field.area_hectares = 1.0;
      field.geometry = geometry;

      const validationErrors = await field.validate();
      const coordinateErrors = validationErrors.filter(error =>
        error.property === 'geometry' &&
        (error.constraints?.longitudeRange || error.constraints?.latitudeRange)
      );

      // Boundary values should be valid
      expect(coordinateErrors).toHaveLength(0);
    }
  });

  test('Property 3: Just outside boundary values are rejected', async () => {
    // Test values just outside boundaries
    const invalidBoundaryCoordinates = [
      [-180.1, 0],   // Just west of valid longitude
      [180.1, 0],    // Just east of valid longitude
      [0, -90.1],    // Just south of valid latitude
      [0, 90.1],     // Just north of valid latitude
      [-180.1, -90.1], // Southwest invalid
      [180.1, 90.1]    // Northeast invalid
    ];

    for (const [lon, lat] of invalidBoundaryCoordinates) {
      const geometry: GeoJSONPolygon = {
        type: 'Polygon',
        coordinates: [[
          [lon, lat],
          [0, 0],
          [1, 0],
          [1, 1],
          [lon, lat] // Close the polygon
        ]]
      };

      const field = new Field();
      field.name = `Invalid Boundary Test ${lon},${lat}`;
      field.crop_type = 'wheat';
      field.area_hectares = 1.0;
      field.geometry = geometry;

      const validationErrors = await field.validate();
      const coordinateErrors = validationErrors.filter(error =>
        error.property === 'geometry' &&
        (error.constraints?.longitudeRange || error.constraints?.latitudeRange)
      );

      // Should have coordinate validation errors
      expect(coordinateErrors.length).toBeGreaterThan(0);
    }
  });

  test('Property 3: FieldService validateGeoJSONGeometry method works correctly', async () => {
    // Test the service method directly
    await fc.assert(
      fc.property(
        fc.oneof(
          // Valid geometry
          fc.record({
            type: fc.constant('Polygon'),
            coordinates: fc.array(validPolygonArbitrary, { minLength: 1, maxLength: 1 })
          }),
          // Invalid geometry with out-of-bounds coordinates
          fc.record({
            type: fc.constant('Polygon'),
            coordinates: fc.array(invalidPolygonArbitrary, { minLength: 1, maxLength: 1 })
          })
        ),
        (geometry) => {
          const isValid = fieldService.validateGeoJSONGeometry(geometry);

          // Check if geometry actually has valid coordinates
          let hasValidCoordinates = true;
          try {
            for (const ring of geometry.coordinates) {
              for (const coord of ring) {
                const [longitude, latitude] = coord;
                if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
                  hasValidCoordinates = false;
                  break;
                }
              }
              if (!hasValidCoordinates) break;
            }
          } catch (error) {
            hasValidCoordinates = false;
          }

          // Validation result should match coordinate validity
          expect(isValid).toBe(hasValidCoordinates);
        }
      ),
      { numRuns: 100 }
    );
  });
});