import { verifyCanonical } from '../../better-auth/crypto-shared';
import { NONCE_PREFIX } from '../../storage/keys';
const INTERNAL_SECRET = process.env.BA_TO_PAYLOAD_SECRET;
const NONCE_TTL_SECONDS = 5 * 60 // 5 minutes in seconds
;
/**
 * Create the signature verification function for BA sync operations.
 * Uses storage for nonce checking to prevent replay attacks.
 */ export function createSigVerifier(storage) {
    return async function verifySig(req) {
        const sig = req.context.baSig;
        const body = req.context.baBody;
        if (!sig || !body) {
            return false;
        }
        // Verify HMAC signature (includes timestamp check)
        const ok = verifyCanonical(body, sig, INTERNAL_SECRET);
        if (!ok) {
            return false;
        }
        // Check nonce for replay protection
        const alreadyUsed = await storage.get(NONCE_PREFIX + sig.nonce);
        if (alreadyUsed !== null) {
            return false // replay detected
            ;
        }
        return true;
    };
}
/**
 * Mark a nonce as used via secondary storage.
 */ export async function markNonceUsed(storage, nonce) {
    await storage.set(NONCE_PREFIX + nonce, '1', NONCE_TTL_SECONDS);
}
/**
 * Create access control for BA collections.
 * - create/update: BA sync agent only (non-extensible)
 * - read/delete: BA sync agent only by default, can be extended via custom access
 * Handles both sync and async access functions from developers.
 */ export function createBACollectionAccess(storage, customAccess) {
    const verifySig = createSigVerifier(storage);
    return {
        // Create: BA sync agent only - NOT extensible
        create: async ({ req })=>verifySig(req),
        // Delete: BA sync agent OR custom access (handles both sync and async)
        delete: async (args)=>{
            const sigOk = await verifySig(args.req);
            if (sigOk) {
                return true;
            }
            if (customAccess?.delete) {
                return await Promise.resolve(customAccess.delete(args));
            }
            return false;
        },
        // Read: BA sync agent OR custom access (handles both sync and async)
        read: async (args)=>{
            const sigOk = await verifySig(args.req);
            if (sigOk) {
                return true;
            }
            if (customAccess?.read) {
                return await Promise.resolve(customAccess.read(args));
            }
            return false;
        },
        // Update: BA sync agent only - NOT extensible
        update: async ({ req })=>verifySig(req)
    };
}
/**
 * Shared fields for all BA collections.
 * All fields are read-only in the admin UI.
 */ export const sharedBAFields = [
    {
        name: 'baAccountId',
        type: 'text',
        admin: {
            readOnly: true
        },
        index: true,
        required: true,
        unique: true
    },
    {
        name: 'baUserId',
        type: 'text',
        admin: {
            readOnly: true
        },
        index: true,
        required: true
    },
    {
        name: 'email',
        type: 'email',
        admin: {
            readOnly: true
        },
        required: true
    },
    {
        name: 'emailVerified',
        type: 'checkbox',
        admin: {
            readOnly: true
        },
        defaultValue: false
    }
];
export { INTERNAL_SECRET };

//# sourceMappingURL=shared.js.map