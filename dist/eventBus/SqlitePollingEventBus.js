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
 */ const GLOBAL_KEY = '__payloadBetterAuthSqliteEventBus__';
function getOrCreateState() {
    const g = globalThis;
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = {
            cleanupInterval: null,
            initialized: false,
            lastTimestampEventId: 0,
            pollingInterval: null,
            timestampHandlers: new Map()
        };
    }
    return g[GLOBAL_KEY];
}
/**
 * Create a SQLite-backed EventBus with polling for cross-process communication.
 *
 * **Note:** This adapter is intended for development and testing only.
 * For staging and production environments, use a Redis-backed EventBus instead.
 *
 * Timestamp events are stored in SQLite and polled periodically, allowing multiple
 * processes to communicate through the shared database file.
 *
 * @example
 * ```typescript
 * import { DatabaseSync } from 'node:sqlite'
 * import { createSqlitePollingEventBus } from 'payload-better-auth/eventBus'
 *
 * const db = new DatabaseSync('.event-bus.db')
 * export const eventBus = createSqlitePollingEventBus({ db })
 * ```
 */ export function createSqlitePollingEventBus(options) {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    if (nodeEnv === 'staging' || nodeEnv === 'production') {
        // eslint-disable-next-line no-console
        console.warn(`\n⚠️  [payload-better-auth] WARNING: SqlitePollingEventBus is not recommended for ${nodeEnv} environments.\n` + '   Use createRedisEventBus() for distributed/multi-server deployments.\n');
    }
    const { cleanupAge = 60_000, cleanupInterval = 60_000, db, pollInterval = 100 } = options;
    const state = getOrCreateState();
    // Initialize database schema only once
    if (!state.initialized) {
        db.exec(`
      CREATE TABLE IF NOT EXISTS eventbus_timestamp_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      )
    `);
        // Index for efficient polling
        db.exec(`CREATE INDEX IF NOT EXISTS idx_timestamp_events_id ON eventbus_timestamp_events(id)`);
        // Get the current max ID so we don't process old events on startup
        const maxTimestampEvent = db.prepare('SELECT MAX(id) as max_id FROM eventbus_timestamp_events').get();
        state.lastTimestampEventId = maxTimestampEvent?.max_id ?? 0;
        state.initialized = true;
    }
    // Prepare statements
    const insertTimestampEventStmt = db.prepare(`
    INSERT INTO eventbus_timestamp_events (service, timestamp)
    VALUES (?, ?)
  `);
    const selectNewTimestampEventsStmt = db.prepare(`
    SELECT id, service, timestamp
    FROM eventbus_timestamp_events
    WHERE id > ?
    ORDER BY id ASC
  `);
    const cleanupTimestampEventsStmt = db.prepare(`
    DELETE FROM eventbus_timestamp_events WHERE created_at < ?
  `);
    // Poll for new events
    function pollEvents() {
        // Poll timestamp events
        const timestampEvents = selectNewTimestampEventsStmt.all(state.lastTimestampEventId);
        for (const row of timestampEvents){
            state.lastTimestampEventId = row.id;
            const handlers = state.timestampHandlers.get(row.service);
            if (handlers) {
                handlers.forEach((handler)=>handler(row.timestamp));
            }
        }
    }
    // Start polling if not already running
    if (!state.pollingInterval) {
        state.pollingInterval = setInterval(pollEvents, pollInterval);
        if (typeof state.pollingInterval.unref === 'function') {
            state.pollingInterval.unref();
        }
    }
    // Start cleanup if not already running
    if (!state.cleanupInterval) {
        state.cleanupInterval = setInterval(()=>{
            const cutoff = Date.now() - cleanupAge;
            cleanupTimestampEventsStmt.run(cutoff);
        }, cleanupInterval);
        if (typeof state.cleanupInterval.unref === 'function') {
            state.cleanupInterval.unref();
        }
    }
    return {
        notifyTimestampChange (service, timestamp) {
            insertTimestampEventStmt.run(service, timestamp);
            // Also notify local handlers immediately (for same-process performance)
            const handlers = state.timestampHandlers.get(service);
            if (handlers) {
                handlers.forEach((handler)=>handler(timestamp));
            }
        },
        subscribeToTimestamp (service, handler) {
            if (!state.timestampHandlers.has(service)) {
                state.timestampHandlers.set(service, new Set());
            }
            state.timestampHandlers.get(service).add(handler);
            return ()=>{
                state.timestampHandlers.get(service)?.delete(handler);
            };
        }
    };
}

//# sourceMappingURL=SqlitePollingEventBus.js.map