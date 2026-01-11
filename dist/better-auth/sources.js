// src/sources.ts
import { getPayload } from 'payload';
import { signCanonical } from './crypto-shared';
const INTERNAL_SECRET = process.env.BA_TO_PAYLOAD_SECRET;
/** Create a function to load Payload users page by page via Local API. */ export function createListPayloadUsersPage(config) {
    return async function listPayloadUsersPage(limit, page) {
        const payload = await getPayload({
            config
        });
        const res = await payload.find({
            collection: 'users',
            depth: 0,
            limit,
            overrideAccess: true,
            page
        });
        return {
            hasNextPage: res.hasNextPage || false,
            total: res.totalDocs || 0,
            users: res.docs.map((d)=>({
                    id: d.id,
                    externalId: d.externalId
                }))
        };
    };
}
// Better-auth is the single source of truth and manages users through database hooks
// These functions provide bidirectional validation and sync capabilities
/**
 * Sync user from better-auth to Payload
 * This is called from the better-auth hooks
 * Creates a Payload user with externalId, which prevents reverse sync
 */ /**
 * Create a function to sync user from better-auth to Payload
 * This is called from the better-auth hooks
 * Creates a Payload user with externalId, which prevents reverse sync
 */ export function createSyncUserToPayload(config) {
    return async function syncUserToPayload(betterAuthUser) {
        const payload = await getPayload({
            config
        });
        // idempotency check (keep as-is)
        const existing = await payload.find({
            collection: 'users',
            limit: 1,
            where: {
                externalId: {
                    equals: betterAuthUser.id
                }
            }
        });
        if (existing.docs.length) {
            return;
        }
        const baBody = {
            op: 'create',
            userId: betterAuthUser.id
        } // keep body minimal & stable
        ;
        const baSig = signCanonical(baBody, INTERNAL_SECRET);
        await payload.create({
            collection: 'users',
            context: {
                baBody,
                baSig
            },
            data: {
                name: betterAuthUser.name ?? '',
                externalId: betterAuthUser.id
            },
            overrideAccess: false
        });
    };
}
// Create a function to delete user from Payload
export function createDeleteUserFromPayload(config) {
    return async function deleteUserFromPayload(betterAuthUserId) {
        const payload = await getPayload({
            config
        });
        const existing = await payload.find({
            collection: 'users',
            limit: 1,
            where: {
                externalId: {
                    equals: betterAuthUserId
                }
            }
        });
        if (!existing.docs.length) {
            return;
        }
        const baBody = {
            op: 'delete',
            userId: betterAuthUserId
        };
        const baSig = signCanonical(baBody, INTERNAL_SECRET);
        await payload.delete({
            id: existing.docs[0].id,
            collection: 'users',
            context: {
                baBody,
                baSig
            },
            overrideAccess: false
        });
    };
}
// ——— Optional: link an existing Payload user (id-matched) to BA id
export function createAttachExternalIdInPayload(config) {
    return async function attachExternalIdInPayload(payloadUserId, baId) {
        const payload = await getPayload({
            config
        });
        await payload.update({
            id: payloadUserId,
            collection: 'users',
            data: {
                externalId: baId
            },
            overrideAccess: true
        });
    };
}

//# sourceMappingURL=sources.js.map