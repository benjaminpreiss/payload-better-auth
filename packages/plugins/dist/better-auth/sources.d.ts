import { type SanitizedConfig } from 'payload';
export type BAUser = {
    [k: string]: any;
    email?: null | string;
    id: string;
};
export type PayloadUser = {
    externalId?: null | string;
    id: number | string;
};
export interface BetterAuthUser {
    [k: string]: any;
    email?: null | string;
    id: string;
    name?: null | string;
}
/** Create a function to load Payload users page by page via Local API. */
export declare function createListPayloadUsersPage(config: Promise<SanitizedConfig>): (limit: number, page: number) => Promise<{
    hasNextPage: boolean;
    total: number;
    users: PayloadUser[];
}>;
/**
 * Sync user from better-auth to Payload
 * This is called from the better-auth hooks
 * Creates a Payload user with externalId, which prevents reverse sync
 */
/**
 * Create a function to sync user from better-auth to Payload
 * This is called from the better-auth hooks
 * Creates a Payload user with externalId, which prevents reverse sync
 */
export declare function createSyncUserToPayload(config: Promise<SanitizedConfig>): (betterAuthUser: BetterAuthUser) => Promise<void>;
export declare function createDeleteUserFromPayload(config: Promise<SanitizedConfig>): (betterAuthUserId: string) => Promise<void>;
export declare function createAttachExternalIdInPayload(config: Promise<SanitizedConfig>): (payloadUserId: number | string, baId: string) => Promise<void>;
