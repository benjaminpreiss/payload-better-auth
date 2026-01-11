import type { CollectionConfig } from 'payload';
import type { SecondaryStorage } from '../../storage/types';
export interface CreateUsersCollectionOptions {
    /**
     * Secondary storage for session validation and nonce protection.
     * Sessions are read directly from storage - no HTTP calls to Better Auth.
     *
     * This must be the same storage instance passed to the Better Auth plugin,
     * as Better Auth writes sessions to this storage via secondaryStorage.
     *
     * @example
     * import { createSqliteStorage } from 'payload-better-auth'
     * import { DatabaseSync } from 'node:sqlite'
     * const db = new DatabaseSync('.sync-state.db')
     * const storage = createSqliteStorage({ db })
     */
    storage: SecondaryStorage;
}
export declare function createUsersCollection({ storage }: CreateUsersCollectionOptions): CollectionConfig;
