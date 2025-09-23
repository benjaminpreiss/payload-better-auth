// src/reconcile-queue.ts
import type { BAUser, PayloadUser } from './sources'
import { AuthContext } from 'better-auth'

export interface QueueDeps {
  // Idempotent effects (via Payload Local API)
  syncUserToPayload: (baUser: BAUser) => Promise<void> // upsert by externalId=baUser.id
  deleteUserFromPayload: (baId: string) => Promise<void> // delete by externalId; ignore missing

  // Paginated loaders (efficient processing)
  listPayloadUsersPage: (
    limit: number,
    page: number,
  ) => Promise<{ users: PayloadUser[]; total: number; hasNextPage: boolean }>
  internalAdapter: AuthContext['internalAdapter']

  // Policy
  prunePayloadOrphans?: boolean // default: false

  // Logging
  log?: (msg: string, extra?: any) => void
}

export type TaskSource = 'user-operation' | 'full-reconcile'

// Bootstrap options interface
export interface InitOptions {
  tickMs?: number
  reconcileEveryMs?: number
  runOnBoot?: boolean
  forceReset?: boolean
}

// Simplified bootstrap state interface (removed processId)
interface BootstrapState {
  isBootstrapped: boolean
  adminHeaders: Headers | null
  bootstrapPromise: Promise<void> | null
}

type Task =
  | {
      kind: 'ensure'
      baId: string
      baUser?: BAUser
      attempts: number
      nextAt: number
      source: TaskSource
      reconcileId?: string
    }
  | {
      kind: 'delete'
      baId: string
      attempts: number
      nextAt: number
      source: TaskSource
      reconcileId?: string
    }

const KEY = (t: Task) => `${t.kind}:${t.baId}`

export class Queue {
  private deps!: QueueDeps
  private q: Task[] = []
  private keys = new Map<string, Task>()
  private processing = false
  private tickTimer: NodeJS.Timeout | null = null
  private reconcileTimeout: NodeJS.Timeout | null = null
  private reconciling = false

  private processed = 0
  private failed = 0
  private lastError: string | null = null
  private lastSeedAt: string | null = null
  private reconcileEveryMs = 30 * 60_000 // default 30 minutes

  // Bootstrap state stored directly on the queue instance
  private bootstrapState: BootstrapState = {
    isBootstrapped: false,
    adminHeaders: null,
    bootstrapPromise: null,
  }

  constructor(deps: QueueDeps, opts: InitOptions = {}) {
    this.deps = deps
    const log = this.deps?.log ?? (() => {})
    // Start bootstrap process - but defer heavy operations
    log('Starting bootstrap process...')

    // Start timers but don't run reconcile immediately
    this.start({
      tickMs: opts?.tickMs ?? 1000,
      reconcileEveryMs: opts?.reconcileEveryMs ?? 30 * 60_000,
    })

    // Defer the initial reconcile to avoid circular dependency issues
    if (opts?.runOnBoot ?? true) {
      // Use setTimeout instead of queueMicrotask to give more time for initialization
      setTimeout(() => {
        this.seedFullReconcile().catch((err) => console.error('[reconcile] seed failed', err))
      }, 2000) // 2 second delay to allow Better Auth and Payload to fully initialize
    }

    log('Bootstrap process completed')
  }

  private async listBAUsersPage({ limit, offset }: { limit: number; offset: number }) {
    // sort by newest (used) first
    // when a delete is happening in the meantime, this will lead to some users not being listed (as the index changes)
    // TODO: fix this by maintaining a delete list.
    const total = await this.deps.internalAdapter.countTotalUsers()
    const users = await this.deps.internalAdapter.listUsers(limit, offset, {
      field: 'updatedAt',
      direction: 'desc',
    })
    return { total, users }
  }

  // Get current instance info
  getInstanceInfo() {
    return {
      isBootstrapped: this.bootstrapState.isBootstrapped,
    }
  }

