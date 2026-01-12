/**
 * Shared EventBus instance for development.
 * Both the Payload plugin and Better Auth plugin must use the SAME eventBus
 * for real-time event delivery to work.
 *
 * Supports two modes:
 * - SQLite (default): Uses SQLite-backed polling for cross-process communication
 * - Redis: Uses Redis Pub/Sub for real-time distributed events
 *
 * Set USE_REDIS=true to enable Redis mode.
 */
import type { EventBus } from 'payload-better-auth/eventBus'

let eventBus: EventBus

if (process.env.USE_REDIS === 'true') {
  // Dynamic import to avoid requiring ioredis when not using Redis
  const { Redis } = await import('ioredis')
  const { createRedisEventBus } = await import('payload-better-auth/eventBus')

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

  // Redis Pub/Sub requires separate connections for publisher and subscriber
  const publisher = new Redis(redisUrl)
  const subscriber = new Redis(redisUrl)

  eventBus = createRedisEventBus({ publisher, subscriber })

  console.log('[eventBus] Using Redis Pub/Sub:', redisUrl)
} else {
  // Use SQLite-backed polling EventBus
  const { DatabaseSync } = await import('node:sqlite')
  const { createSqlitePollingEventBus } = await import('payload-better-auth/eventBus')

  // Allow test environment to use a separate file
  const dbPath = process.env.EVENT_BUS_DB_PATH || '.event-bus.db'
  const db = new DatabaseSync(dbPath)
  eventBus = createSqlitePollingEventBus({ db })

  console.log('[eventBus] Using SQLite polling:', dbPath)
}

export { eventBus }
