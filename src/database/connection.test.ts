import { DatabaseManager } from './connection';
import { MigrationManager } from './migrations';

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;
  const testDbPath = ':memory:'; // Use in-memory database for tests

  beforeEach(async () => {
    // Create a new instance for each test
    process.env.DATABASE_PATH = testDbPath;
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  describe('initialization', () => {
    it('should initialize database successfully', async () => {
      const db = dbManager.getDatabase();
      expect(db).toBeDefined();
    });

    it('should enable foreign key constraints', async () => {
      const db = dbManager.getDatabase();
      const result = await db.get('PRAGMA foreign_keys');
      expect(result.foreign_keys).toBe(1);
    });

    it('should create all required tables', async () => {
      const db = dbManager.getDatabase();
      const tables = await db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );

      const tableNames = tables.map(t => t.name);
      const expectedTables = [
        'fields',
        'satellite_observations',
        'weather_data',
        'sensor_readings',
        'recommendations',
        'alerts',
        'configuration'
      ];

      expectedTables.forEach(tableName => {
        expect(tableNames).toContain(tableName);
      });
    });

    it('should create proper indexes', async () => {
      const db = dbManager.getDatabase();
      const indexes = await db.all(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
      );

      const indexNames = indexes.map(i => i.name);
      expect(indexNames.length).toBeGreaterThan(0);
      expect(indexNames).toContain('idx_satellite_observations_field_date');
      expect(indexNames).toContain('idx_weather_data_field_date');
    });

    it('should insert default configuration values', async () => {
      const db = dbManager.getDatabase();
      const configs = await db.all('SELECT * FROM configuration');

      expect(configs.length).toBeGreaterThan(0);

      const configKeys = configs.map(c => c.key);
      expect(configKeys).toContain('health_score_threshold');
      expect(configKeys).toContain('ndvi_decline_threshold');
      expect(configKeys).toContain('soil_moisture_critical_threshold');
    });
  });

  describe('health check', () => {
    it('should return true for healthy database', async () => {
      const isHealthy = await dbManager.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should return database statistics', async () => {
      const stats = await dbManager.getStats();

      expect(stats).toHaveProperty('fieldsCount');
      expect(stats).toHaveProperty('observationsCount');
      expect(stats).toHaveProperty('weatherDataCount');
      expect(stats).toHaveProperty('alertsCount');

      expect(typeof stats.fieldsCount).toBe('number');
      expect(typeof stats.observationsCount).toBe('number');
      expect(typeof stats.weatherDataCount).toBe('number');
      expect(typeof stats.alertsCount).toBe('number');
    });
  });

  describe('configuration management', () => {
    it('should get and set configuration values', async () => {
      const testKey = 'test_config';
      const testValue = 'test_value';
      const testDescription = 'Test configuration';

      // Set configuration
      await dbManager.setConfig(testKey, testValue, testDescription);

      // Get configuration
      const retrievedValue = await dbManager.getConfig(testKey);
      expect(retrievedValue).toBe(testValue);
    });

    it('should return null for non-existent configuration', async () => {
      const value = await dbManager.getConfig('non_existent_key');
      expect(value).toBeNull();
    });

    it('should update existing configuration', async () => {
      const key = 'update_test';
      const originalValue = 'original';
      const updatedValue = 'updated';

      await dbManager.setConfig(key, originalValue);
      await dbManager.setConfig(key, updatedValue);

      const retrievedValue = await dbManager.getConfig(key);
      expect(retrievedValue).toBe(updatedValue);
    });
  });

  describe('transactions', () => {
    it('should execute operations in transaction successfully', async () => {
      const result = await dbManager.runInTransaction(async (db) => {
        await db.run(
          'INSERT INTO fields (name, crop_type, area_hectares, geometry) VALUES (?, ?, ?, ?)',
          ['Test Field', 'wheat', 10.5, '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}']
        );
        return 'success';
      });

      expect(result).toBe('success');

      // Verify the field was inserted
      const db = dbManager.getDatabase();
      const field = await db.get('SELECT * FROM fields WHERE name = ?', ['Test Field']);
      expect(field).toBeDefined();
      expect(field.name).toBe('Test Field');
    });

    it('should rollback transaction on error', async () => {
      try {
        await dbManager.runInTransaction(async (db) => {
          await db.run(
            'INSERT INTO fields (name, crop_type, area_hectares, geometry) VALUES (?, ?, ?, ?)',
            ['Test Field 2', 'wheat', 10.5, '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}']
          );

          // This should cause an error (invalid crop type)
          await db.run(
            'INSERT INTO fields (name, crop_type, area_hectares, geometry) VALUES (?, ?, ?, ?)',
            ['Test Field 3', 'invalid_crop', 10.5, '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}']
          );
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify no fields were inserted due to rollback
      const db = dbManager.getDatabase();
      const fields = await db.all('SELECT * FROM fields WHERE name LIKE ?', ['Test Field %']);
      expect(fields.length).toBe(0);
    });
  });

  describe('data cleanup', () => {
    beforeEach(async () => {
      const db = dbManager.getDatabase();

      // Insert test field
      await db.run(
        'INSERT INTO fields (id, name, crop_type, area_hectares, geometry) VALUES (?, ?, ?, ?, ?)',
        [1, 'Test Field', 'wheat', 10.5, '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}']
      );

      // Insert old satellite observation
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);
      await db.run(
        'INSERT INTO satellite_observations (field_id, observation_date, ndvi, health_score) VALUES (?, ?, ?, ?)',
        [1, oldDate.toISOString().split('T')[0], 0.5, 75]
      );

      // Insert recent satellite observation
      const recentDate = new Date();
      await db.run(
        'INSERT INTO satellite_observations (field_id, observation_date, ndvi, health_score) VALUES (?, ?, ?, ?)',
        [1, recentDate.toISOString().split('T')[0], 0.7, 85]
      );
    });

    it('should clean up old data while preserving recent data', async () => {
      const db = dbManager.getDatabase();

      // Check initial count
      const initialCount = await db.get('SELECT COUNT(*) as count FROM satellite_observations');
      expect(initialCount.count).toBe(2);

      // Clean up data older than 1 year
      await dbManager.cleanupOldData(365);

      // Check final count - should have removed the old observation
      const finalCount = await db.get('SELECT COUNT(*) as count FROM satellite_observations');
      expect(finalCount.count).toBe(1);

      // Verify the recent observation is still there
      const recentObs = await db.get(
        'SELECT * FROM satellite_observations WHERE observation_date = ?',
        [new Date().toISOString().split('T')[0]]
      );
      expect(recentObs).toBeDefined();
    });
  });
});

describe('MigrationManager', () => {
  let dbManager: DatabaseManager;
  let migrationManager: MigrationManager;

  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    migrationManager = new MigrationManager(dbManager.getDatabase());
  });

  afterEach(async () => {
    await dbManager.close();
  });

  it('should create migrations table', async () => {
    await migrationManager.ensureMigrationsTable();

    const db = dbManager.getDatabase();
    const table = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
    );
    expect(table).toBeDefined();
  });

  it('should track migration version', async () => {
    const initialVersion = await migrationManager.getCurrentVersion();
    expect(typeof initialVersion).toBe('number');
    expect(initialVersion).toBeGreaterThanOrEqual(0);
  });

  it('should run migrations', async () => {
    await migrationManager.migrate();

    const version = await migrationManager.getCurrentVersion();
    expect(version).toBeGreaterThan(0);
  });
});