  start({ tickMs = 1000, reconcileEveryMs = 30 * 60_000 } = {}) {
    this.reconcileEveryMs = reconcileEveryMs

    if (!this.tickTimer) {
      this.tickTimer = setInterval(() => this.tick(), tickMs)
      // Optional unref for Node.js environments to prevent keeping process alive
      if ('unref' in this.tickTimer && typeof this.tickTimer.unref === 'function') {
        this.tickTimer.unref()
      }
    }

    // Schedule the first reconcile
    this.scheduleNextReconcile()
  }

  private scheduleNextReconcile() {
    if (this.reconcileTimeout) {
      clearTimeout(this.reconcileTimeout)
    }

    this.reconcileTimeout = setTimeout(async () => {
      if (!this.reconciling) {
        this.reconciling = true
        try {
          await this.seedFullReconcile()
        } catch (error) {
          // Error is already logged in seedFullReconcile
        } finally {
          this.reconciling = false
          // Schedule the next reconcile after this one completes
          this.scheduleNextReconcile()
        }
      }
    }, this.reconcileEveryMs)

    // Optional unref for Node.js environments to prevent keeping process alive
    if ('unref' in this.reconcileTimeout && typeof this.reconcileTimeout.unref === 'function') {
      this.reconcileTimeout.unref()
    }
  }

  // ——— Public enqueue API ———
  enqueueEnsure(
    user: BAUser,
    priority = false,
    source: TaskSource = 'user-operation',
    reconcileId?: string,
  ) {
    this.enqueue(
      {
        kind: 'ensure',
        baId: user.id,
        baUser: user,
        attempts: 0,
        nextAt: Date.now(),
        source,
        reconcileId,
      },
      priority,
    )
  }
  enqueueDelete(
    baId: string,
    priority = false,
    source: TaskSource = 'user-operation',
    reconcileId?: string,
  ) {
    this.enqueue(
      { kind: 'delete', baId, attempts: 0, nextAt: Date.now(), source, reconcileId },
      priority,
    )
  }

  status() {
    const userOpCount = this.q.filter((t) => t.source === 'user-operation').length
    const fullReconcileCount = this.q.filter((t) => t.source === 'full-reconcile').length

    return {
      queueSize: this.q.length,
      userOperationTasks: userOpCount,
      fullReconcileTasks: fullReconcileCount,
      processing: this.processing,
      reconciling: this.reconciling,
      processed: this.processed,
      failed: this.failed,
      lastError: this.lastError,
      lastSeedAt: this.lastSeedAt,
      sampleKeys: Array.from(this.keys.keys()).slice(0, 50),
    }
  }

  // ——— Internals ———
  private enqueue(task: Task, priority: boolean) {
    const k = KEY(task)
    const existing = this.keys.get(k)
    if (existing) {
      if (task.kind === 'ensure' && existing.kind === 'ensure' && !existing.baUser && task.baUser) {
        existing.baUser = task.baUser
      }
      if (priority) this.bumpFront(existing)
      return
    }
    if (priority) this.q.unshift(task)
    else this.q.push(task)
    this.keys.set(k, task)
  }

  private bumpFront(task: Task) {
    this.q = [task, ...this.q.filter((t) => t !== task)]
  }

  private async tick() {
    if (this.processing) return
    const now = Date.now()
    const idx = this.q.findIndex((t) => t.nextAt <= now)
    if (idx === -1) return
    const task = this.q[idx]
    this.processing = true
    try {
      await this.runTask(task)
      this.q.splice(idx, 1)
      this.keys.delete(KEY(task))
      this.processed++
    } catch (e: any) {
      this.failed++
      this.lastError = e?.message ?? String(e)
      task.attempts += 1
      const delay =
        Math.min(60_000, Math.pow(2, task.attempts) * 1000) + Math.floor(Math.random() * 500)
      task.nextAt = now + delay
    } finally {
      this.processing = false
    }
  }

