/**
 * Shared storage instance for development.
 * Both the Payload plugin and Better Auth plugin must use the SAME storage
 * for timestamp coordination and event synchronization to work.
 *
 * Supports two modes:
 * - SQLite (default): Uses Node.js 22+ native SQLite, persists to disk
 * - Redis: Uses ioredis, requires REDIS_URL environment variable
 *
 * Set USE_REDIS=true to enable Redis mode.
 */
import type { SecondaryStorage } from 'payload-better-auth/storage'

let storage: SecondaryStorage

if (process.env.USE_REDIS === 'true') {
  // Dynamic import to avoid requiring ioredis when not using Redis
  const { Redis } = await import('ioredis')
  const { createRedisStorage } = await import('payload-better-auth/storage')

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  const redis = new Redis(redisUrl)

  storage = createRedisStorage({ redis })

  console.log('[syncAdapter] Using Redis storage:', redisUrl)
} else {
  // Use Node.js native SQLite (Node 22+)
  const { DatabaseSync } = await import('node:sqlite')
  const { createSqliteStorage } = await import('payload-better-auth/storage')

  const db = new DatabaseSync('.dev-sync-state.db')
  storage = createSqliteStorage({ db })

  console.log('[syncAdapter] Using SQLite storage')
}

export { storage }
