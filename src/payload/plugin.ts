import type { ClientOptions } from 'better-auth'
import type { Config } from 'payload'

import type { EventBus } from '../eventBus/types'
import type { SecondaryStorage } from '../storage/types'

import { createUsersCollection } from '../collections/Users/index'
import { createDeduplicatedLogger } from '../shared/deduplicatedLogger'
import { TIMESTAMP_PREFIX } from '../storage/keys'

export type BetterAuthClientOptions = {
  /**
   * The external base URL for better-auth, used for client-side requests (from the browser).
   * This should be the publicly accessible URL.
   * @example 'https://auth.example.com'
   */
  externalBaseURL: string
  /**
   * The internal base URL for better-auth, used for server-side requests.
   * This is used when the server needs to reach better-auth internally (e.g., within a container network).
   * @example 'http://auth-service:3000'
   */
  internalBaseURL: string
} & Omit<ClientOptions, 'baseURL'>

export type BetterAuthPayloadPluginOptions = {
  betterAuthClientOptions: BetterAuthClientOptions
  /**
   * Enable debug logging for troubleshooting connection issues.
   * When enabled, detailed error information will be logged during auth method fetching.
   */
  debug?: boolean
  disabled?: boolean
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
   * Secondary storage for state coordination between Better Auth and Payload.
   * Both plugins MUST share the same storage instance.
   *
   * Available storage adapters:
   * - `createSqliteStorage()` - Uses Node.js 22+ native SQLite (no external dependencies)
   * - `createRedisStorage(redis)` - Redis-backed, for distributed/multi-server production
   *
   * @example
   * // Development (Node.js 22+)
   * import { createSqliteStorage } from 'payload-better-auth'
   * import { DatabaseSync } from 'node:sqlite'
   * const db = new DatabaseSync('.sync-state.db')
   * const storage = createSqliteStorage({ db })
   *
   * @example
   * // Production (distributed)
   * import { createRedisStorage } from 'payload-better-auth'
   * import Redis from 'ioredis'
   * const storage = createRedisStorage({ redis: new Redis() })
   */
  storage: SecondaryStorage
}

export const betterAuthPayloadPlugin =
  (pluginOptions: BetterAuthPayloadPluginOptions) =>
  (config: Config): Config => {
    const { externalBaseURL, internalBaseURL, ...restClientOptions } =
      pluginOptions.betterAuthClientOptions
    const debug = pluginOptions.debug ?? false
    const { eventBus, storage } = pluginOptions

    // Create deduplicated logger
    const logger = createDeduplicatedLogger({
      enabled: debug,
      prefix: '[payload]',
      storage,
    })

    // Build internal and external auth client options
    const internalAuthClientOptions = { ...restClientOptions, baseURL: internalBaseURL }
    const externalAuthClientOptions = { ...restClientOptions, baseURL: externalBaseURL }

    // Log plugin configuration at startup (deduplicated)
    void logger.log('init', `Initialized (baseURL: ${internalBaseURL})`)

    const Users = createUsersCollection({ storage })
    if (!config.collections) {
      config.collections = [Users]
    } else if (config.collections.find((col) => col.slug === 'users')) {
      throw new Error('Payload-better-auth plugin: Users collection already present')
    } else {
      config.collections.push(Users)
    }

    /**
     * If the plugin is disabled, we still want to keep added collections/fields so the database schema is consistent which is important for migrations.
     * If your plugin heavily modifies the database schema, you may want to remove this property.
     */
    if (pluginOptions.disabled) {
      return config
    }

    if (!config.endpoints) {
      config.endpoints = []
    }

    if (!config.admin) {
      config.admin = {}
    }

    if (!config.admin.user) {
      config.admin.user = Users.slug
    } else if (config.admin.user !== Users.slug) {
      throw new Error(
        'Payload-better-auth plugin: admin.user property already set with conflicting value.',
      )
    }

    if (!config.admin.components) {
      config.admin.components = {}
    }

    if (!config.admin.components.views) {
      config.admin.components.views = {}
    }

    if (!config.admin.components.views.login) {
      config.admin.components.views.login = {
        Component: {
          path: 'payload-better-auth/rsc#BetterAuthLoginServer',
          serverProps: {
            debug,
            externalAuthClientOptions,
            internalAuthClientOptions,
          },
        },
        exact: true,
        path: '/auth',
      }
    } else {
      throw new Error(
        'Payload-better-auth plugin: admin.components.views.login property in config already set.',
      )
    }

    if (!config.admin.components.views.verifyEmail) {
      config.admin.components.views.verifyEmail = {
        Component: 'payload-better-auth/client#VerifyEmailInfoViewClient', // RSC or 'use client' component
        exact: true,
        path: '/auth/verify-email',
      }
    } else {
      throw new Error(
        'Payload-better-auth plugin: admin.components.views.verifyEmail property in config already set.',
      )
    }

    if (!config.admin.routes) {
      config.admin.routes = {}
    }

    if (!config.admin.routes.login) {
      config.admin.routes.login = '/auth'
    } else {
      throw new Error(
        'Payload-better-auth plugin: admin.routes.login property in config already set.',
      )
    }

    const incomingOnInit = config.onInit

    config.onInit = async (payload) => {
      // Ensure we are executing any existing onInit functions before running our own.
      if (incomingOnInit) {
        await incomingOnInit(payload)
      }

      // Set Payload timestamp in storage - Better Auth will see this and trigger reconciliation
      const timestamp = Date.now()
      await storage.set(TIMESTAMP_PREFIX + 'payload', String(timestamp))
      // Also notify via event bus for same-process subscribers
      eventBus.notifyTimestampChange('payload', timestamp)
      await logger.log('ready', 'Ready, waiting for Better Auth to sync')

      // Note: User sync is now handled entirely by the reconcile queue on the Better Auth side.
      // The queue enqueues ensure/delete tasks when users change, and processes them with retries.
    }

    return config
  }
