/**
 * Shared storage instance for development.
 * Both the Payload plugin and Better Auth plugin must use the SAME storage
 * for timestamp coordination and event synchronization to work.
 *
 * Using Node.js 22+ native SQLite which persists to disk - this survives
 * HMR cycles and process restarts, with no bundling issues.
 */
import { DatabaseSync } from 'node:sqlite'
import { createSqliteStorage } from 'payload-better-auth/storage'

// Open the SQLite database
const db = new DatabaseSync('.dev-sync-state.db')

// Create storage using the database
export const storage = createSqliteStorage({ db })
