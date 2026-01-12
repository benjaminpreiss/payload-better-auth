/**
 * SQLite-backed EventBus with polling for cross-process communication.
 *
 * Uses Node.js 22+ native `node:sqlite` to share timestamp events across multiple
 * processes via a shared database file with periodic polling.
 *
 * Suitable for:
 * - Development with Turbopack multi-worker setups
 * - Production with multiple processes (PM2 cluster, etc.)
 * - Any environment where processes share filesystem access
 *
 * Trade-offs:
 * - Higher latency than in-memory (polling interval)
 * - File I/O overhead
 * - For true distributed systems (multiple machines), use Redis instead
 *
 * Note: User sync is handled entirely by the reconcile queue on the Better Auth side.
 * The queue processes ensure/delete tasks with retries when users change.
 */
import type { EventBus } from './types';
/**
 * Minimal SQLite database interface.
 * Compatible with Node.js 22+ native `node:sqlite` DatabaseSync.
 */
export interface SqliteDatabase {
    exec(sql: string): void;
    prepare(sql: string): SqliteStatement;
}
export interface SqliteStatement {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): {
        changes: bigint | number;
        lastInsertRowid: bigint | number;
    };
}
export interface SqlitePollingEventBusOptions {
    /**
     * How long to keep events before cleanup (in milliseconds).
     * @default 60000 (1 minute)
     */
    cleanupAge?: number;
    /**
     * How often to run cleanup of old events (in milliseconds).
     * @default 60000 (1 minute)
     */
    cleanupInterval?: number;
    /**
     * SQLite database instance from Node.js 22+ native `node:sqlite`.
     *
     * @example
     * import { DatabaseSync } from 'node:sqlite'
     * const db = new DatabaseSync('.event-bus.db')
     */
    db: SqliteDatabase;
    /**
     * How often to poll for new events (in milliseconds).
     * Lower values = faster event delivery, higher CPU/IO usage.
     * @default 100
     */
    pollInterval?: number;
}
export declare function createSqlitePollingEventBus(options: SqlitePollingEventBusOptions): EventBus;
