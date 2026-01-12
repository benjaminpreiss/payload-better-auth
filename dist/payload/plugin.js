import { createEmailPasswordCollection } from '../collections/BetterAuth/emailPassword';
import { createMagicLinkCollection } from '../collections/BetterAuth/magicLink';
import { extendUsersCollection } from '../collections/Users/index';
import { createDeduplicatedLogger } from '../shared/deduplicatedLogger';
import { TIMESTAMP_PREFIX } from '../storage/keys';
export const betterAuthPayloadPlugin = (pluginOptions)=>(config)=>{
        const { externalBaseURL, internalBaseURL, ...restClientOptions } = pluginOptions.betterAuthClientOptions;
        const debug = pluginOptions.debug ?? false;
        const collectionPrefix = pluginOptions.collectionPrefix ?? '__better_auth';
        const { baCollectionsAccess, eventBus, storage } = pluginOptions;
        // Create deduplicated logger
        const logger = createDeduplicatedLogger({
            enabled: debug,
            prefix: '[payload]',
            storage
        });
        // Build internal and external auth client options
        const internalAuthClientOptions = {
            ...restClientOptions,
            baseURL: internalBaseURL
        };
        const externalAuthClientOptions = {
            ...restClientOptions,
            baseURL: externalBaseURL
        };
        // Log plugin configuration at startup (deduplicated)
        void logger.log('init', `Initialized (baseURL: ${internalBaseURL})`);
        // Determine BA collection access:
        // 1. If baCollectionsAccess is provided, use it (overrides debug defaults)
        // 2. If debug is enabled, allow authenticated users to read
        // 3. Otherwise, no custom access (only BA sync agent)
        const effectiveBaAccess = baCollectionsAccess ? baCollectionsAccess : debug ? {
            read: ({ req })=>Boolean(req.user)
        } : undefined;
        // Initialize collections array if not present
        if (!config.collections) {
            config.collections = [];
        }
        // Create BA collections
        const emailPasswordCollection = createEmailPasswordCollection({
            access: effectiveBaAccess,
            isVisible: debug,
            prefix: collectionPrefix,
            storage
        });
        const magicLinkCollection = createMagicLinkCollection({
            access: effectiveBaAccess,
            isVisible: debug,
            prefix: collectionPrefix,
            storage
        });
        // Find and extend existing users collection, or create minimal one
        const existingUsersIndex = config.collections.findIndex((col)=>col.slug === 'users');
        const existingUsersCollection = existingUsersIndex >= 0 ? config.collections[existingUsersIndex] : undefined;
        const extendedUsersCollection = extendUsersCollection(existingUsersCollection, {
            collectionPrefix,
            storage
        });
        // Replace or add the users collection
        if (existingUsersIndex >= 0) {
            config.collections[existingUsersIndex] = extendedUsersCollection;
        } else {
            config.collections.push(extendedUsersCollection);
        }
        // Add BA collections
        config.collections.push(emailPasswordCollection);
        config.collections.push(magicLinkCollection);
        /**
     * If the plugin is disabled, we still want to keep added collections/fields so the database schema is consistent which is important for migrations.
     * If your plugin heavily modifies the database schema, you may want to remove this property.
     */ if (pluginOptions.disabled) {
            return config;
        }
        if (!config.endpoints) {
            config.endpoints = [];
        }
        if (!config.admin) {
            config.admin = {};
        }
        if (!config.admin.user) {
            config.admin.user = extendedUsersCollection.slug;
        } else if (config.admin.user !== extendedUsersCollection.slug) {
            throw new Error('Payload-better-auth plugin: admin.user property already set with conflicting value.');
        }
        if (!config.admin.components) {
            config.admin.components = {};
        }
        if (!config.admin.components.views) {
            config.admin.components.views = {};
        }
        if (!config.admin.components.views.login) {
            config.admin.components.views.login = {
                Component: {
                    path: 'payload-better-auth/rsc#BetterAuthLoginServer',
                    serverProps: {
                        debug,
                        externalAuthClientOptions,
                        internalAuthClientOptions
                    }
                },
                exact: true,
                path: '/auth'
            };
        } else {
            throw new Error('Payload-better-auth plugin: admin.components.views.login property in config already set.');
        }
        if (!config.admin.components.views.verifyEmail) {
            config.admin.components.views.verifyEmail = {
                Component: 'payload-better-auth/client#VerifyEmailInfoViewClient',
                exact: true,
                path: '/auth/verify-email'
            };
        } else {
            throw new Error('Payload-better-auth plugin: admin.components.views.verifyEmail property in config already set.');
        }
        // Configure custom logout button that signs out from Better Auth
        if (!config.admin.components.logout) {
            config.admin.components.logout = {};
        }
        if (!config.admin.components.logout.Button) {
            config.admin.components.logout.Button = {
                clientProps: {
                    authClientOptions: externalAuthClientOptions
                },
                path: 'payload-better-auth/client#LogoutButtonClient'
            };
        } else {
            throw new Error('Payload-better-auth plugin: admin.components.logout.Button property in config already set.');
        }
        if (!config.admin.routes) {
            config.admin.routes = {};
        }
        if (!config.admin.routes.login) {
            config.admin.routes.login = '/auth';
        } else {
            throw new Error('Payload-better-auth plugin: admin.routes.login property in config already set.');
        }
        const incomingOnInit = config.onInit;
        config.onInit = async (payload)=>{
            // Ensure we are executing any existing onInit functions before running our own.
            if (incomingOnInit) {
                await incomingOnInit(payload);
            }
            // Set Payload timestamp in storage - Better Auth will see this and trigger reconciliation
            const timestamp = Date.now();
            await storage.set(TIMESTAMP_PREFIX + 'payload', String(timestamp));
            // Also notify via event bus for same-process subscribers
            eventBus.notifyTimestampChange('payload', timestamp);
            await logger.log('ready', 'Ready, triggering Better Auth initialization');
            // Trigger Better Auth initialization by calling the warmup endpoint
            // Better Auth plugins are lazy-initialized on first request
            try {
                const warmupUrl = `${internalBaseURL}/api/auth/warmup`;
                const response = await fetch(warmupUrl, {
                    headers: {
                        'User-Agent': 'Payload-Better-Auth-Warmup'
                    },
                    method: 'GET'
                });
                if (response.ok) {
                    const info = await response.json();
                    await logger.log('warmup', 'Better Auth initialized', {
                        authMethods: info.authMethods
                    });
                } else {
                    await logger.log('warmup-error', 'Better Auth warmup returned error', {
                        status: response.status
                    });
                }
            } catch (error) {
                // Log but don't fail - Better Auth will initialize on first real request
                await logger.log('warmup-error', 'Failed to warm up Better Auth (will init on first request)', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        // Note: User sync is now handled entirely by the reconcile queue on the Better Auth side.
        // The queue enqueues ensure/delete tasks when users change, and processes them with retries.
        };
        return config;
    };

//# sourceMappingURL=plugin.js.map