import type { CollectionConfig } from 'payload';
import type { SecondaryStorage } from '../../storage/types';
export interface ExtendUsersCollectionOptions {
    /**
     * Prefix for Better Auth collection slugs (default: '__better_auth')
     */
    collectionPrefix?: string;
    /**
     * Secondary storage for session validation and nonce protection.
     * Sessions are read directly from storage - no HTTP calls to Better Auth.
     *
     * This must be the same storage instance passed to the Better Auth plugin,
     * as Better Auth writes sessions to this storage via secondaryStorage.
     */
    storage: SecondaryStorage;
}
/**
 * Extends an existing users collection with Better Auth integration.
 * Merges BA fields, auth strategy, access control, and hooks.
 *
 * @param baseCollection - The developer's existing users collection config (or undefined for minimal)
 * @param options - Extension options including storage
 * @returns Extended collection config with BA integration
 */
export declare function extendUsersCollection(baseCollection: CollectionConfig | undefined, options: ExtendUsersCollectionOptions): CollectionConfig;
/**
 * Creates a minimal users collection with Better Auth integration.
 * Use this when no custom users collection is defined.
 */
export declare function createMinimalUsersCollection(options: ExtendUsersCollectionOptions): CollectionConfig;
