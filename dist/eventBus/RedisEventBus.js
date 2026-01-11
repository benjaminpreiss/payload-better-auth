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
 */ const GLOBAL_KEY = '__payloadBetterAuthRedisEventBus__';
function getOrCreateState() {
    const g = globalThis;
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = {
            initialized: false,
            subscribedChannels: new Set(),
            timestampHandlers: new Map()
        };
    }
    return g[GLOBAL_KEY];
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
 */ export function createRedisEventBus(options) {
    const { channelPrefix = 'eventbus:', publisher, subscriber } = options;
    const state = getOrCreateState();
    // Set up message handler only once
    if (!state.initialized) {
        subscriber.on('message', (channel, message)=>{
            // Parse channel to extract service name
            // Channel format: "eventbus:timestamp:<service>"
            const timestampPrefix = `${channelPrefix}timestamp:`;
            if (channel.startsWith(timestampPrefix)) {
                const service = channel.slice(timestampPrefix.length);
                const timestamp = parseInt(message, 10);
                if (!isNaN(timestamp)) {
                    const handlers = state.timestampHandlers.get(service);
                    if (handlers) {
                        handlers.forEach((handler)=>handler(timestamp));
                    }
                }
            }
        });
        state.initialized = true;
    }
    return {
        notifyTimestampChange (service, timestamp) {
            const channel = `${channelPrefix}timestamp:${service}`;
            // Publish asynchronously - fire and forget
            publisher.publish(channel, String(timestamp)).catch((err)=>{
                // eslint-disable-next-line no-console
                console.error('[RedisEventBus] Failed to publish timestamp change:', err);
            });
            // Also notify local handlers immediately (for same-process performance)
            const handlers = state.timestampHandlers.get(service);
            if (handlers) {
                handlers.forEach((handler)=>handler(timestamp));
            }
        },
        subscribeToTimestamp (service, handler) {
            const channel = `${channelPrefix}timestamp:${service}`;
            // Initialize handlers set for this service
            if (!state.timestampHandlers.has(service)) {
                state.timestampHandlers.set(service, new Set());
            }
            state.timestampHandlers.get(service).add(handler);
            // Subscribe to Redis channel if not already subscribed
            if (!state.subscribedChannels.has(channel)) {
                state.subscribedChannels.add(channel);
                subscriber.subscribe(channel).catch((err)=>{
                    // eslint-disable-next-line no-console
                    console.error('[RedisEventBus] Failed to subscribe to channel:', err);
                });
            }
            // Return unsubscribe function
            return ()=>{
                state.timestampHandlers.get(service)?.delete(handler);
                // If no more handlers for this service, unsubscribe from Redis
                const handlers = state.timestampHandlers.get(service);
                if (!handlers || handlers.size === 0) {
                    state.subscribedChannels.delete(channel);
                    subscriber.unsubscribe(channel).catch((err)=>{
                        // eslint-disable-next-line no-console
                        console.error('[RedisEventBus] Failed to unsubscribe from channel:', err);
                    });
                }
            };
        }
    };
}

//# sourceMappingURL=RedisEventBus.js.map