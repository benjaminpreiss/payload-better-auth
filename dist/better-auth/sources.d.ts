import { type SanitizedConfig } from 'payload';
export type BAUser = {
    [k: string]: unknown;
    email?: null | string;
    id: string;
};
export type PayloadUser = {
    baUserId?: null | string;
    id: number | string;
};
export interface BetterAuthUser {
    [k: string]: unknown;
    email?: null | string;
    emailVerified?: boolean;
    id: string;
    name?: null | string;
}
export interface BetterAuthAccount {
    accountId: string;
    createdAt: Date;
    id: string;
    providerId: string;
    updatedAt: Date;
    userId: string;
}
/** Create a function to load Payload users page by page via Local API. */
export declare function createListPayloadUsersPage<TCollectionSlug extends string>(config: Promise<SanitizedConfig>, usersSlug: TCollectionSlug): (limit: number, page: number) => Promise<{
    hasNextPage: boolean;
    total: number;
    users: PayloadUser[];
}>;
/**
 * Create a function to sync user from better-auth to Payload.
 * This handles creating/updating both BA collection entries and the user.
 */
export declare function createSyncUserToPayload<TUser extends object, TCollectionSlug extends string>(config: Promise<SanitizedConfig>, emailPasswordSlug: TCollectionSlug, magicLinkSlug: TCollectionSlug, usersSlug: TCollectionSlug, mapUserToPayload: (baUser: BetterAuthUser) => Omit<TUser, 'baUserId' | 'betterAuthAccounts' | 'createdAt' | 'id' | 'updatedAt'>): (betterAuthUser: BetterAuthUser, accounts?: BetterAuthAccount[]) => Promise<void>;
/** Create a function to delete user from Payload, including BA collection entries. */
export declare function createDeleteUserFromPayload<TCollectionSlug extends string>(config: Promise<SanitizedConfig>, emailPasswordSlug: TCollectionSlug, magicLinkSlug: TCollectionSlug, usersSlug: TCollectionSlug): (betterAuthUserId: string) => Promise<void>;
