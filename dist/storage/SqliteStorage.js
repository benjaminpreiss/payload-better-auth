/**
 * Helper to run a database operation with retry logic for "database is locked" errors.
 */ function withRetry(operation, maxRetries = 3) {
    let retries = maxRetries;
    while(retries > 0){
        try {
            return operation();
        } catch (error) {
            if (retries > 1 && error instanceof Error && (error.message.includes('database is locked') || error.message.includes('SQLITE_BUSY'))) {
                retries--;
                // Small delay before retry using exponential backoff
                const delay = (maxRetries - retries + 1) * 50 // 50ms, 100ms, 150ms
                ;
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
            } else {
                throw error;
            }
        }
    }
    // This shouldn't be reached, but TypeScript needs it
    throw new Error('Retry exhausted');
}
/**
 * Global key for cleanup interval to survive HMR.
 */ const CLEANUP_KEY = '__payloadBetterAuthSqliteCleanup__';
function getCleanupState() {
    const g = globalThis;
    if (!g[CLEANUP_KEY]) {
        g[CLEANUP_KEY] = {
            interval: null
        };
    }
    return g[CLEANUP_KEY];
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
 */ export function createSqliteStorage(options) {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    if (nodeEnv === 'staging' || nodeEnv === 'production') {
        // eslint-disable-next-line no-console
        console.warn(`\n⚠️  [payload-better-auth] WARNING: SqliteStorage is not recommended for ${nodeEnv} environments.\n` + '   Use createRedisStorage() for distributed/multi-server deployments.\n');
    }
    const { db } = options;
    const cleanupState = getCleanupState();
    // Enable WAL mode for better concurrent access from multiple processes
    // This allows concurrent reads and writes from different processes
    try {
        db.exec('PRAGMA journal_mode=WAL');
        db.exec('PRAGMA busy_timeout=5000'); // Wait up to 5s if database is locked
        db.exec('PRAGMA synchronous=NORMAL'); // Slightly faster while still safe with WAL
    } catch  {
    // Ignore PRAGMA errors (might fail in read-only mode)
    }
    // Create table if not exists
    withRetry(()=>{
        db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      )
    `);
    });
    // Prepare statements for better performance
    const getStmt = db.prepare('SELECT value, expires_at FROM kv WHERE key = ?');
    const setStmt = db.prepare('INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)');
    const deleteStmt = db.prepare('DELETE FROM kv WHERE key = ?');
    const cleanupStmt = db.prepare('DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at < ?');
    // Start cleanup interval if not already running
    if (!cleanupState.interval) {
        cleanupState.interval = setInterval(()=>{
            try {
                withRetry(()=>cleanupStmt.run(Date.now()));
            } catch  {
            // Silently ignore cleanup errors - will retry on next interval
            }
        }, 60_000);
        // Don't prevent Node.js from exiting
        if (typeof cleanupState.interval.unref === 'function') {
            cleanupState.interval.unref();
        }
    }
    return {
        delete (key) {
            withRetry(()=>deleteStmt.run(key));
            return Promise.resolve();
        },
        get (key) {
            const row = withRetry(()=>getStmt.get(key));
            if (!row) {
                return Promise.resolve(null);
            }
            // Check expiration
            if (row.expires_at !== null && row.expires_at < Date.now()) {
                withRetry(()=>deleteStmt.run(key));
                return Promise.resolve(null);
            }
            return Promise.resolve(row.value);
        },
        set (key, value, ttl) {
            const expiresAt = ttl ? Date.now() + ttl * 1000 : null;
            withRetry(()=>setStmt.run(key, value, expiresAt));
            return Promise.resolve();
        }
    };
}

//# sourceMappingURL=SqliteStorage.js.map