  private async runTask(t: Task) {
    const log = this.deps?.log ?? (() => {})
    if (t.kind === 'ensure') {
      log('queue.ensure', { baId: t.baId, attempts: t.attempts })
      await this.deps.syncUserToPayload(t.baUser ?? { id: t.baId })
      return
    }
    // delete
    log('queue.delete', { baId: t.baId, attempts: t.attempts })
    await this.deps.deleteUserFromPayload(t.baId)
  }

  /** Seed tasks by comparing users page by page (Better-Auth → Payload). */
  async seedFullReconcile() {
    const log = this.deps?.log ?? (() => {})
    this.lastSeedAt = new Date().toISOString()
    const reconcileId = `reconcile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    log('reconcile.seed.start', { reconcileId })

    // Clear all previous full-reconcile tasks, but preserve user-operation tasks
    this.clearFullReconcileTasks()

    await this.seedFullReconcilePaginated(reconcileId)

    log('reconcile.seed.done', this.status())
  }

  /** Clear all full-reconcile tasks from the queue, preserving user-operation tasks */
  private clearFullReconcileTasks() {
    const log = this.deps?.log ?? (() => {})
    const beforeCount = this.q.length
    const fullReconcileCount = this.q.filter((t) => t.source === 'full-reconcile').length

    // Remove full-reconcile tasks from queue and keys map
    this.q = this.q.filter((task) => {
      if (task.source === 'full-reconcile') {
        this.keys.delete(KEY(task))
        return false
      }
      return true
    })

    const afterCount = this.q.length
    log('reconcile.clear-previous', {
      beforeCount,
      afterCount,
      clearedFullReconcile: fullReconcileCount,
      preservedUserOps: afterCount,
    })
  }

  /** Paginated approach: process users page by page to reduce memory usage */
  private async seedFullReconcilePaginated(reconcileId: string) {
    const log = this.deps?.log ?? (() => {})
    const pageSize = 500
    let baIdSet: Set<string> | null = null

    // If we need to prune orphans, we need to collect all BA user IDs
    if (this.deps.prunePayloadOrphans) {
      baIdSet = new Set<string>()
      let baOffset = 0
      let baTotal = 0

      do {
        const { users: baUsers, total } = await this.listBAUsersPage({
          limit: pageSize,
          offset: baOffset,
        })
        baTotal = total

        // Enqueue ensure tasks for this page with full-reconcile source
        for (const u of baUsers) {
          this.enqueueEnsure(u, false, 'full-reconcile', reconcileId)
          baIdSet.add(u.id)
        }

        baOffset += baUsers.length
        log('reconcile.seed.ba-page', { processed: baOffset, total: baTotal, reconcileId })
      } while (baOffset < baTotal)
    } else {
      // If not pruning, we can process BA users page by page without storing IDs
      let baOffset = 0
      let baTotal = 0

      do {
        // TODO: make sure that we dont go past the window through deletes happening
        // (As a user deletes, the total window size becomes smaller)
        const { users: baUsers, total } = await this.listBAUsersPage({
          limit: pageSize,
          offset: baOffset,
        })
        baTotal = total

        // Enqueue ensure tasks for this page with full-reconcile source
        for (const u of baUsers) this.enqueueEnsure(u, false, 'full-reconcile', reconcileId)

        baOffset += baUsers.length
        log('reconcile.seed.ba-page', { processed: baOffset, total: baTotal, reconcileId })
      } while (baOffset < baTotal)
    }

    // Process Payload users page by page for orphan pruning
    if (this.deps.prunePayloadOrphans && baIdSet) {
      let payloadPage = 1
      let hasNextPage = true

      while (hasNextPage) {
        const { users: pUsers, hasNextPage: nextPage } = await this.deps.listPayloadUsersPage(
          pageSize,
          payloadPage,
        )
        hasNextPage = nextPage

        for (const pu of pUsers) {
          const ext = pu.externalId?.toString()
          if (ext && !baIdSet.has(ext)) {
            this.enqueueDelete(ext, false, 'full-reconcile', reconcileId)
          }
        }

        payloadPage++
        log('reconcile.seed.payload-page', { page: payloadPage - 1, reconcileId })
      }
    }
  }
}
