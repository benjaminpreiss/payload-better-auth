import type { CollectionConfig } from 'payload';
import { createAuthClient } from 'better-auth/react';
export declare function createUsersCollection({ authClientOptions, }: {
    authClientOptions: Parameters<typeof createAuthClient>['0'];
}): CollectionConfig;
