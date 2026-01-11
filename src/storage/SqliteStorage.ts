import type { SecondaryStorage } from './types'

/**
 * Minimal SQLite database interface.
 * Compatible with Node.js 22+ native `node:sqlite` DatabaseSync.
 */
export interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
}

export interface SqliteStatement {
  get(...params: unknown[]): unknown
  run(...params: unknown[]): { changes: bigint | number }
}

/**
 * Global key for cleanup interval to survive HMR.
 */
const CLEANUP_KEY = '__payloadBetterAuthSqliteCleanup__'

interface CleanupState {
  interval: null | ReturnType<typeof setInterval>
}

function getCleanupState(): CleanupState {
  const g = globalThis as unknown as { [CLEANUP_KEY]?: CleanupState }
  if (!g[CLEANUP_KEY]) {
    g[CLEANUP_KEY] = { interval: null }
  }
  return g[CLEANUP_KEY]
}

export interface SqliteStorageOptions {
  /**
   * SQLite database instance from Node.js 22+ native `node:sqlite`.
   *
   * @example
   * import { DatabaseSync } from 'node:sqlite'
   * const db = new DatabaseSync('.dev-sync-state.db')
   */
  db: SqliteDatabase
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
export function createSqliteStorage(options: SqliteStorageOptions): SecondaryStorage {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  if (nodeEnv === 'staging' || nodeEnv === 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      `\n⚠️  [payload-better-auth] WARNING: SqliteStorage is not recommended for ${nodeEnv} environments.\n` +
        '   Use createRedisStorage() for distributed/multi-server deployments.\n',
    )
  }

  const { db } = options
  const cleanupState = getCleanupState()

  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    )
  `)

  // Prepare statements for better performance
  const getStmt = db.prepare('SELECT value, expires_at FROM kv WHERE key = ?')
  const setStmt = db.prepare('INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)')
  const deleteStmt = db.prepare('DELETE FROM kv WHERE key = ?')
  const cleanupStmt = db.prepare('DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at < ?')

  // Start cleanup interval if not already running
  if (!cleanupState.interval) {
    cleanupState.interval = setInterval(() => {
      cleanupStmt.run(Date.now())
    }, 60_000)

    // Don't prevent Node.js from exiting
    if (typeof cleanupState.interval.unref === 'function') {
      cleanupState.interval.unref()
    }
  }

  return {
    delete(key: string): Promise<void> {
      deleteStmt.run(key)
      return Promise.resolve()
    },

    get(key: string): Promise<null | string> {
      const row = getStmt.get(key) as { expires_at: null | number; value: string } | undefined

      if (!row) {
        return Promise.resolve(null)
      }

      // Check expiration
      if (row.expires_at !== null && row.expires_at < Date.now()) {
        deleteStmt.run(key)
        return Promise.resolve(null)
      }

      return Promise.resolve(row.value)
    },

    set(key: string, value: string, ttl?: number): Promise<void> {
      const expiresAt = ttl ? Date.now() + ttl * 1000 : null
      setStmt.run(key, value, expiresAt)
      return Promise.resolve()
    },
  }
}
