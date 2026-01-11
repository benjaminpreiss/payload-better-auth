import { APIError } from 'payload';
import { verifyCanonical } from '../../better-auth/crypto-shared';
const INTERNAL_SECRET = process.env.BA_TO_PAYLOAD_SECRET;
const NONCE_TTL_SECONDS = 5 * 60 // 5 minutes in seconds
;
// Key prefixes for storage
// Better Auth stores sessions WITHOUT a prefix - just the token as the key
const NONCE_PREFIX = 'nonce:';
const authenticated = ({ req: { user } })=>{
    return Boolean(user);
};
/**
 * Extract session token from cookies in headers.
 * Better Auth uses 'better-auth.session_token' cookie by default.
 */ function extractSessionToken(headers) {
    const cookieHeader = headers.get('cookie');
    if (!cookieHeader) {
        return null;
    }
    // Parse cookies
    const cookies = cookieHeader.split(';').reduce((acc, cookie)=>{
        const [key, value] = cookie.trim().split('=');
        if (key && value) {
            acc[key] = decodeURIComponent(value);
        }
        return acc;
    }, {});
    // Better Auth session cookie name
    return cookies['better-auth.session_token'] ?? null;
}
/**
 * Create the signature verification function.
 * Uses storage for nonce checking to prevent replay attacks.
 */ function createSigVerifier(storage) {
    return async function basicSigOk(req) {
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
 */ async function markNonceUsed(storage, nonce) {
    await storage.set(NONCE_PREFIX + nonce, '1', NONCE_TTL_SECONDS);
}
export function createUsersCollection({ storage }) {
    const verifySig = createSigVerifier(storage);
    return {
        slug: 'users',
        access: {
            admin: authenticated,
            // Disable manual user management through Payload admin
            // Users can only be managed through better-auth
            create: async ({ req })=>verifySig(req),
            delete: async ({ req })=>verifySig(req),
            read: authenticated,
            update: async ({ req })=>verifySig(req)
        },
        admin: {
            defaultColumns: [
                'name',
                'email'
            ],
            useAsTitle: 'name'
        },
        auth: {
            disableLocalStrategy: true,
            strategies: [
                {
                    name: 'better-auth',
                    authenticate: async ({ headers, payload })=>{
                        // Get session token from cookie
                        const fullToken = extractSessionToken(headers);
                        if (!fullToken) {
                            return {
                                user: null
                            };
                        }
                        // Better Auth cookie format: "token.signature" - we need just the token part
                        const token = fullToken.split('.')[0];
                        // Read session directly from storage (written by Better Auth)
                        // Better Auth stores sessions with just the token as the key (no prefix)
                        const cached = await storage.get(token);
                        if (!cached) {
                            return {
                                user: null
                            };
                        }
                        let externalId = null;
                        try {
                            const storedSession = JSON.parse(cached);
                            // Check expiration - Better Auth stores expiresAt as ISO string or Date
                            const expiresAt = typeof storedSession.session.expiresAt === 'string' ? new Date(storedSession.session.expiresAt).getTime() : new Date(storedSession.session.expiresAt).getTime();
                            if (expiresAt > Date.now()) {
                                externalId = storedSession.session.userId;
                            }
                        } catch  {
                            // Invalid JSON in storage
                            return {
                                user: null
                            };
                        }
                        if (!externalId) {
                            return {
                                user: null
                            };
                        }
                        // Find or provision the minimal Payload user
                        const existing = await payload.find({
                            collection: 'users',
                            limit: 1,
                            where: {
                                externalId: {
                                    equals: externalId
                                }
                            }
                        });
                        const doc = existing.docs[0] ?? await payload.create({
                            collection: 'users',
                            data: {
                                externalId
                            }
                        });
                        return {
                            user: {
                                collection: 'users',
                                ...doc
                            }
                        };
                    }
                }
            ]
        },
        fields: [
            {
                name: 'externalId',
                type: 'text',
                index: true,
                required: true,
                unique: true
            },
            {
                name: 'name',
                type: 'text'
            }
        ],
        hooks: {
            beforeChange: [
                async ({ data, operation, originalDoc, req })=>{
                    if (operation === 'create') {
                        // authoritative check: tie signature to the actual mutation
                        const sig = req.context.baSig;
                        const expectedBody = {
                            op: 'create',
                            userId: data.externalId
                        };
                        if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
                            return Promise.reject(new APIError('User creation is managed by Better Auth.'));
                        }
                        // mark nonce as used via storage
                        await markNonceUsed(storage, sig.nonce);
                    } else if (operation === 'update') {
                        // authoritative check: tie signature to the actual mutation
                        const sig = req.context.baSig;
                        const userId = originalDoc?.externalId || data.externalId;
                        const expectedBody = {
                            op: 'update',
                            userId
                        };
                        if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
                            return Promise.reject(new APIError('User updates are managed by Better Auth.'));
                        }
                        // mark nonce as used via storage
                        await markNonceUsed(storage, sig.nonce);
                    }
                    return data;
                }
            ],
            beforeDelete: [
                async ({ id, req })=>{
                    // Get the document first to access externalId
                    const doc = await req.payload.findByID({
                        id,
                        collection: 'users'
                    });
                    const sig = req.context.baSig;
                    const expectedBody = {
                        op: 'delete',
                        userId: doc.externalId
                    };
                    if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
                        return Promise.reject(new APIError('User deletion is managed by Better Auth.'));
                    }
                    // mark nonce as used via storage
                    await markNonceUsed(storage, sig.nonce);
                }
            ]
        },
        timestamps: true
    };
}

//# sourceMappingURL=index.js.map