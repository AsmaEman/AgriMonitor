import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
  private readonly dbPath: string;

  private constructor() {
    this.dbPath = process.env.DATABASE_PATH || './data/agrimonitor.db';
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      if (this.dbPath !== ':memory:') {
        const dbDir = path.dirname(this.dbPath);
        await fs.mkdir(dbDir, { recursive: true });
      }

      // Open database connection
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      // Enable foreign key constraints
      await this.db.exec('PRAGMA foreign_keys = ON');

      // Enable WAL mode for better concurrency
      if (this.dbPath !== ':memory:') {
        await this.db.exec('PRAGMA journal_mode = WAL');
      }

      // Set reasonable timeout for busy database
      await this.db.exec('PRAGMA busy_timeout = 30000');

      // Initialize schema
      await this.initializeSchema();

      logger.info(`Database initialized successfully at ${this.dbPath}`);
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async initializeSchema(): Promise<void> {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf-8');

      // Execute schema in a transaction
      await this.db!.exec('BEGIN TRANSACTION');
      await this.db!.exec(schema);
      await this.db!.exec('COMMIT');

      logger.info('Database schema initialized successfully');
    } catch (error) {
      await this.db!.exec('ROLLBACK');
      logger.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  public getDatabase(): Database<sqlite3.Database, sqlite3.Statement> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      logger.info('Database connection closed');
    }
  }

  // Transaction helper methods
  public async runInTransaction<T>(
    callback: (db: Database<sqlite3.Database, sqlite3.Statement>) => Promise<T>
  ): Promise<T> {
    const db = this.getDatabase();

    await db.exec('BEGIN TRANSACTION');
    try {
      const result = await callback(db);
      await db.exec('COMMIT');
      return result;
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }

  // Health check method
  public async healthCheck(): Promise<boolean> {
    try {
      const db = this.getDatabase();
      await db.get('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  // Get database statistics
  public async getStats(): Promise<{
    fieldsCount: number;
    observationsCount: number;
    weatherDataCount: number;
    alertsCount: number;
    dbSize?: number;
  }> {
    const db = this.getDatabase();

    const [fields, observations, weather, alerts] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM fields'),
      db.get('SELECT COUNT(*) as count FROM satellite_observations'),
      db.get('SELECT COUNT(*) as count FROM weather_data'),
      db.get('SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0')
    ]);

    const stats = {
      fieldsCount: fields?.count || 0,
      observationsCount: observations?.count || 0,
      weatherDataCount: weather?.count || 0,
      alertsCount: alerts?.count || 0
    };

    // Get database file size if not in-memory
    if (this.dbPath !== ':memory:') {
      try {
        const stat = await fs.stat(this.dbPath);
        return { ...stats, dbSize: stat.size };
      } catch (error) {
        logger.warn('Could not get database file size:', error);
      }
    }

    return stats;
  }

  // Configuration helpers
  public async getConfig(key: string): Promise<string | null> {
    const db = this.getDatabase();
    const result = await db.get(
      'SELECT value FROM configuration WHERE key = ?',
      [key]
    );
    return result?.value || null;
  }

  public async setConfig(key: string, value: string, description?: string): Promise<void> {
    const db = this.getDatabase();
    await db.run(
      `INSERT OR REPLACE INTO configuration (key, value, description, updated_at) 
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [key, value, description || null]
    );
  }

  // Cleanup old data
  public async cleanupOldData(daysToKeep: number = 365): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    await this.runInTransaction(async (db) => {
      // Clean up old satellite observations
      const satelliteResult = await db.run(
        'DELETE FROM satellite_observations WHERE observation_date < ?',
        [cutoffDateStr]
      );

      // Clean up old weather data
      const weatherResult = await db.run(
        'DELETE FROM weather_data WHERE date < ?',
        [cutoffDateStr]
      );

      // Clean up old sensor readings
      const sensorResult = await db.run(
        'DELETE FROM sensor_readings WHERE timestamp < ?',
        [cutoffDate.toISOString()]
      );

      // Clean up resolved alerts older than 30 days
      const alertCutoff = new Date();
      alertCutoff.setDate(alertCutoff.getDate() - 30);
      const alertResult = await db.run(
        'DELETE FROM alerts WHERE resolved = 1 AND resolved_at < ?',
        [alertCutoff.toISOString()]
      );

      logger.info(`Cleanup completed: ${satelliteResult.changes} satellite observations, ${weatherResult.changes} weather records, ${sensorResult.changes} sensor readings, ${alertResult.changes} alerts removed`);
    });
  }
}

// Export singleton instance
export const dbManager = DatabaseManager.getInstance();