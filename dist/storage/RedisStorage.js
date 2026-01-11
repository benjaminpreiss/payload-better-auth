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
 */ export function createRedisStorage(options) {
    const { prefix = 'ba:', redis } = options;
    return {
        async delete (key) {
            await redis.del(prefix + key);
        },
        async get (key) {
            return redis.get(prefix + key);
        },
        async set (key, value, ttl) {
            if (ttl) {
                // Use EX for seconds TTL
                await redis.set(prefix + key, value, 'EX', ttl);
            } else {
                await redis.set(prefix + key, value);
            }
        }
    };
}

//# sourceMappingURL=RedisStorage.js.map