import type { Access, CollectionConfig } from 'payload';
import type { SecondaryStorage } from '../../storage/types';
export interface CreateEmailPasswordCollectionOptions {
    /**
     * Custom access rules for extensible operations (read, delete).
     * These are OR'd with the BA sync agent check.
     */
    access?: {
        delete?: Access;
        read?: Access;
    };
    /**
     * When true, shows this collection in admin UI under "Better Auth (DEBUG)" group.
     * When false, hides from admin navigation.
     */
    isVisible?: boolean;
    /**
     * Prefix for the collection slug (default: '__better_auth')
     */
    prefix?: string;
    /**
     * Secondary storage for signature verification and nonce protection.
     */
    storage: SecondaryStorage;
}
/**
 * Creates the Better Auth email-password collection.
 * Stores account data for users who authenticate via email and password.
 */
export declare function createEmailPasswordCollection({ access: customAccess, isVisible, prefix, storage, }: CreateEmailPasswordCollectionOptions): CollectionConfig;
