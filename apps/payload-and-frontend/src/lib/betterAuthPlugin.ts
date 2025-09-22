// src/plugins/reconcile-queue-plugin.ts
import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import {
  seedFullReconcile,
  queueStatus,
  enqueueEnsure,
  enqueueDelete,
  type TaskSource,
} from './reconcile-queue'
import { type BAUser } from './sources'

export function reconcileQueuePlugin(opts: {
  token: string // simple header token for admin endpoints
}): BetterAuthPlugin {
  return {
    id: 'reconcile-queue-plugin',
    endpoints: {
      status: createAuthEndpoint('/reconcile/status', { method: 'GET' }, async (ctx) => {
        if (opts.token && ctx.request?.headers.get('x-reconcile-token') !== opts.token) {
          throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
        }
        return ctx.json(queueStatus())
      }),
      run: createAuthEndpoint('/reconcile/run', { method: 'POST' }, async (ctx) => {
        if (opts.token && ctx.request?.headers.get('x-reconcile-token') !== opts.token) {
          throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
        }
        await seedFullReconcile()
        return ctx.json({ ok: true })
      }),
      // convenience for tests/admin tools (optional)
      ensureNow: createAuthEndpoint('/reconcile/ensure', { method: 'POST' }, async (ctx) => {
        if (opts.token && ctx.request?.headers.get('x-reconcile-token') !== opts.token) {
          throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
        }
        const body = (await ctx.request?.json().catch(() => ({}))) as { user?: BAUser } | undefined
        const user = body?.user
        if (!user?.id) throw new APIError('BAD_REQUEST', { message: 'missing user' })
        enqueueEnsure(user, true, 'user-operation')
        return ctx.json({ ok: true })
      }),
      deleteNow: createAuthEndpoint('/reconcile/delete', { method: 'POST' }, async (ctx) => {
        if (opts.token && ctx.request?.headers.get('x-reconcile-token') !== opts.token) {
          throw new APIError('UNAUTHORIZED', { message: 'invalid token' })
        }
        const body = (await ctx.request?.json().catch(() => ({}))) as { baId?: string } | undefined
        const baId = body?.baId
        if (!baId) throw new APIError('BAD_REQUEST', { message: 'missing baId' })
        enqueueDelete(baId, true, 'user-operation')
        return ctx.json({ ok: true })
      }),
    },
  }
}
