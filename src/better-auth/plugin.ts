// src/plugins/reconcile-queue-plugin.ts
import type { AuthContext, BetterAuthPlugin, DeepPartial } from 'better-auth'
import type { SanitizedConfig } from 'payload'

import { APIError } from 'better-auth/api'
import { createAuthEndpoint, createAuthMiddleware } from 'better-auth/plugins'

import type { EventBus } from '../eventBus/types'
import type { SecondaryStorage } from '../storage/types'
import type { AuthMethod } from './helpers'

import { createDeduplicatedLogger } from '../shared/deduplicatedLogger'
import { SESSION_COOKIE_NAME_KEY, TIMESTAMP_PREFIX } from '../storage/keys'
import { type InitOptions, Queue } from './reconcile-queue'
import {
  type BAUser,
  type BetterAuthUser,
  createDeleteUserFromPayload,
  createListPayloadUsersPage,
  createSyncUserToPayload,
} from './sources'

type PayloadSyncPluginContext = { payloadSyncPlugin: { queue: Queue } } & AuthContext

const defaultLog = (msg: string, extra?: unknown) => {
  console.log(`[reconcile] ${msg}`, extra ? JSON.stringify(extra, null, 2) : '')
}

/**
 * Type for the user data that will be written to Payload.
 * Excludes auto-generated fields.
 */
export type PayloadUserData<TUser extends object> = Omit<
  TUser,
  'baUserId' | 'betterAuthAccounts' | 'createdAt' | 'id' | 'updatedAt'
>

export interface PayloadBetterAuthPluginOptions<
  TUser extends object = Record<string, unknown>,
  TCollectionSlug extends string = string,
> extends InitOptions {
  /**
   * Prefix for Better Auth collections in Payload (default: '__better_auth').
   * The collections will be named: {prefix}_email_password, {prefix}_magic_link
   */
  collectionPrefix?: string
  enableLogging?: boolean
  /**
   * EventBus for timestamp-based coordination between plugins.
   * Both plugins MUST share the same eventBus instance.
   *
   * Available implementations:
   * - `createSqlitePollingEventBus()` - Uses SQLite for cross-process coordination
   *
   * @example
   * // Create shared eventBus (e.g., in a separate file)
   * import { createSqlitePollingEventBus } from 'payload-better-auth'
   * import { DatabaseSync } from 'node:sqlite'
   * const db = new DatabaseSync('.event-bus.db')
   * export const eventBus = createSqlitePollingEventBus({ db })
   */
  eventBus: EventBus
  /**
   * Map Better Auth user data to Payload user fields.
   * Called on create AND update - allows filling defaults for schema changes.
   *
   * @example
   * mapUserToPayload: (baUser) => ({
   *   email: baUser.email ?? '',
   *   name: baUser.name ?? 'New User',
   *   role: 'user', // default for new required fields
   * })
   */
  mapUserToPayload: (baUser: BetterAuthUser) => PayloadUserData<TUser>
  payloadConfig: Promise<SanitizedConfig>
  /**
   * Secondary storage for state coordination between Better Auth and Payload.
   * Both plugins MUST share the same storage instance.
   *
   * This storage is automatically passed to Better Auth as `secondaryStorage`,
   * enabling session caching - Payload validates sessions directly from storage
   * without HTTP calls to Better Auth.
   *
   * Available storage adapters:
   * - `createSqliteStorage()` - Uses Node.js 22+ native SQLite (no external dependencies, recommended for dev)
   * - `createRedisStorage(redis)` - Redis-backed, for distributed/multi-server production
   *
   * @example
   * // Create shared storage (e.g., in a separate file)
   * import { createSqliteStorage } from 'payload-better-auth'
   * import { DatabaseSync } from 'node:sqlite'
   * const db = new DatabaseSync('.sync-state.db')
   * export const storage = createSqliteStorage({ db })
   */
  storage: SecondaryStorage
  token: string // simple header token for admin endpoints
  /**
   * Slug for the Payload users collection (default: 'users').
   * Must match the collection slug defined in your Payload config.
   */
  usersSlug?: TCollectionSlug
}

/**
 * Create database hooks that enqueue user changes to the reconciliation queue.
 * All sync operations go through the queue for consistent handling with retries.
 */
function createQueueBasedHooks(queue: Queue) {
  return {
    user: {
      create: {
        after: (user: BAUser): Promise<void> => {
          queue.enqueueEnsure(user, true, 'user-operation')
          return Promise.resolve()
        },
      },
      delete: {
        after: (user: BAUser): Promise<void> => {
          queue.enqueueDelete(user.id, true, 'user-operation')
          return Promise.resolve()
        },
      },
      update: {
        after: (user: BAUser): Promise<void> => {
          queue.enqueueEnsure(user, true, 'user-operation')
          return Promise.resolve()
        },
      },
    },
  }
}

export const payloadBetterAuthPlugin = <
  TUser extends object = Record<string, unknown>,
  TCollectionSlug extends string = string,
