import type { SecondaryStorage } from './types';
/**
 * Minimal SQLite database interface.
 * Compatible with Node.js 22+ native `node:sqlite` DatabaseSync.
 */
export interface SqliteDatabase {
    exec(sql: string): void;
    prepare(sql: string): SqliteStatement;
}
export interface SqliteStatement {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): {
        changes: bigint | number;
    };
}
export interface SqliteStorageOptions {
    /**
     * SQLite database instance from Node.js 22+ native `node:sqlite`.
     *
     * @example
     * import { DatabaseSync } from 'node:sqlite'
     * const db = new DatabaseSync('.dev-sync-state.db')
     */
    db: SqliteDatabase;
}
/**
 * Create a SQLite-backed storage adapter using Node.js 22+ native sqlite.
 *
 * **Note:** This adapter is intended for development and testing only.
 * For staging and production environments, use `createRedisStorage` instead.
 *
 * Suitable for:
 * - Local development (persists across HMR and restarts)
 * - Testing environments
 * - No native bindings to manage - built into Node.js
 *
 * Data is stored on disk and survives process restarts.
 *
 * @example
 * import { DatabaseSync } from 'node:sqlite'
 * import { createSqliteStorage } from 'payload-better-auth/storage'
 *
 * const db = new DatabaseSync('.dev-sync-state.db')
 * const storage = createSqliteStorage({ db })
 */
export declare function createSqliteStorage(options: SqliteStorageOptions): SecondaryStorage;
