import type { AuthContext, BetterAuthPlugin } from 'better-auth';
import type { SanitizedConfig } from 'payload';
import type { EventBus } from '../eventBus/types';
import type { SecondaryStorage } from '../storage/types';
import { type InitOptions } from './reconcile-queue';
type CreateAdminsUser = Parameters<AuthContext['internalAdapter']['createUser']>['0'];
export interface PayloadBetterAuthPluginOptions extends InitOptions {
    createAdmins?: {
        overwrite?: boolean;
        user: CreateAdminsUser;
    }[];
    enableLogging?: boolean;
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
    payloadConfig: Promise<SanitizedConfig>;
    /**
     * Secondary storage for state coordination between Better Auth and Payload.
     * Both plugins MUST share the same storage instance.
     *
     * This storage is automatically passed to Better Auth as `secondaryStorage`,
     * enabling session caching - Payload validates sessions directly from storage
     * without HTTP calls to Better Auth.
     *
     * Available storage adapters:
     * - `createSqliteStorage()` - Uses Node.js 22+ native SQLite (no external dependencies, recommended for dev)
     * - `createRedisStorage(redis)` - Redis-backed, for distributed/multi-server production
     *
     * @example
     * // Create shared storage (e.g., in a separate file)
     * import { createSqliteStorage } from 'payload-better-auth'
     * import { DatabaseSync } from 'node:sqlite'
     * const db = new DatabaseSync('.sync-state.db')
     * export const storage = createSqliteStorage({ db })
     */
    storage: SecondaryStorage;
    token: string;
}
export declare const payloadBetterAuthPlugin: (opts: PayloadBetterAuthPluginOptions) => BetterAuthPlugin;
export {};
