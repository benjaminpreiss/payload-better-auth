import { APIError } from 'payload';
import { verifyCanonical } from '../../better-auth/crypto-shared';
import { createBACollectionAccess, createSigVerifier, INTERNAL_SECRET, markNonceUsed, sharedBAFields } from './shared';
/**
 * Creates the Better Auth magic link collection.
 * Stores account data for users who authenticate via magic link.
 */ export function createMagicLinkCollection({ access: customAccess, isVisible = false, prefix = '__better_auth', storage }) {
    const slug = `${prefix}_magic_link`;
    const verifySig = createSigVerifier(storage);
    return {
        slug,
        access: createBACollectionAccess(storage, customAccess),
        admin: {
            defaultColumns: [
                'email',
                'emailVerified',
                'createdAt'
            ],
            group: isVisible ? 'Better Auth (DEBUG)' : undefined,
            hidden: !isVisible,
            useAsTitle: 'email'
        },
        fields: [
            ...sharedBAFields,
            // Join field to display the reverse relationship from users
            // References the polymorphic betterAuthAccounts field
            {
                name: 'user',
                type: 'join',
                collection: 'users',
                on: 'betterAuthAccounts'
            }
        ],
        hooks: {
            beforeChange: [
                async ({ data, operation, originalDoc, req })=>{
                    const sig = req.context.baSig;
                    if (operation === 'create') {
                        const expectedBody = {
                            accountId: data.baAccountId,
                            collection: slug,
                            op: 'create'
                        };
                        if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
                            throw new APIError('This collection is managed by Better Auth.');
                        }
                        await markNonceUsed(storage, sig.nonce);
                    } else if (operation === 'update') {
                        const accountId = originalDoc?.baAccountId || data.baAccountId;
                        const expectedBody = {
                            accountId,
                            collection: slug,
                            op: 'update'
                        };
                        if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
                            throw new APIError('This collection is managed by Better Auth.');
                        }
                        await markNonceUsed(storage, sig.nonce);
                    }
                    return data;
                }
            ],
            beforeDelete: [
                async ({ id, req })=>{
                    // Only check signature if not already verified in access control
                    const sigOk = await verifySig(req);
                    if (!sigOk) {
                        // Allow if custom delete access was granted
                        // The access control already verified either sig OR custom access
                        // But we need the sig for nonce marking if it was a BA operation
                        return;
                    }
                    const sig = req.context.baSig;
                    if (sig) {
                        await markNonceUsed(storage, sig.nonce);
                    }
                }
            ]
        },
        timestamps: true
    };
}

//# sourceMappingURL=magicLink.js.map