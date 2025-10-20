import type { Config } from 'payload'
import type { BetterAuthLoginServerProps } from 'src/components/BetterAuthLoginServer.js'

import { createUsersCollection } from '../collections/Users/index.js'
import { triggerFullReconcile } from '../utils/payload-reconcile.js'

export type BetterAuthPayloadPluginOptions = {
  betterAuthClientOptions: BetterAuthLoginServerProps['authClientOptions']
  disabled?: boolean
  reconcileToken?: string
}

export const betterAuthPayloadPlugin =
  (pluginOptions: BetterAuthPayloadPluginOptions) =>
  (config: Config): Config => {
    const authClientOptions = pluginOptions.betterAuthClientOptions

    const Users = createUsersCollection({
      authClientOptions,
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
          serverProps: { authClientOptions },
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
        additionalHeaders: pluginOptions.betterAuthClientOptions.fetchOptions?.headers,
        betterAuthUrl: pluginOptions.betterAuthClientOptions.baseURL,
        payload,
        reconcileToken: pluginOptions.reconcileToken,
      })
    }

    return config
  }
