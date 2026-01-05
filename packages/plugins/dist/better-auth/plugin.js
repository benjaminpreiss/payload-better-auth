// src/plugins/reconcile-queue-plugin.ts
import { APIError } from 'better-auth/api';
import { createAuthEndpoint, createAuthMiddleware } from 'better-auth/plugins';
import { createDatabaseHooks } from './databaseHooks.js';
import { Queue } from './reconcile-queue.js';
import { createDeleteUserFromPayload, createListPayloadUsersPage, createSyncUserToPayload } from './sources.js';
const defaultLog = (msg, extra)=>{
    console.log(`[reconcile] ${msg}`, extra ? JSON.stringify(extra, null, 2) : '');
};
export const payloadBetterAuthPlugin = (opts)=>{
    return {
        id: 'reconcile-queue-plugin',
        endpoints: {
            run: createAuthEndpoint('/reconcile/run', {
                method: 'POST'
            }, async ({ context, json, request })=>{
                if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
                    throw new APIError('UNAUTHORIZED', {
                        message: 'invalid token'
                    });
                }
                await context.payloadSyncPlugin.queue.seedFullReconcile();
                return json({
                    ok: true
                });
            }),
            status: createAuthEndpoint('/reconcile/status', {
                method: 'GET'
            }, async ({ context, json, request })=>{
                if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
                    return Promise.reject(new APIError('UNAUTHORIZED', {
                        message: 'invalid token'
                    }));
                }
                return json(context.payloadSyncPlugin.queue.status());
            }),
            // convenience for tests/admin tools (optional)
            authMethods: createAuthEndpoint('/auth/methods', {
                method: 'GET'
            }, async ({ context, json })=>{
                const authMethods = [];
                // Check if emailAndPassword is enabled, or if present at all (not present defaults to false)
                if (context.options.emailAndPassword?.enabled) {
                    authMethods.push({
                        method: 'emailAndPassword',
                        options: {
                            minPasswordLength: context.options.emailAndPassword.minPasswordLength ?? 0
                        }
                    });
                }
                if (context.options.plugins?.some((p)=>p.id === 'magic-link')) {
                    authMethods.push({
                        method: 'magicLink'
                    });
                }
                return await json(authMethods);
            }),
            deleteNow: createAuthEndpoint('/reconcile/delete', {
                method: 'POST'
            }, async ({ context, json, request })=>{
                if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
                    throw new APIError('UNAUTHORIZED', {
                        message: 'invalid token'
                    });
                }
                const body = await request?.json().catch(()=>({}));
                const baId = body?.baId;
                if (!baId) {
                    throw new APIError('BAD_REQUEST', {
                        message: 'missing baId'
                    });
                }
                ;
                context.payloadSyncPlugin.queue.enqueueDelete(baId, true, 'user-operation');
                return json({
                    ok: true
                });
            }),
            ensureNow: createAuthEndpoint('/reconcile/ensure', {
                method: 'POST'
            }, async ({ context, json, request })=>{
                if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
                    throw new APIError('UNAUTHORIZED', {
                        message: 'invalid token'
                    });
                }
                const body = await request?.json().catch(()=>({}));
                const user = body?.user;
                if (!user?.id) {
                    throw new APIError('BAD_REQUEST', {
                        message: 'missing user'
                    });
                }
                ;
                context.payloadSyncPlugin.queue.enqueueEnsure(user, true, 'user-operation');
                return json({
                    ok: true
                });
            })
        },
        hooks: {
            before: [
                {
                    handler: createAuthMiddleware(async (ctx)=>{
                        const locale = ctx.getHeader('User-Locale');
                        return Promise.resolve({
                            context: {
                                ...ctx,
                                body: {
                                    ...ctx.body,
                                    locale: locale ?? undefined
                                }
                            }
                        });
                    }),
                    matcher: (context)=>{
                        return context.path === '/sign-up/email';
                    }
                }
            ]
        },
        schema: {
            user: {
                fields: {
                    locale: {
                        type: 'string',
                        required: false
                    }
                }
            }
        },
        // TODO: the queue must be destroyed on better auth instance destruction, as it utilizes timers.
        async init ({ internalAdapter, password }) {
            if (opts.createAdmins) {
                try {
                    await Promise.all(opts.createAdmins.map(async ({ overwrite, user })=>{
                        const alreadyExistingUser = await internalAdapter.findUserByEmail(user.email);
                        if (alreadyExistingUser) {
                            if (overwrite) {
                                // clear accounts
                                await internalAdapter.deleteAccounts(alreadyExistingUser.user.id);
                                const createdUser = await internalAdapter.updateUser(alreadyExistingUser.user.id, {
                                    ...user,
                                    role: 'admin'
                                });
                                // assuming this creates an account?
                                await internalAdapter.linkAccount({
                                    accountId: createdUser.id,
                                    password: await password.hash(user.password),
                                    providerId: 'credential',
                                    userId: createdUser.id
                                });
                            }
                        } else {
                            const createdUser = await internalAdapter.createUser({
                                ...user,
                                role: 'admin'
                            });
                            await internalAdapter.linkAccount({
                                accountId: createdUser.id,
                                password: await password.hash(user.password),
                                providerId: 'credential',
                                userId: createdUser.id
                            });
                        }
                    }));
                } catch (error) {
                    if (opts.enableLogging) {
                        defaultLog('Failed to create Admin user', error);
                    }
                }
            }
            const queue = new Queue({
                deleteUserFromPayload: createDeleteUserFromPayload(opts.payloadConfig),
                internalAdapter,
                listPayloadUsersPage: createListPayloadUsersPage(opts.payloadConfig),
                log: opts.enableLogging ? defaultLog : undefined,
                syncUserToPayload: createSyncUserToPayload(opts.payloadConfig)
            }, opts);
            return {
                context: {
                    payloadSyncPlugin: {
                        queue
                    }
                },
                options: {
                    databaseHooks: createDatabaseHooks({
                        config: opts.payloadConfig
                    }),
                    user: {
                        deleteUser: {
                            enabled: true
                        }
                    }
                }
            };
        }
    };
};

//# sourceMappingURL=plugin.js.map