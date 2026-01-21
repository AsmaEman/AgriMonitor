import * as fc from 'fast-check';
import { DatabaseManager } from './connection';

// Feature: agrimonitor-lite, Property 13: Database Integrity
// **Validates: Requirements 7.1, 7.2, 7.3**

describe('Database Integrity Properties', () => {
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

  // Property 13: Database Integrity
  // For any data storage operation, the system should maintain proper schema compliance,
  // prevent duplicates for satellite observations (same field and date), and enforce
  // referential integrity between related records.
  describe('Property 13: Database Integrity', () => {

    it('should maintain schema compliance for field records', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }),
            crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean'),
            area_hectares: fc.float({ min: Math.fround(0.1), max: Math.fround(10000) }),
            geometry: fc.constant('{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}'),
            field_capacity: fc.option(fc.float({ min: Math.fround(20), max: Math.fround(80) })),
            wilting_point: fc.option(fc.float({ min: Math.fround(5), max: Math.fround(40) }))
          }).filter(field =>
            !field.field_capacity || !field.wilting_point ||
            field.wilting_point < field.field_capacity
          ),
          async (fieldData) => {
            const db = dbManager.getDatabase();

            // Insert field data
            const result = await db.run(
              `INSERT INTO fields (name, crop_type, area_hectares, geometry, field_capacity, wilting_point) 
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                fieldData.name,
                fieldData.crop_type,
                fieldData.area_hectares,
                fieldData.geometry,
                fieldData.field_capacity || null,
                fieldData.wilting_point || null
              ]
            );

            // Verify the record was inserted
            expect(result.lastID).toBeDefined();
            expect(result.lastID).toBeGreaterThan(0);

            // Retrieve and verify the stored data
            const storedField = await db.get(
              'SELECT * FROM fields WHERE id = ?',
              [result.lastID]
            );

            expect(storedField).toBeDefined();
            expect(storedField.name).toBe(fieldData.name);
            expect(storedField.crop_type).toBe(fieldData.crop_type);
            expect(storedField.area_hectares).toBeCloseTo(fieldData.area_hectares, 2);
            expect(storedField.geometry).toBe(fieldData.geometry);

            if (fieldData.field_capacity) {
              expect(storedField.field_capacity).toBeCloseTo(fieldData.field_capacity, 2);
            }
            if (fieldData.wilting_point) {
              expect(storedField.wilting_point).toBeCloseTo(fieldData.wilting_point, 2);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should prevent duplicate satellite observations for same field and date', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            observation_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
            ndvi: fc.float({ min: Math.fround(-1), max: Math.fround(1) }),
            ndwi: fc.float({ min: Math.fround(-1), max: Math.fround(1) }),
            gndvi: fc.float({ min: Math.fround(-1), max: Math.fround(1) }),
            health_score: fc.float({ min: Math.fround(0), max: Math.fround(100) }),
            cloud_cover: fc.float({ min: Math.fround(0), max: Math.fround(100) })
          }),
          async (obsData) => {
            const db = dbManager.getDatabase();

            // Create a unique test field for this test
            const fieldResult = await db.run(
              'INSERT INTO fields (name, crop_type, area_hectares, geometry) VALUES (?, ?, ?, ?)',
              [`Test Field ${Date.now()}`, 'wheat', 10.5, '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}']
            );

            const fieldId = fieldResult.lastID!;
            const dateStr = obsData.observation_date.toISOString().split('T')[0];

            // Insert first observation
            const result1 = await db.run(
              `INSERT INTO satellite_observations 
               (field_id, observation_date, ndvi, ndwi, gndvi, health_score, cloud_cover) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                fieldId,
                dateStr,
                obsData.ndvi,
                obsData.ndwi,
                obsData.gndvi,
                obsData.health_score,
                obsData.cloud_cover
              ]
            );

            expect(result1.lastID).toBeDefined();

            // Attempt to insert duplicate observation (same field_id and date)
            let duplicateInsertFailed = false;
            try {
              await db.run(
                `INSERT INTO satellite_observations 
                 (field_id, observation_date, ndvi, ndwi, gndvi, health_score, cloud_cover) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  fieldId,
                  dateStr,
                  obsData.ndvi + 0.1, // Different values
                  obsData.ndwi + 0.1,
                  obsData.gndvi + 0.1,
                  obsData.health_score + 1,
                  obsData.cloud_cover + 1
                ]
              );
            } catch (error) {
              duplicateInsertFailed = true;
              expect(error).toBeDefined();
            }

            // Verify that duplicate insertion was prevented
            expect(duplicateInsertFailed).toBe(true);

            // Verify only one observation exists for this field and date
            const observations = await db.all(
              'SELECT * FROM satellite_observations WHERE field_id = ? AND observation_date = ?',
              [fieldId, dateStr]
            );

            expect(observations).toHaveLength(1);
            expect(observations[0].ndvi).toBeCloseTo(obsData.ndvi, 5);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should enforce referential integrity between related records', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            field_name: fc.string({ minLength: 1, maxLength: 50 }),
            crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean'),
            area_hectares: fc.float({ min: Math.fround(0.1), max: Math.fround(1000) }),
            ndvi: fc.float({ min: Math.fround(-1), max: Math.fround(1) }),
            health_score: fc.float({ min: Math.fround(0), max: Math.fround(100) }),
            temperature: fc.float({ min: Math.fround(-20), max: Math.fround(50) }),
            precipitation: fc.float({ min: Math.fround(0), max: Math.fround(200) })
          }),
          async (testData) => {
            const db = dbManager.getDatabase();

            // Insert field
            const fieldResult = await db.run(
              'INSERT INTO fields (name, crop_type, area_hectares, geometry) VALUES (?, ?, ?, ?)',
              [
                testData.field_name,
                testData.crop_type,
                testData.area_hectares,
                '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}'
              ]
            );

            const fieldId = fieldResult.lastID!;
            const today = new Date().toISOString().split('T')[0];

            // Insert satellite observation with valid field reference
            const obsResult = await db.run(
              'INSERT INTO satellite_observations (field_id, observation_date, ndvi, health_score) VALUES (?, ?, ?, ?)',
              [fieldId, today, testData.ndvi, testData.health_score]
            );

            expect(obsResult.lastID).toBeDefined();

            // Insert weather data with valid field reference
            const weatherResult = await db.run(
              'INSERT INTO weather_data (field_id, date, temperature_avg, precipitation) VALUES (?, ?, ?, ?)',
              [fieldId, today, testData.temperature, testData.precipitation]
            );

            expect(weatherResult.lastID).toBeDefined();

            // Verify records exist
            const observation = await db.get(
              'SELECT * FROM satellite_observations WHERE field_id = ?',
              [fieldId]
            );
            const weather = await db.get(
              'SELECT * FROM weather_data WHERE field_id = ?',
              [fieldId]
            );

            expect(observation).toBeDefined();
            expect(weather).toBeDefined();
            expect(observation.field_id).toBe(fieldId);
            expect(weather.field_id).toBe(fieldId);

            // Test referential integrity: attempt to insert with invalid field_id
            let invalidRefFailed = false;
            try {
              await db.run(
                'INSERT INTO satellite_observations (field_id, observation_date, ndvi, health_score) VALUES (?, ?, ?, ?)',
                [99999, today, testData.ndvi, testData.health_score] // Non-existent field_id
              );
            } catch (error) {
              invalidRefFailed = true;
            }

            expect(invalidRefFailed).toBe(true);

            // Test cascade delete: deleting field should remove related records
            await db.run('DELETE FROM fields WHERE id = ?', [fieldId]);

            const remainingObs = await db.get(
              'SELECT * FROM satellite_observations WHERE field_id = ?',
              [fieldId]
            );
            const remainingWeather = await db.get(
              'SELECT * FROM weather_data WHERE field_id = ?',
              [fieldId]
            );

            expect(remainingObs).toBeUndefined();
            expect(remainingWeather).toBeUndefined();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain transaction atomicity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            field_name: fc.string({ minLength: 1, maxLength: 50 }),
            crop_type: fc.constantFrom('wheat', 'rice', 'maize', 'cotton', 'soybean'),
            area_hectares: fc.float({ min: Math.fround(0.1), max: Math.fround(1000) }),
            should_fail: fc.boolean()
          }),
          async (testData) => {
            const db = dbManager.getDatabase();

            const initialFieldCount = await db.get('SELECT COUNT(*) as count FROM fields');
            const initialObsCount = await db.get('SELECT COUNT(*) as count FROM satellite_observations');

            let transactionFailed = false;
            try {
              await dbManager.runInTransaction(async (db) => {
                // Insert field
                const fieldResult = await db.run(
                  'INSERT INTO fields (name, crop_type, area_hectares, geometry) VALUES (?, ?, ?, ?)',
                  [
                    testData.field_name,
                    testData.crop_type,
                    testData.area_hectares,
                    '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}'
                  ]
                );

                // Insert observation
                await db.run(
                  'INSERT INTO satellite_observations (field_id, observation_date, ndvi) VALUES (?, ?, ?)',
                  [fieldResult.lastID, '2024-01-01', 0.5]
                );

                // Conditionally cause an error to test rollback
                if (testData.should_fail) {
                  throw new Error('Intentional transaction failure');
                }
              });
            } catch (error) {
              transactionFailed = true;
            }

            const finalFieldCount = await db.get('SELECT COUNT(*) as count FROM fields');
            const finalObsCount = await db.get('SELECT COUNT(*) as count FROM satellite_observations');

            if (testData.should_fail) {
              // Transaction should have failed and rolled back
              expect(transactionFailed).toBe(true);
              expect(finalFieldCount.count).toBe(initialFieldCount.count);
              expect(finalObsCount.count).toBe(initialObsCount.count);
            } else {
              // Transaction should have succeeded
              expect(transactionFailed).toBe(false);
              expect(finalFieldCount.count).toBe(initialFieldCount.count + 1);
              expect(finalObsCount.count).toBe(initialObsCount.count + 1);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});