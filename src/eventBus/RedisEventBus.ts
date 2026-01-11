/**
 * Redis-backed EventBus using Pub/Sub for real-time distributed communication.
 *
 * Uses Redis Pub/Sub for instant event delivery across multiple servers/processes.
 *
 * Suitable for:
 * - Multi-server / distributed deployments
 * - Production environments requiring horizontal scaling
 * - Any environment where servers don't share filesystem access
 *
 * Requires a Redis server with Pub/Sub support.
 *
 * Note: User sync is handled entirely by the reconcile queue on the Better Auth side.
 * The queue processes ensure/delete tasks with retries when users change.
 */
import type { EventBus, TimestampHandler } from './types'

/**
 * Minimal Redis client interface for Pub/Sub operations.
 * Compatible with ioredis.
 *
 * Note: Redis Pub/Sub requires separate connections for publishing and subscribing.
 * The subscriber connection enters "subscriber mode" and can't be used for other commands.
 */
export interface RedisPubSubClient {
  /**
   * Register a message handler.
   * The handler receives (channel, message) arguments.
   */
  on(event: 'message', callback: (channel: string, message: string) => void): void

  /**
   * Publish a message to a channel.
   */
  publish(channel: string, message: string): Promise<number>

  /**
   * Subscribe to a channel.
   */
  subscribe(channel: string): Promise<unknown>

  /**
   * Unsubscribe from a channel.
   */
  unsubscribe(channel: string): Promise<unknown>
}

export interface RedisEventBusOptions {
  /**
   * Channel prefix for Redis Pub/Sub.
   * @default 'eventbus:'
   */
  channelPrefix?: string

  /**
   * Redis client for publishing events.
   * Can be the same instance used for other operations.
   *
   * @example
   * import Redis from 'ioredis'
   * const publisher = new Redis()
   */
  publisher: RedisPubSubClient

  /**
   * Redis client for subscribing to events.
   * **MUST be a dedicated connection** - Redis clients in subscriber mode
   * cannot be used for other commands.
   *
   * @example
   * import Redis from 'ioredis'
   * const subscriber = new Redis() // Separate connection
   */
  subscriber: RedisPubSubClient
}

const GLOBAL_KEY = '__payloadBetterAuthRedisEventBus__'

interface RedisEventBusState {
  initialized: boolean
  subscribedChannels: Set<string>
  timestampHandlers: Map<string, Set<TimestampHandler>>
}

function getOrCreateState(): RedisEventBusState {
  const g = globalThis as unknown as { [GLOBAL_KEY]?: RedisEventBusState }

  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      initialized: false,
      subscribedChannels: new Set(),
      timestampHandlers: new Map(),
    }
  }

  return g[GLOBAL_KEY]
}

/**
 * Create a Redis-backed EventBus using Pub/Sub for real-time distributed communication.
 *
 * **Recommended for production and staging environments.**
 *
 * Uses Redis Pub/Sub for instant event delivery, making it suitable for
 * multi-server deployments where processes don't share filesystem access.
 *
 * **Important:** You must provide two separate Redis connections:
 * - `publisher`: For sending events (can be shared with other operations)
 * - `subscriber`: Dedicated connection for receiving events (enters subscriber mode)
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis'
 * import { createRedisEventBus } from 'payload-better-auth/eventBus'
 *
 * const publisher = new Redis(process.env.REDIS_URL)
 * const subscriber = new Redis(process.env.REDIS_URL) // Separate connection!
 *
 * export const eventBus = createRedisEventBus({ publisher, subscriber })
 * ```
 */
export function createRedisEventBus(options: RedisEventBusOptions): EventBus {
  const { channelPrefix = 'eventbus:', publisher, subscriber } = options

  const state = getOrCreateState()

  // Set up message handler only once
  if (!state.initialized) {
    subscriber.on('message', (channel: string, message: string) => {
      // Parse channel to extract service name
      // Channel format: "eventbus:timestamp:<service>"
      const timestampPrefix = `${channelPrefix}timestamp:`
      if (channel.startsWith(timestampPrefix)) {
        const service = channel.slice(timestampPrefix.length)
        const timestamp = parseInt(message, 10)

        if (!isNaN(timestamp)) {
          const handlers = state.timestampHandlers.get(service)
          if (handlers) {
            handlers.forEach((handler) => handler(timestamp))
          }
        }
      }
    })

    state.initialized = true
  }

  return {
    notifyTimestampChange(service: string, timestamp: number): void {
      const channel = `${channelPrefix}timestamp:${service}`

      // Publish asynchronously - fire and forget
      publisher.publish(channel, String(timestamp)).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[RedisEventBus] Failed to publish timestamp change:', err)
      })

      // Also notify local handlers immediately (for same-process performance)
      const handlers = state.timestampHandlers.get(service)
      if (handlers) {
        handlers.forEach((handler) => handler(timestamp))
      }
    },

    subscribeToTimestamp(service: string, handler: TimestampHandler): () => void {
      const channel = `${channelPrefix}timestamp:${service}`

      // Initialize handlers set for this service
      if (!state.timestampHandlers.has(service)) {
        state.timestampHandlers.set(service, new Set())
      }

      state.timestampHandlers.get(service)!.add(handler)

      // Subscribe to Redis channel if not already subscribed
      if (!state.subscribedChannels.has(channel)) {
        state.subscribedChannels.add(channel)
        subscriber.subscribe(channel).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[RedisEventBus] Failed to subscribe to channel:', err)
        })
      }

      // Return unsubscribe function
      return () => {
        state.timestampHandlers.get(service)?.delete(handler)

        // If no more handlers for this service, unsubscribe from Redis
        const handlers = state.timestampHandlers.get(service)
        if (!handlers || handlers.size === 0) {
          state.subscribedChannels.delete(channel)
          subscriber.unsubscribe(channel).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[RedisEventBus] Failed to unsubscribe from channel:', err)
          })
        }
      }
    },
  }
}
