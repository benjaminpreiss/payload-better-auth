// src/reconcile-queue.ts
import type { BAUser, PayloadUser } from './sources'
import {
  listBAUsersPage,
  listPayloadUsersPage,
  syncUserToPayload,
  deleteUserFromPayload,
  createAndGetBAAdminSession,
} from './sources'
import type { Auth } from './auth'

export interface QueueDeps {
  // Idempotent effects (via Payload Local API)
  syncUserToPayload: (baUser: BAUser) => Promise<void> // upsert by externalId=baUser.id
  deleteUserFromPayload: (baId: string) => Promise<void> // delete by externalId; ignore missing

  // Paginated loaders (efficient processing)
  listBAUsersPage: (limit: number, offset: number) => Promise<{ users: BAUser[]; total: number }>
  listPayloadUsersPage: (
    limit: number,
    page: number,
  ) => Promise<{ users: PayloadUser[]; total: number; hasNextPage: boolean }>

  // Policy
  prunePayloadOrphans?: boolean // default: false

  // Logging
  log?: (msg: string, extra?: any) => void
}

export type TaskSource = 'user-operation' | 'full-reconcile'

// Bootstrap options interface
export interface BootstrapOptions {
  tickMs?: number
  reconcileEveryMs?: number
  runOnBoot?: boolean
  forceReset?: boolean
}

// Bootstrap state interface
interface BootstrapState {
  isBootstrapped: boolean
  adminHeaders: Headers | null
  processId: string | null
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

class Queue {
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
    processId: null,
    bootstrapPromise: null,
  }

  init(deps: QueueDeps) {
    this.deps = deps
  }

  async bootstrap(auth: Auth, opts: BootstrapOptions = {}) {
    // Allow forced reset for testing or when explicitly requested
    if (opts?.forceReset) {
      console.log('[reconcile] Force reset requested, clearing bootstrap state...')
      this.bootstrapState.isBootstrapped = false
      this.bootstrapState.adminHeaders = null
      this.bootstrapState.processId = null
      this.bootstrapState.bootstrapPromise = null
    }

    // If already bootstrapped, return immediately
    if (this.bootstrapState.isBootstrapped && this.bootstrapState.adminHeaders) {
      console.log(
        `[reconcile] Already bootstrapped for process ${this.bootstrapState.processId}, reusing existing session...`,
      )
      return
    }

    // If bootstrap is in progress, wait for it to complete
    if (this.bootstrapState.bootstrapPromise) {
      console.log('[reconcile] Bootstrap already in progress, waiting for completion...')
      await this.bootstrapState.bootstrapPromise
      return
    }

    // Start bootstrap process
    console.log('[reconcile] Starting bootstrap process...')
    this.bootstrapState.bootstrapPromise = this.performBootstrap(auth, opts)

    try {
      await this.bootstrapState.bootstrapPromise
    } finally {
      // Clear the promise once bootstrap is complete (success or failure)
      this.bootstrapState.bootstrapPromise = null
    }
  }

  private async performBootstrap(auth: Auth, opts: BootstrapOptions) {
    try {
      console.log('[reconcile] Bootstrapping reconcile system...')

      // Create admin session for this process
      const { headers, processId } = await createAndGetBAAdminSession({ auth })
      this.bootstrapState.adminHeaders = headers
      this.bootstrapState.processId = processId
      this.bootstrapState.isBootstrapped = true

      console.log(`[reconcile] Created admin session for process: ${processId}`)

      this.init({
        listBAUsersPage: (limit, offset) =>
          listBAUsersPage(auth, limit, offset, this.bootstrapState.adminHeaders!),
        listPayloadUsersPage,
        syncUserToPayload,
        deleteUserFromPayload,
        prunePayloadOrphans: process.env.RECONCILE_PRUNE === 'true',
        log: (m, x) => console.log(`[reconcile:${processId}] ${m}`, x ?? ''),
      })

      this.start({
        tickMs: opts?.tickMs ?? 1000,
        reconcileEveryMs: opts?.reconcileEveryMs ?? 30 * 60_000,
      })

      if (opts?.runOnBoot ?? true) {
        queueMicrotask(() =>
          this.seedFullReconcile().catch((err) =>
            console.error(`[reconcile:${processId}] seed failed`, err),
          ),
        )
      }

      console.log(`[reconcile:${processId}] Bootstrap completed successfully`)
    } catch (error) {
      console.error('[reconcile] Bootstrap failed:', error)
      this.bootstrapState.isBootstrapped = false // Reset flag on failure
      throw error
    }
  }

  // Reset bootstrap state (useful for testing)
  resetBootstrapState() {
    this.bootstrapState.isBootstrapped = false
    this.bootstrapState.adminHeaders = null
    this.bootstrapState.processId = null
    this.bootstrapState.bootstrapPromise = null
    console.log('[reconcile] Bootstrap state reset')
  }

  // Get current instance info
  getInstanceInfo() {
    return {
      isBootstrapped: this.bootstrapState.isBootstrapped,
      processId: this.bootstrapState.processId,
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
        const { users: baUsers, total } = await this.deps.listBAUsersPage(pageSize, baOffset)
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
        const { users: baUsers, total } = await this.deps.listBAUsersPage(pageSize, baOffset)
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

// Singleton & helpers
export const reconcileQueue = new Queue()

// Bootstrap function - main entry point
export const bootstrapReconcile = (auth: Auth, opts?: BootstrapOptions) =>
  reconcileQueue.bootstrap(auth, opts)

// Legacy function for backward compatibility
export const initReconcileQueue = (
  deps: QueueDeps,
  timers?: { tickMs?: number; reconcileEveryMs?: number },
) => {
  reconcileQueue.init(deps)
  reconcileQueue.start(timers)
}

export const enqueueEnsure = (
  u: BAUser,
  priority = false,
  source: TaskSource = 'user-operation',
  reconcileId?: string,
) => reconcileQueue.enqueueEnsure(u, priority, source, reconcileId)

export const enqueueDelete = (
  baId: string,
  priority = false,
  source: TaskSource = 'user-operation',
  reconcileId?: string,
) => reconcileQueue.enqueueDelete(baId, priority, source, reconcileId)

export const seedFullReconcile = () => reconcileQueue.seedFullReconcile()
export const queueStatus = () => reconcileQueue.status()

// Bootstrap utility functions
export const resetBootstrapState = () => reconcileQueue.resetBootstrapState()
export const getInstanceInfo = () => reconcileQueue.getInstanceInfo()
