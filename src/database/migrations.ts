import { Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { logger } from '../utils/logger';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database<sqlite3.Database, sqlite3.Statement>) => Promise<void>;
  down: (db: Database<sqlite3.Database, sqlite3.Statement>) => Promise<void>;
}

export class MigrationManager {
  private migrations: Migration[] = [];

  constructor(private db: Database<sqlite3.Database, sqlite3.Statement>) {
    this.initializeMigrations();
  }

  private initializeMigrations(): void {
    // Migration 1: Initial schema (already handled by schema.sql)
    this.migrations.push({
      version: 1,
      name: 'initial_schema',
      up: async () => {
        // Schema is already created by schema.sql
        logger.info('Initial schema migration completed');
      },
      down: async (db) => {
        // Drop all tables in reverse order
        const tables = [
          'configuration',
          'alerts',
          'recommendations',
          'sensor_readings',
          'weather_data',
          'satellite_observations',
          'fields'
        ];

        for (const table of tables) {
          await db.exec(`DROP TABLE IF EXISTS ${table}`);
        }
        logger.info('Initial schema migration rolled back');
      }
    });

    // Future migrations can be added here
    // Example:
    // this.migrations.push({
    //   version: 2,
    //   name: 'add_user_management',
    //   up: async (db) => {
    //     await db.exec(`
    //       CREATE TABLE users (
    //         id INTEGER PRIMARY KEY AUTOINCREMENT,
    //         username TEXT UNIQUE NOT NULL,
    //         email TEXT UNIQUE NOT NULL,
    //         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    //       )
    //     `);
    //   },
    //   down: async (db) => {
    //     await db.exec('DROP TABLE IF EXISTS users');
    //   }
    // });
  }

  public async ensureMigrationsTable(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public async getCurrentVersion(): Promise<number> {
    await this.ensureMigrationsTable();

    const result = await this.db.get(
      'SELECT MAX(version) as version FROM migrations'
    );

    return result?.version || 0;
  }

  public async migrate(): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    logger.info(`Running ${pendingMigrations.length} pending migrations`);

    for (const migration of pendingMigrations) {
      try {
        await this.db.exec('BEGIN TRANSACTION');

        logger.info(`Applying migration ${migration.version}: ${migration.name}`);
        await migration.up(this.db);

        await this.db.run(
          'INSERT INTO migrations (version, name) VALUES (?, ?)',
          [migration.version, migration.name]
        );

        await this.db.exec('COMMIT');
        logger.info(`Migration ${migration.version} completed successfully`);
      } catch (error) {
        await this.db.exec('ROLLBACK');
        logger.error(`Migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    logger.info('All migrations completed successfully');
  }

  public async rollback(targetVersion: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion();

    if (targetVersion >= currentVersion) {
      logger.info('No rollback needed');
      return;
    }

    const migrationsToRollback = this.migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version); // Rollback in reverse order

    logger.info(`Rolling back ${migrationsToRollback.length} migrations to version ${targetVersion}`);

    for (const migration of migrationsToRollback) {
      try {
        await this.db.exec('BEGIN TRANSACTION');

        logger.info(`Rolling back migration ${migration.version}: ${migration.name}`);
        await migration.down(this.db);

        await this.db.run(
          'DELETE FROM migrations WHERE version = ?',
          [migration.version]
        );

        await this.db.exec('COMMIT');
        logger.info(`Migration ${migration.version} rolled back successfully`);
      } catch (error) {
        await this.db.exec('ROLLBACK');
        logger.error(`Rollback of migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    logger.info(`Rollback to version ${targetVersion} completed successfully`);
  }

  public async getMigrationStatus(): Promise<{ version: number; name: string; applied: boolean }[]> {
    const currentVersion = await this.getCurrentVersion();

    return this.migrations.map(migration => ({
      version: migration.version,
      name: migration.name,
      applied: migration.version <= currentVersion
    }));
  }
}