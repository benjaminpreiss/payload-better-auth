import type { ClientOptions } from 'better-auth';
import type { Access, Config } from 'payload';
import type { EventBus } from '../eventBus/types';
import type { SecondaryStorage } from '../storage/types';
export type BetterAuthClientOptions = {
    /**
     * The external base URL for better-auth, used for client-side requests (from the browser).
     * This should be the publicly accessible URL.
     * @example 'https://auth.example.com'
     */
    externalBaseURL: string;
    /**
     * The internal base URL for better-auth, used for server-side requests.
     * This is used when the server needs to reach better-auth internally (e.g., within a container network).
     * @example 'http://auth-service:3000'
     */
    internalBaseURL: string;
} & Omit<ClientOptions, 'baseURL'>;
export type BetterAuthPayloadPluginOptions = {
    /**
     * Custom access rules for Better Auth collections (email_password, magic_link).
     * These override the default debug-mode access (which allows read for authenticated users).
     *
     * @example
     * baCollectionsAccess: {
     *   read: ({ req }) => req.user?.role === 'admin',
     *   delete: ({ req }) => req.user?.role === 'admin',
     * }
     */
    baCollectionsAccess?: {
        delete?: Access;
        read?: Access;
    };
    betterAuthClientOptions: BetterAuthClientOptions;
    /**
     * Prefix for Better Auth collections (default: '__better_auth').
     * The collections will be named: {prefix}_email_password, {prefix}_magic_link
     */
    collectionPrefix?: string;
    /**
     * Enable debug logging and make BA collections visible in admin.
     * When enabled:
     * - Detailed error information will be logged
     * - BA collections are visible under "Better Auth (DEBUG)" group
     * - Authenticated users can read BA collections (unless baCollectionsAccess overrides)
     */
    debug?: boolean;
    disabled?: boolean;
    /**
     * EventBus for timestamp-based coordination between plugins.
     * Both plugins MUST share the same eventBus instance.
     *
     * Available implementations:
     * - `createSqlitePollingEventBus()` - Uses SQLite for cross-process coordination
     *
     * @example
     * // Create shared eventBus (e.g., in a separate file)
     * import { createSqlitePollingEventBus } from 'payload-better-auth'
     * import { DatabaseSync } from 'node:sqlite'
     * const db = new DatabaseSync('.event-bus.db')
     * export const eventBus = createSqlitePollingEventBus({ db })
     */
    eventBus: EventBus;
    /**
     * Secondary storage for state coordination between Better Auth and Payload.
     * Both plugins MUST share the same storage instance.
     *
     * Available storage adapters:
     * - `createSqliteStorage()` - Uses Node.js 22+ native SQLite (no external dependencies)
     * - `createRedisStorage(redis)` - Redis-backed, for distributed/multi-server production
     *
     * @example
     * // Development (Node.js 22+)
     * import { createSqliteStorage } from 'payload-better-auth'
     * import { DatabaseSync } from 'node:sqlite'
     * const db = new DatabaseSync('.sync-state.db')
     * const storage = createSqliteStorage({ db })
     *
     * @example
     * // Production (distributed)
     * import { createRedisStorage } from 'payload-better-auth'
     * import Redis from 'ioredis'
     * const storage = createRedisStorage({ redis: new Redis() })
     */
    storage: SecondaryStorage;
};
export declare const betterAuthPayloadPlugin: (pluginOptions: BetterAuthPayloadPluginOptions) => (config: Config) => Config;
