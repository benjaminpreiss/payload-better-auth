// src/plugins/reconcile-queue-plugin.ts
import type { AuthContext, BetterAuthPlugin, DeepPartial } from 'better-auth'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { Queue, InitOptions } from './reconcile-queue'
import {
  deleteUserFromPayload,
  listPayloadUsersPage,
  syncUserToPayload,
  type BAUser,
} from './sources'

type PayloadSyncPluginContext = AuthContext & { payloadSyncPlugin: { queue: Queue } }

type CreateAdminsUser = Parameters<AuthContext['internalAdapter']['createUser']>['0']

const defaultLog = (msg: string, extra?: any) => {
  console.log(`[reconcile] ${msg}`, extra ? JSON.stringify(extra, null, 2) : '')
}

export function reconcileQueuePlugin(
  opts: {
    token: string // simple header token for admin endpoints
    createAdmins?: { user: CreateAdminsUser; overwrite?: boolean }[]
  } & InitOptions,
): BetterAuthPlugin {
  return {
    id: 'reconcile-queue-plugin',
    endpoints: {
      status: createAuthEndpoint(
        '/reconcile/status',
        { method: 'GET' },
        async ({ request, json, context }) => {
          if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
            throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
          }
          return json((context as PayloadSyncPluginContext).payloadSyncPlugin.queue.status())
        },
      ),
      run: createAuthEndpoint(
        '/reconcile/run',
        { method: 'POST' },
        async ({ request, json, context }) => {
          if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
            throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
          }
          await (context as PayloadSyncPluginContext).payloadSyncPlugin.queue.seedFullReconcile()
          return json({ ok: true })
        },
      ),
      // convenience for tests/admin tools (optional)
      ensureNow: createAuthEndpoint(
        '/reconcile/ensure',
        { method: 'POST' },
        async ({ request, json, context }) => {
          if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
            throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
          }
          const body = (await request?.json().catch(() => ({}))) as { user?: BAUser } | undefined
          const user = body?.user
          if (!user?.id) throw new APIError('BAD_REQUEST', { message: 'missing user' })
          ;(context as PayloadSyncPluginContext).payloadSyncPlugin.queue.enqueueEnsure(
            user,
            true,
            'user-operation',
          )
          return json({ ok: true })
        },
      ),
      deleteNow: createAuthEndpoint(
        '/reconcile/delete',
        { method: 'POST' },
        async ({ request, json, context }) => {
          if (opts.token && request?.headers.get('x-reconcile-token') !== opts.token) {
            throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
          }
          const body = (await request?.json().catch(() => ({}))) as { baId?: string } | undefined
          const baId = body?.baId
          if (!baId) throw new APIError('BAD_REQUEST', { message: 'missing baId' })
          ;(context as PayloadSyncPluginContext).payloadSyncPlugin.queue.enqueueDelete(
            baId,
            true,
            'user-operation',
          )
          return json({ ok: true })
        },
      ),
      authMethods: createAuthEndpoint(
        '/auth/methods',
        { method: 'GET' },
        async ({ context, json }) => {
          const authMethods: string[] = []

          // Check if emailAndPassword is enabled, or if present at all (not present defaults to false)
          if (context.options.emailAndPassword?.enabled) {
            authMethods.push('emailAndPassword')
          }

          return json({ authMethods })
        },
      ),
    },
    // TODO: the queue must be destroyed on better auth instance destruction, as it utilizes timers.
    async init({ internalAdapter, password }) {
      if (opts.createAdmins)
        try {
          await Promise.all(
            opts.createAdmins.map(async ({ user, overwrite }) => {
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
                    userId: createdUser.id,
                    providerId: 'credential',
                    accountId: createdUser.id,
                    password: await password.hash(user.password),
                  })
                }
              }
              // if the user doesnt exist there can't be an account
              else {
                const createdUser = await internalAdapter.createUser({ ...user, role: 'admin' })
                await internalAdapter.linkAccount({
                  userId: createdUser.id,
                  providerId: 'credential',
                  accountId: createdUser.id,
                  password: await password.hash(user.password),
                })
              }
            }),
          )
        } catch (error) {
          defaultLog('Failed to create Admin user', error)
        }

      const queue = new Queue(
        {
          deleteUserFromPayload,
          internalAdapter,
          listPayloadUsersPage,
          syncUserToPayload,
          log: defaultLog,
        },
        opts,
      )
      return { context: { payloadSyncPlugin: { queue } } } as {
        context: DeepPartial<Omit<AuthContext, 'options'>>
      }
    },
  }
}