>(
  opts: PayloadBetterAuthPluginOptions<TUser, TCollectionSlug>,
): BetterAuthPlugin => {
  const {
    collectionPrefix = '__better_auth',
    eventBus,
    mapUserToPayload,
    storage,
    usersSlug = 'users' as TCollectionSlug,
  } = opts

  // Compute derived collection slugs
  const emailPasswordSlug = `${collectionPrefix}_email_password` as TCollectionSlug
  const magicLinkSlug = `${collectionPrefix}_magic_link` as TCollectionSlug

  // Create deduplicated logger
  const logger = createDeduplicatedLogger({
    enabled: opts.enableLogging ?? false,
    prefix: '[better-auth]',
    storage,
  })

  // Keep the simple log for queue operations (they handle their own deduplication)
  const queueLog = opts.enableLogging ? defaultLog : undefined

  // Track subscription for cleanup
  let unsubscribeFromPayload: (() => void) | null = null

  return {
    id: 'reconcile-queue-plugin',
    endpoints: {
      // convenience for tests/admin tools (optional)
      authMethods: createAuthEndpoint(
        '/auth/methods',
        { method: 'GET' },
        async ({ context, json }) => {
          const authMethods: AuthMethod[] = []
          // Check if emailAndPassword is enabled, or if present at all (not present defaults to false)
          if (context.options.emailAndPassword?.enabled) {
            authMethods.push({
              method: 'emailAndPassword',
              options: {
                minPasswordLength: context.options.emailAndPassword.minPasswordLength ?? 0,
              },
            })
          }
          if (context.options.plugins?.some((p) => p.id === 'magic-link')) {
            authMethods.push({ method: 'magicLink' })
          }

          return await json(authMethods)
        },
      ),
      deleteNow: createAuthEndpoint(
        '/reconcile/delete',
        { method: 'POST' },
        async ({ context, json, request }) => {
          if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
            throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
          }
          const body = (await request?.json().catch(() => ({}))) as { baId?: string } | undefined
          const baId = body?.baId
          if (!baId) {
            throw new APIError('BAD_REQUEST', { message: 'missing baId' })
          }
          ;(context as PayloadSyncPluginContext).payloadSyncPlugin.queue.enqueueDelete(
            baId,
            true,
            'user-operation',
          )
          return json({ ok: true })
        },
      ),
      ensureNow: createAuthEndpoint(
        '/reconcile/ensure',
        { method: 'POST' },
        async ({ context, json, request }) => {
          if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
            throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
          }
          const body = (await request?.json().catch(() => ({}))) as { user?: BAUser } | undefined
          const user = body?.user
          if (!user?.id) {
            throw new APIError('BAD_REQUEST', { message: 'missing user' })
          }
          ;(context as PayloadSyncPluginContext).payloadSyncPlugin.queue.enqueueEnsure(
            user,
            true,
            'user-operation',
          )
          return json({ ok: true })
        },
      ),
      run: createAuthEndpoint(
        '/reconcile/run',
        { method: 'POST' },
        async ({ context, json, request }) => {
          if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
            throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
          }
          await (context as PayloadSyncPluginContext).payloadSyncPlugin.queue.seedFullReconcile()
          return json({ ok: true })
        },
      ),
      status: createAuthEndpoint(
        '/reconcile/status',
        { method: 'GET' },
        async ({ context, json, request }) => {
          if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
            return Promise.reject(
              new APIError('UNAUTHORIZED', { message: 'invalid token' }) as Error,
            )
          }
          return json((context as PayloadSyncPluginContext).payloadSyncPlugin.queue.status())
        },
      ),
      // Warmup endpoint - triggers plugin initialization without auth
      // Returns basic instance info
      warmup: createAuthEndpoint('/warmup', { method: 'GET' }, async ({ context, json }) => {
        const authMethods: string[] = []
        if (context.options.emailAndPassword?.enabled) {
          authMethods.push('emailAndPassword')
        }
        if (context.options.plugins?.some((p) => p.id === 'magic-link')) {
          authMethods.push('magicLink')
        }

        return json({
          authMethods,
          initialized: true,
          pluginId: 'reconcile-queue-plugin',
          timestamp: new Date().toISOString(),
        })
      }),
    },
    hooks: {
      before: [
        {
          handler: createAuthMiddleware(async (ctx) => {
            const locale = ctx.getHeader('User-Locale')
            return Promise.resolve({
              context: { ...ctx, body: { ...ctx.body, locale: locale ?? undefined } },
            })
          }),
          matcher: (context) => {
            return context.path === '/sign-up/email'
          },
        },
      ],
    },
    async init({ internalAdapter, options }) {
      // Always log init start for debugging
      logger.always('Plugin init started')

      // Compute and store the session cookie name for Payload to read
      // This accounts for cookiePrefix, custom cookie names, and __Secure- prefix
      const cookiePrefix = options.advanced?.cookiePrefix ?? 'better-auth'
      const customCookieName = options.advanced?.cookies?.session_token?.name
      // Better Auth uses secure cookies when:
      // 1. Explicitly set via useSecureCookies option
      // 2. NODE_ENV is 'production'
      // 3. baseURL starts with 'https://'
      const isHttps = options.baseURL?.startsWith('https://') ?? false
      const useSecureCookies =
        options.advanced?.useSecureCookies ?? (process.env.NODE_ENV === 'production' || isHttps)

      let sessionCookieName: string
      if (customCookieName) {
        // Custom cookie name takes precedence
        sessionCookieName = useSecureCookies ? `__Secure-${customCookieName}` : customCookieName
      } else {
        // Default format: {prefix}.session_token
        const baseName = `${cookiePrefix}.session_token`
        sessionCookieName = useSecureCookies ? `__Secure-${baseName}` : baseName
      }

      // Store session cookie name in KV for Payload plugin to read
      await storage.set(SESSION_COOKIE_NAME_KEY, sessionCookieName)
      await logger.log('cookie-config', `Session cookie name: ${sessionCookieName}`)

      // Create the reconciliation queue
      const queue = new Queue(
        {
          collectionPrefix,
          deleteUserFromPayload: createDeleteUserFromPayload(
            opts.payloadConfig,
            emailPasswordSlug,
            magicLinkSlug,
            usersSlug,
          ),
          internalAdapter,
          listPayloadUsersPage: createListPayloadUsersPage(opts.payloadConfig, usersSlug),
          log: queueLog,
          mapUserToPayload,
          syncUserToPayload: createSyncUserToPayload(
            opts.payloadConfig,
            emailPasswordSlug,
            magicLinkSlug,
            usersSlug,
            mapUserToPayload,
          ),
        },
        {
          ...opts,
          // Don't run reconcile on boot - we use timestamp-based coordination instead
          runOnBoot: false,
        },
      )

      // Log init (deduplicated)
      await logger.log('init', 'Initialized')

      // Timestamp-based reconciliation coordination
      async function attemptReconciliation(): Promise<void> {
        logger.always('Syncing users to Payload...')
        await storage.set(TIMESTAMP_PREFIX + 'better-auth', String(Date.now()))
        try {
          await queue.seedFullReconcile()
          logger.always('Sync completed successfully')
          // Success - unsubscribe if we were watching
          if (unsubscribeFromPayload) {
            unsubscribeFromPayload()
            unsubscribeFromPayload = null
          }
        } catch (error) {
          logger.always('Sync failed, will retry when Payload restarts', error)
          // Subscribe to Payload timestamp changes if not already
          if (!unsubscribeFromPayload) {
            unsubscribeFromPayload = eventBus.subscribeToTimestamp('payload', () => {
              attemptReconciliation().catch((err) => {
                logger.always('Sync attempt failed', err)
              })
            })
          }
        }
      }

      // Check if Payload is online and started more recently than our last reconcile
      const payloadTsStr = await storage.get(TIMESTAMP_PREFIX + 'payload')
      const baTsStr = await storage.get(TIMESTAMP_PREFIX + 'better-auth')
      const payloadTs = payloadTsStr ? parseInt(payloadTsStr, 10) : null
      const baTs = baTsStr ? parseInt(baTsStr, 10) : null

      // Determine reconciliation state
      logger.always('Checking reconciliation state', {
        baTs: baTs ? new Date(baTs).toISOString() : null,
        payloadTs: payloadTs ? new Date(payloadTs).toISOString() : null,
      })

      if (payloadTs === null) {
        // Payload hasn't started yet
        logger.always('Waiting for Payload to start...')
        unsubscribeFromPayload = eventBus.subscribeToTimestamp('payload', () => {
          attemptReconciliation().catch((err) => {
            logger.always('Sync attempt failed', err)
          })
        })
      } else if (baTs === null) {
        // First run - always sync
        logger.always('First run - triggering initial sync')
        attemptReconciliation().catch((err) => {
          logger.always('Initial sync failed', err)
        })
      } else if (payloadTs > baTs) {
        // Payload restarted since last reconcile - sync needed
        logger.always('Payload restarted - triggering sync')
        attemptReconciliation().catch((err) => {
          logger.always('Sync failed', err)
        })
      } else {
        // Already reconciled and up-to-date
        logger.always('Already synchronized', {
          lastSync: new Date(baTs).toISOString(),
        })
        unsubscribeFromPayload = eventBus.subscribeToTimestamp('payload', () => {
          attemptReconciliation().catch((err) => {
            logger.always('Sync attempt failed', err)
          })
        })
      }

      // Create queue-based database hooks - all user sync goes through the queue
      const queueBasedHooks = createQueueBasedHooks(queue)

      return {
        context: { payloadSyncPlugin: { queue } } as DeepPartial<Omit<AuthContext, 'options'>>,
        options: {
          databaseHooks: queueBasedHooks,
          // Pass storage to Better Auth as secondaryStorage - this makes BA write sessions
          // to the shared storage, allowing Payload to validate sessions directly from cache
          secondaryStorage: storage,
          user: { deleteUser: { enabled: true } },
        },
      }
    },
    schema: {
      user: {
        fields: {
          locale: {
            type: 'string',
            required: false,
          },
        },
      },
    },
  }
}
