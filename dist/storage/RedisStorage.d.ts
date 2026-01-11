import type { SecondaryStorage } from './types';
/**
 * Minimal Redis client interface.
 * Compatible with ioredis, redis, and other Redis clients.
 */
export interface RedisClient {
    del(key: string): Promise<number>;
    get(key: string): Promise<null | string>;
    set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
}
export interface RedisStorageOptions {
    /**
     * Key prefix for all stored values.
     * @default 'ba:'
     */
    prefix?: string;
    /**
     * Redis client instance.
     *
     * @example
     * import Redis from 'ioredis'
     * const redis = new Redis()
     */
    redis: RedisClient;
}
/**
 * Create a Redis-backed storage adapter.
 *
 * Suitable for:
 * - Multi-server / distributed deployments
 * - Production environments
 *
 * Requires a Redis server.
 *
 * @example
 * import Redis from 'ioredis'
 * import { createRedisStorage } from 'payload-better-auth'
 *
 * const redis = new Redis(process.env.REDIS_URL)
 * const storage = createRedisStorage({ redis })
 */
export declare function createRedisStorage(options: RedisStorageOptions): SecondaryStorage;
