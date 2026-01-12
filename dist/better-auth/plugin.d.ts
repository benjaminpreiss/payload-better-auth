import type { BetterAuthPlugin } from 'better-auth';
import type { SanitizedConfig } from 'payload';
import type { EventBus } from '../eventBus/types';
import type { SecondaryStorage } from '../storage/types';
import { type InitOptions } from './reconcile-queue';
import { type BetterAuthUser } from './sources';
/**
 * Type for the user data that will be written to Payload.
 * Excludes auto-generated fields.
 */
export type PayloadUserData<TUser extends object> = Omit<TUser, 'baUserId' | 'betterAuthAccounts' | 'createdAt' | 'id' | 'updatedAt'>;
export interface PayloadBetterAuthPluginOptions<TUser extends object = Record<string, unknown>, TCollectionSlug extends string = string> extends InitOptions {
    /**
     * Prefix for Better Auth collections in Payload (default: '__better_auth').
     * The collections will be named: {prefix}_email_password, {prefix}_magic_link
     */
    collectionPrefix?: string;
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
    /**
     * Map Better Auth user data to Payload user fields.
     * Called on create AND update - allows filling defaults for schema changes.
     *
     * @example
     * mapUserToPayload: (baUser) => ({
     *   email: baUser.email ?? '',
     *   name: baUser.name ?? 'New User',
     *   role: 'user', // default for new required fields
     * })
     */
    mapUserToPayload: (baUser: BetterAuthUser) => PayloadUserData<TUser>;
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
    /**
     * Slug for the Payload users collection (default: 'users').
     * Must match the collection slug defined in your Payload config.
     */
    usersSlug?: TCollectionSlug;
}
export declare const payloadBetterAuthPlugin: <TUser extends object = Record<string, unknown>, TCollectionSlug extends string = string>(opts: PayloadBetterAuthPluginOptions<TUser, TCollectionSlug>) => BetterAuthPlugin;
