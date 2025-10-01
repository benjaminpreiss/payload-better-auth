// src/plugins/reconcile-queue-plugin.ts
import type { AuthContext, BetterAuthPlugin } from 'better-auth'
import type { SanitizedConfig } from 'payload'

import { APIError, createAuthEndpoint } from 'better-auth/api'

import { createDatabaseHooks } from './databaseHooks.js'
import { type InitOptions, Queue } from './reconcile-queue.js'
import {
  type BAUser,
  createDeleteUserFromPayload,
  createListPayloadUsersPage,
  createSyncUserToPayload,
} from './sources.js'

type PayloadSyncPluginContext = { payloadSyncPlugin: { queue: Queue } } & AuthContext

type CreateAdminsUser = Parameters<AuthContext['internalAdapter']['createUser']>['0']

const defaultLog = (msg: string, extra?: any) => {
  console.log(`[reconcile] ${msg}`, extra ? JSON.stringify(extra, null, 2) : '')
}

export const payloadBetterAuthPlugin = (
  opts: {
    createAdmins?: { overwrite?: boolean; user: CreateAdminsUser }[]
    payloadConfig: Promise<SanitizedConfig>
    token: string // simple header token for admin endpoints
  } & InitOptions,
): BetterAuthPlugin => {
  return {
    id: 'reconcile-queue-plugin',
    endpoints: {
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
      // convenience for tests/admin tools (optional)
      authMethods: createAuthEndpoint(
        '/auth/methods',
        { method: 'GET' },
        async ({ context, json }) => {
          const authMethods: string[] = []

          // Check if emailAndPassword is enabled, or if present at all (not present defaults to false)
          if (context.options.emailAndPassword?.enabled) {
            authMethods.push('emailAndPassword')
          }

          return await json({ authMethods })
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
    },
    // TODO: the queue must be destroyed on better auth instance destruction, as it utilizes timers.
    async init({ internalAdapter, password }) {
      if (opts.createAdmins) {
        try {
          await Promise.all(
            opts.createAdmins.map(async ({ overwrite, user }) => {
              const alreadyExistingUser = await internalAdapter.findUserByEmail(user.email)
              if (alreadyExistingUser) {
                if (overwrite) {
                  // clear accounts
                  await internalAdapter.deleteAccounts(alreadyExistingUser.user.id)
                  const createdUser = await internalAdapter.updateUser(
                    alreadyExistingUser.user.id,
                    {
                      ...user,
                      role: 'admin',
                    },
                  )
                  // assuming this creates an account?
                  await internalAdapter.linkAccount({
                    accountId: createdUser.id,
                    password: await password.hash(user.password),
                    providerId: 'credential',
                    userId: createdUser.id,
                  })
                }
              }
              // if the user doesnt exist there can't be an account
              else {
                const createdUser = await internalAdapter.createUser({ ...user, role: 'admin' })
                await internalAdapter.linkAccount({
                  accountId: createdUser.id,
                  password: await password.hash(user.password),
                  providerId: 'credential',
                  userId: createdUser.id,
                })
              }
            }),
          )
        } catch (error) {
          defaultLog('Failed to create Admin user', error)
        }
      }

      const queue = new Queue(
        {
          deleteUserFromPayload: createDeleteUserFromPayload(opts.payloadConfig),
          internalAdapter,
          listPayloadUsersPage: createListPayloadUsersPage(opts.payloadConfig),
          log: defaultLog,
          syncUserToPayload: createSyncUserToPayload(opts.payloadConfig),
        },
        opts,
      )
      return {
        context: { payloadSyncPlugin: { queue } },
        options: {
          databaseHooks: createDatabaseHooks({ config: opts.payloadConfig }),
          user: { deleteUser: { enabled: true } },
        },
      }
    },
  }
}
