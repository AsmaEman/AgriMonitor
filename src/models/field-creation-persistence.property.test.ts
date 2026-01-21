import * as fc from 'fast-check';
import { Field } from './Field';
import { DatabaseManager } from '../database/connection';
import { VALIDATION_CONSTRAINTS, CropType, GrowthStage } from './types';

// Feature: agrimonitor-lite, Property 1: Field Creation and Persistence
// **Validates: Requirements 1.1, 1.5**

describe('Field Creation and Persistence Properties', () => {
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';
    // Create a fresh instance for each test
    (DatabaseManager as any).instance = undefined;
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
  });

  afterEach(async () => {
    await dbManager.close();
    // Reset the singleton instance
    (DatabaseManager as any).instance = undefined;
  });

  // Property 1: Field Creation and Persistence
  // For any valid field data (name, crop type, area, geometry), creating a field should result in a 
  // database record that contains all provided information and can be immediately retrieved.
  describe('Property 1: Field Creation and Persistence', () => {

    it('should create and persist field data correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean') as fc.Arbitrary<CropType>,
            area_hectares: fc.float({
              min: Math.fround(VALIDATION_CONSTRAINTS.AREA_MIN),
              max: Math.fround(10000),
              noNaN: true,
              noDefaultInfinity: true
            }),
            // Generate valid GeoJSON polygon coordinates
            coordinates: fc.array(
              fc.array(
                fc.tuple(
                  fc.float({
                    min: Math.fround(VALIDATION_CONSTRAINTS.LONGITUDE_MIN),
                    max: Math.fround(VALIDATION_CONSTRAINTS.LONGITUDE_MAX),
                    noNaN: true,
                    noDefaultInfinity: true
                  }),
                  fc.float({
                    min: Math.fround(VALIDATION_CONSTRAINTS.LATITUDE_MIN),
                    max: Math.fround(VALIDATION_CONSTRAINTS.LATITUDE_MAX),
                    noNaN: true,
                    noDefaultInfinity: true
                  })
                ),
                { minLength: 4, maxLength: 10 }
              ).map(coords => {
                // Ensure polygon is closed (first and last coordinates are the same)
                if (coords.length > 0) {
                  coords[coords.length - 1] = coords[0];
                }
                return coords;
              }),
              { minLength: 1, maxLength: 1 } // Only outer ring for simplicity
            ),
            field_capacity: fc.option(
              fc.float({
                min: Math.fround(VALIDATION_CONSTRAINTS.PERCENTAGE_MIN + 20),
                max: Math.fround(VALIDATION_CONSTRAINTS.PERCENTAGE_MAX),
                noNaN: true,
                noDefaultInfinity: true
              })
            ),
            wilting_point: fc.option(
              fc.float({
                min: Math.fround(VALIDATION_CONSTRAINTS.PERCENTAGE_MIN),
                max: Math.fround(VALIDATION_CONSTRAINTS.PERCENTAGE_MAX - 20),
                noNaN: true,
                noDefaultInfinity: true
              })
            ),
            planting_date: fc.option(
              fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
                .map(d => d.toISOString().split('T')[0])
            ),
            growth_stage: fc.option(
              fc.constantFrom('initial', 'development', 'mid_season', 'late_season') as fc.Arbitrary<GrowthStage>
            )
          }).filter(fieldData => {
            // Ensure wilting_point < field_capacity when both are present
            if (fieldData.field_capacity !== null && fieldData.field_capacity !== undefined &&
              fieldData.wilting_point !== null && fieldData.wilting_point !== undefined) {
              return fieldData.wilting_point < fieldData.field_capacity;
            }
            return true;
          }),
          async (fieldData) => {
            const db = dbManager.getDatabase();

            // Create GeoJSON geometry from generated coordinates
            const geometry = {
              type: 'Polygon' as const,
              coordinates: fieldData.coordinates
            };

            // Create Field instance
            const fieldProps: Partial<Field> = {
              name: fieldData.name,
              crop_type: fieldData.crop_type,
              area_hectares: fieldData.area_hectares,
              geometry: geometry
            };

            if (fieldData.field_capacity !== undefined && fieldData.field_capacity !== null) {
              fieldProps.field_capacity = fieldData.field_capacity;
            }
            if (fieldData.wilting_point !== undefined && fieldData.wilting_point !== null) {
              fieldProps.wilting_point = fieldData.wilting_point;
            }
            if (fieldData.planting_date !== undefined && fieldData.planting_date !== null) {
              fieldProps.planting_date = fieldData.planting_date;
            }
            if (fieldData.growth_stage !== undefined && fieldData.growth_stage !== null) {
              fieldProps.growth_stage = fieldData.growth_stage;
            }

            const field = new Field(fieldProps);

            // Validate the field before persistence
            const validationErrors = await field.validate();
            expect(validationErrors).toHaveLength(0);

            // Convert to database row format and insert
            const dbRow = field.toDatabaseRow();
            const result = await db.run(
              `INSERT INTO fields (name, crop_type, area_hectares, geometry, field_capacity, wilting_point, planting_date, growth_stage) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                dbRow.name,
                dbRow.crop_type,
                dbRow.area_hectares,
                dbRow.geometry,
                dbRow.field_capacity,
                dbRow.wilting_point,
                dbRow.planting_date,
                dbRow.growth_stage
              ]
            );

            // Verify insertion was successful
            expect(result.lastID).toBeDefined();
            expect(result.lastID).toBeGreaterThan(0);

            // Retrieve the stored field from database
            const storedRow = await db.get(
              'SELECT * FROM fields WHERE id = ?',
              [result.lastID]
            );

            expect(storedRow).toBeDefined();

            // Create Field instance from stored data
            const retrievedField = Field.fromDatabaseRow(storedRow);

            // Verify all field data was persisted correctly
            expect(retrievedField.id).toBe(result.lastID);
            expect(retrievedField.name).toBe(fieldData.name);
            expect(retrievedField.crop_type).toBe(fieldData.crop_type);
            expect(retrievedField.area_hectares).toBeCloseTo(fieldData.area_hectares, 5);

            // Verify geometry was persisted correctly
            expect(retrievedField.geometry).toBeDefined();
            expect(retrievedField.geometry.type).toBe('Polygon');
            expect(retrievedField.geometry.coordinates).toEqual(fieldData.coordinates);

            // Verify optional fields
            if (fieldData.field_capacity !== null && fieldData.field_capacity !== undefined) {
              expect(retrievedField.field_capacity).toBeCloseTo(fieldData.field_capacity, 5);
            } else {
              expect(retrievedField.field_capacity).toBeUndefined();
            }

            if (fieldData.wilting_point !== null && fieldData.wilting_point !== undefined) {
              expect(retrievedField.wilting_point).toBeCloseTo(fieldData.wilting_point, 5);
            } else {
              expect(retrievedField.wilting_point).toBeUndefined();
            }

            if (fieldData.planting_date !== null && fieldData.planting_date !== undefined) {
              expect(retrievedField.planting_date).toBe(fieldData.planting_date);
            } else {
              expect(retrievedField.planting_date).toBeUndefined();
            }

            if (fieldData.growth_stage !== null && fieldData.growth_stage !== undefined) {
              expect(retrievedField.growth_stage).toBe(fieldData.growth_stage);
            } else {
              expect(retrievedField.growth_stage).toBe('initial'); // Default value
            }

            // Verify timestamps were set
            expect(retrievedField.created_at).toBeDefined();
            expect(retrievedField.created_at).toBeInstanceOf(Date);

            // Test round-trip consistency: serialize and deserialize
            const serialized = retrievedField.toJSON();
            const deserialized = Field.fromJSON(serialized);

            expect(deserialized.name).toBe(retrievedField.name);
            expect(deserialized.crop_type).toBe(retrievedField.crop_type);
            expect(deserialized.area_hectares).toBe(retrievedField.area_hectares);
            expect(deserialized.geometry).toEqual(retrievedField.geometry);

            // Verify field can be validated after retrieval
            const retrievedValidationErrors = await retrievedField.validate();
            expect(retrievedValidationErrors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle field creation with minimal required data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean') as fc.Arbitrary<CropType>,
            area_hectares: fc.float({
              min: Math.fround(VALIDATION_CONSTRAINTS.AREA_MIN),
              max: Math.fround(1000),
              noNaN: true,
              noDefaultInfinity: true
            })
          }),
          async (fieldData) => {
            const db = dbManager.getDatabase();

            // Create minimal field with only required data
            const geometry = {
              type: 'Polygon' as const,
              coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
            };

            const field = new Field({
              name: fieldData.name,
              crop_type: fieldData.crop_type,
              area_hectares: fieldData.area_hectares,
              geometry: geometry
            });

            // Validate the minimal field
            const validationErrors = await field.validate();
            expect(validationErrors).toHaveLength(0);

            // Insert into database
            const dbRow = field.toDatabaseRow();
            const result = await db.run(
              `INSERT INTO fields (name, crop_type, area_hectares, geometry, growth_stage) 
               VALUES (?, ?, ?, ?, ?)`,
              [
                dbRow.name,
                dbRow.crop_type,
                dbRow.area_hectares,
                dbRow.geometry,
                dbRow.growth_stage || 'initial'
              ]
            );

            expect(result.lastID).toBeDefined();
            expect(result.lastID).toBeGreaterThan(0);

            // Retrieve and verify
            const storedRow = await db.get(
              'SELECT * FROM fields WHERE id = ?',
              [result.lastID]
            );

            const retrievedField = Field.fromDatabaseRow(storedRow);

            expect(retrievedField.name).toBe(fieldData.name);
            expect(retrievedField.crop_type).toBe(fieldData.crop_type);
            expect(retrievedField.area_hectares).toBeCloseTo(fieldData.area_hectares, 5);
            expect(retrievedField.geometry).toEqual(geometry);
            expect(retrievedField.growth_stage).toBe('initial'); // Default value
            expect(retrievedField.created_at).toBeDefined();

            // Optional fields should be undefined
            expect(retrievedField.field_capacity).toBeUndefined();
            expect(retrievedField.wilting_point).toBeUndefined();
            expect(retrievedField.planting_date).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain data integrity across multiple field operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
              crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean') as fc.Arbitrary<CropType>,
              area_hectares: fc.float({
                min: Math.fround(VALIDATION_CONSTRAINTS.AREA_MIN),
                max: Math.fround(100),
                noNaN: true,
                noDefaultInfinity: true
              })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (fieldsData) => {
            const db = dbManager.getDatabase();
            const insertedIds: number[] = [];

            // Create and insert multiple fields
            for (let i = 0; i < fieldsData.length; i++) {
              const fieldData = fieldsData[i];

              const geometry = {
                type: 'Polygon' as const,
                coordinates: [[[i, i], [i + 1, i], [i + 1, i + 1], [i, i + 1], [i, i]]]
              };

              const field = new Field({
                name: `${fieldData.name}_${i}`, // Ensure unique names
                crop_type: fieldData.crop_type,
                area_hectares: fieldData.area_hectares,
                geometry: geometry
              });

              const dbRow = field.toDatabaseRow();
              const result = await db.run(
                `INSERT INTO fields (name, crop_type, area_hectares, geometry, growth_stage) 
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  dbRow.name,
                  dbRow.crop_type,
                  dbRow.area_hectares,
                  dbRow.geometry,
                  'initial'
                ]
              );

              expect(result.lastID).toBeDefined();
              insertedIds.push(result.lastID!);
            }

            // Verify all fields were inserted correctly
            const allFields = await db.all('SELECT * FROM fields ORDER BY id');
            expect(allFields).toHaveLength(fieldsData.length);

            // Verify each field can be retrieved and matches original data
            for (let i = 0; i < fieldsData.length; i++) {
              const fieldData = fieldsData[i];
              const storedField = allFields[i];
              const retrievedField = Field.fromDatabaseRow(storedField);

              expect(retrievedField.id).toBe(insertedIds[i]);
              expect(retrievedField.name).toBe(`${fieldData.name}_${i}`);
              expect(retrievedField.crop_type).toBe(fieldData.crop_type);
              expect(retrievedField.area_hectares).toBeCloseTo(fieldData.area_hectares, 5);
              expect(retrievedField.created_at).toBeDefined();

              // Verify field validation still passes
              const validationErrors = await retrievedField.validate();
              expect(validationErrors).toHaveLength(0);
            }

            // Test field count consistency
            const fieldCount = await db.get('SELECT COUNT(*) as count FROM fields');
            expect(fieldCount.count).toBe(fieldsData.length);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});