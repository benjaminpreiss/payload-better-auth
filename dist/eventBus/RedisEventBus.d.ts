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
import type { EventBus } from './types';
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
    on(event: 'message', callback: (channel: string, message: string) => void): void;
    /**
     * Publish a message to a channel.
     */
    publish(channel: string, message: string): Promise<number>;
    /**
     * Subscribe to a channel.
     */
    subscribe(channel: string): Promise<unknown>;
    /**
     * Unsubscribe from a channel.
     */
    unsubscribe(channel: string): Promise<unknown>;
}
export interface RedisEventBusOptions {
    /**
     * Channel prefix for Redis Pub/Sub.
     * @default 'eventbus:'
     */
    channelPrefix?: string;
    /**
     * Redis client for publishing events.
     * Can be the same instance used for other operations.
     *
     * @example
     * import Redis from 'ioredis'
     * const publisher = new Redis()
     */
    publisher: RedisPubSubClient;
    /**
     * Redis client for subscribing to events.
     * **MUST be a dedicated connection** - Redis clients in subscriber mode
     * cannot be used for other commands.
     *
     * @example
     * import Redis from 'ioredis'
     * const subscriber = new Redis() // Separate connection
     */
    subscriber: RedisPubSubClient;
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
export declare function createRedisEventBus(options: RedisEventBusOptions): EventBus;
