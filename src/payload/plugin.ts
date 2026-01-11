import type { ClientOptions } from 'better-auth'
import type { Config } from 'payload'

import { createUsersCollection } from '../collections/Users/index'
import { triggerFullReconcile } from '../utils/payload-reconcile'

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
  reconcileToken?: string
}

export const betterAuthPayloadPlugin =
  (pluginOptions: BetterAuthPayloadPluginOptions) =>
  (config: Config): Config => {
    const { externalBaseURL, internalBaseURL, ...restClientOptions } =
      pluginOptions.betterAuthClientOptions
    const debug = pluginOptions.debug ?? false

    // Build internal and external auth client options
    const internalAuthClientOptions = { ...restClientOptions, baseURL: internalBaseURL }
    const externalAuthClientOptions = { ...restClientOptions, baseURL: externalBaseURL }

    // Log plugin configuration at startup (excluding sensitive data)
    if (debug) {
      console.log('[payload-better-auth] Plugin initializing with configuration:')
      console.log('[payload-better-auth]   - internalBaseURL:', internalBaseURL)
      console.log('[payload-better-auth]   - externalBaseURL:', externalBaseURL)
      console.log('[payload-better-auth]   - disabled:', pluginOptions.disabled ?? false)
      console.log('[payload-better-auth]   - debug:', debug)
      console.log(
        '[payload-better-auth]   - reconcileToken:',
        pluginOptions.reconcileToken ? '[REDACTED]' : 'not set',
      )
      console.log(
        '[payload-better-auth]   - fetchOptions.headers:',
        restClientOptions.fetchOptions?.headers ? '[configured]' : 'not set',
      )
    }

    const Users = createUsersCollection({
      authClientOptions: internalAuthClientOptions,
    })
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
      await triggerFullReconcile({
        additionalHeaders: restClientOptions.fetchOptions?.headers,
        betterAuthUrl: internalBaseURL,
        payload,
        reconcileToken: pluginOptions.reconcileToken,
      })
    }

    return config
  }
