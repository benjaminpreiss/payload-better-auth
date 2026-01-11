import { createAuthClient } from 'better-auth/react';
import { APIError } from 'payload';
import { verifyCanonical } from '../../better-auth/crypto-shared.js';
const INTERNAL_SECRET = process.env.BA_TO_PAYLOAD_SECRET;
const authenticated = ({ req: { user } })=>{
    return Boolean(user);
};
// (optional) simple anti-replay for Local API calls
const seenNonces = new Map();
const TTL = 5 * 60 * 1000;
setInterval(()=>{
    const now = Date.now();
    for (const [k, exp] of seenNonces){
        if (exp < now) {
            seenNonces.delete(k);
        }
    }
}, 60_000).unref();
function basicSigOk(req) {
    const sig = req.context.baSig;
    const body = req.context.baBody;
    if (!sig || !body) {
        return false;
    }
    const ok = verifyCanonical(body, sig, INTERNAL_SECRET);
    if (!ok) {
        return false;
    }
    if (seenNonces.has(sig.nonce)) {
        return false;
    } // replay
    // don't mark used yet; final verification happens in hooks
    return true;
}
export function createUsersCollection({ authClientOptions }) {
    const authClient = createAuthClient(authClientOptions);
    return {
        slug: 'users',
        access: {
            admin: authenticated,
            // Disable manual user management through Payload admin
            // Users can only be managed through better-auth
            create: ({ req })=>basicSigOk(req),
            delete: ({ req })=>basicSigOk(req),
            read: authenticated,
            update: ({ req })=>basicSigOk(req)
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
                        // Validate Better Auth session (cookie/JWT) from headers
                        const session = await authClient.getSession({
                            fetchOptions: {
                                headers
                            }
                        });
                        if (!session.data) {
                            return {
                                user: null
                            };
                        }
                        const externalId = session.data.user.id;
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
                        // mark nonce as used
                        seenNonces.set(sig.nonce, Date.now() + TTL);
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
                        // mark nonce as used
                        seenNonces.set(sig.nonce, Date.now() + TTL);
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
                    seenNonces.set(sig.nonce, Date.now() + TTL);
                }
            ]
        },
        timestamps: true
    };
}

//# sourceMappingURL=index.js.map