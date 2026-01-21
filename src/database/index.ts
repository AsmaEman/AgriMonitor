// Database module exports
export { DatabaseManager, dbManager } from './connection';
export { MigrationManager, type Migration } from './migrations';

// Re-export sqlite types for convenience
export type { Database } from 'sqlite';
export type { Database as SQLiteDatabase, Statement } from 'sqlite3';