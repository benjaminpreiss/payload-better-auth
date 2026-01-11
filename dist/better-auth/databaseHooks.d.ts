import type { betterAuth } from 'better-auth';
import type { SanitizedConfig } from 'payload';
export declare function createDatabaseHooks({ config, }: {
    config: Promise<SanitizedConfig>;
}): Parameters<typeof betterAuth>['0']['databaseHooks'];
