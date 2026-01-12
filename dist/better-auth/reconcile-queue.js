const KEY = (t)=>`${t.kind}:${t.baId}`;
export class Queue {
    deps;
    failed = 0;
    keys = new Map();
    lastError = null;
    lastSeedAt = null;
    processed = 0;
    processing = false;
    q = [];
    reconcileEveryMs = 30 * 60_000 // default 30 minutes
    ;
    reconcileTimeout = null;
    reconciling = false;
    tickTimer = null;
    constructor(deps, opts = {}){
        this.deps = deps;
        // Start timers but don't run reconcile immediately
        this.start({
            reconcileEveryMs: opts?.reconcileEveryMs ?? 30 * 60_000,
            tickMs: opts?.tickMs ?? 1000
        });
        // Defer the initial reconcile to avoid circular dependency issues
        if (opts?.runOnBoot ?? true) {
            // Use setTimeout instead of queueMicrotask to give more time for initialization
            setTimeout(()=>{
                this.seedFullReconcile().catch((err)=>this.deps.log && this.deps.log('[reconcile] seed failed', err));
            }, 2000); // 2 second delay to allow Better Auth and Payload to fully initialize
        }
    }
    bumpFront(task) {
        this.q = [
            task,
            ...this.q.filter((t)=>t !== task)
        ];
    }
    /** Clear all full-reconcile tasks from the queue, preserving user-operation tasks */ clearFullReconcileTasks() {
        const log = this.deps?.log ?? (()=>{});
        const beforeCount = this.q.length;
        const fullReconcileCount = this.q.filter((t)=>t.source === 'full-reconcile').length;
        // Remove full-reconcile tasks from queue and keys map
        this.q = this.q.filter((task)=>{
            if (task.source === 'full-reconcile') {
                this.keys.delete(KEY(task));
                return false;
            }
            return true;
        });
        const afterCount = this.q.length;
        log('reconcile.clear-previous', {
            afterCount,
            beforeCount,
            clearedFullReconcile: fullReconcileCount,
            preservedUserOps: afterCount
        });
    }
    // ——— Internals ———
    enqueue(task, priority) {
        const k = KEY(task);
        const existing = this.keys.get(k);
        if (existing) {
            if (task.kind === 'ensure' && existing.kind === 'ensure' && !existing.baUser && task.baUser) {
                existing.baUser = task.baUser;
            }
            if (priority) {
                this.bumpFront(existing);
            }
            return;
        }
        if (priority) {
            this.q.unshift(task);
        } else {
            this.q.push(task);
        }
        this.keys.set(k, task);
    }
    async listBAUsersPage({ limit, offset }) {
        // sort by newest (used) first
        // when a delete is happening in the meantime, this will lead to some users not being listed (as the index changes)
        // TODO: fix this by maintaining a delete list.
        const total = await this.deps.internalAdapter.countTotalUsers();
        const users = await this.deps.internalAdapter.listUsers(limit, offset, {
            direction: 'desc',
            field: 'updatedAt'
        });
        return {
            total,
            users
        };
    }
    async runTask(t) {
        const log = this.deps?.log ?? (()=>{});
        if (t.kind === 'ensure') {
            log('queue.ensure', {
                attempts: t.attempts,
                baId: t.baId
            });
            // Get user data (either from task or fetch from BA)
            const baUser = t.baUser ?? {
                id: t.baId
            };
            // Fetch accounts from Better Auth for this user
            const accounts = await this.deps.internalAdapter.findAccounts(t.baId);
            // Debug: log what accounts were found
            log('queue.ensure.accounts', {
                accountCount: accounts?.length ?? 0,
                accounts: accounts?.map((a)=>({
                        id: a.id,
                        providerId: a.providerId
                    })),
                baId: t.baId
            });
            // Sync user with accounts to Payload
            await this.deps.syncUserToPayload(baUser, accounts);
            return;
        }
        // delete
        log('queue.delete', {
            attempts: t.attempts,
            baId: t.baId
        });
        await this.deps.deleteUserFromPayload(t.baId);
    }
    scheduleNextReconcile() {
        if (this.reconcileTimeout) {
            clearTimeout(this.reconcileTimeout);
        }
        this.reconcileTimeout = setTimeout(async ()=>{
            if (!this.reconciling) {
                this.reconciling = true;
                try {
                    await this.seedFullReconcile();
                } catch (_error) {
                // Error is already logged in seedFullReconcile
                } finally{
                    this.reconciling = false;
                    // Schedule the next reconcile after this one completes
                    this.scheduleNextReconcile();
                }
            }
        }, this.reconcileEveryMs);
        // Optional unref for Node.js environments to prevent keeping process alive
        if ('unref' in this.reconcileTimeout && typeof this.reconcileTimeout.unref === 'function') {
            this.reconcileTimeout.unref();
        }
    }
    /** Paginated approach: process users page by page to reduce memory usage */ async seedFullReconcilePaginated(reconcileId) {
        const log = this.deps?.log ?? (()=>{});
        const pageSize = 500;
        let baIdSet = null;
        // If we need to prune orphans, we need to collect all BA user IDs
        if (this.deps.prunePayloadOrphans) {
            baIdSet = new Set();
            let baOffset = 0;
            let baTotal = 0;
            do {
                const { total, users: baUsers } = await this.listBAUsersPage({
                    limit: pageSize,
                    offset: baOffset
                });
                baTotal = total;
                // Enqueue ensure tasks for this page with full-reconcile source
                for (const u of baUsers){
                    this.enqueueEnsure(u, false, 'full-reconcile', reconcileId);
                    baIdSet.add(u.id);
                }
                baOffset += baUsers.length;
                log('reconcile.seed.ba-page', {
                    processed: baOffset,
                    reconcileId,
                    total: baTotal
                });
            }while (baOffset < baTotal)
        } else {
            // If not pruning, we can process BA users page by page without storing IDs
            let baOffset = 0;
            let baTotal = 0;
            do {
                // TODO: make sure that we dont go past the window through deletes happening
                // (As a user deletes, the total window size becomes smaller)
                const { total, users: baUsers } = await this.listBAUsersPage({
                    limit: pageSize,
                    offset: baOffset
                });
                baTotal = total;
                // Enqueue ensure tasks for this page with full-reconcile source
                for (const u of baUsers){
                    this.enqueueEnsure(u, false, 'full-reconcile', reconcileId);
                }
                baOffset += baUsers.length;
                log('reconcile.seed.ba-page', {
                    processed: baOffset,
                    reconcileId,
                    total: baTotal
                });
            }while (baOffset < baTotal)
        }
        // Process Payload users page by page for orphan pruning
        if (this.deps.prunePayloadOrphans && baIdSet) {
            let payloadPage = 1;
            let hasNextPage = true;
            while(hasNextPage){
                const { hasNextPage: nextPage, users: pUsers } = await this.deps.listPayloadUsersPage(pageSize, payloadPage);
                hasNextPage = nextPage;
                for (const pu of pUsers){
                    const baId = pu.baUserId?.toString();
                    if (baId && !baIdSet.has(baId)) {
                        this.enqueueDelete(baId, false, 'full-reconcile', reconcileId);
                    }
                }
                payloadPage++;
                log('reconcile.seed.payload-page', {
                    page: payloadPage - 1,
                    reconcileId
                });
            }
        }
    }
    async tick() {
        if (this.processing) {
            return;
        }
        const now = Date.now();
        const idx = this.q.findIndex((t)=>t.nextAt <= now);
        if (idx === -1) {
            return;
        }
        const task = this.q[idx];
        this.processing = true;
        try {
            await this.runTask(task);
            this.q.splice(idx, 1);
            this.keys.delete(KEY(task));
            this.processed++;
        } catch (e) {
            this.failed++;
            this.lastError = e instanceof Error ? e.message : String(e);
            task.attempts += 1;
            const delay = Math.min(60_000, Math.pow(2, task.attempts) * 1000) + Math.floor(Math.random() * 500);
            task.nextAt = now + delay;
        } finally{
            this.processing = false;
        }
    }
    enqueueDelete(baId, priority = false, source = 'user-operation', reconcileId) {
        this.enqueue({
            attempts: 0,
            baId,
            kind: 'delete',
            nextAt: Date.now(),
            reconcileId,
            source
        }, priority);
    }
    // ——— Public enqueue API ———
    enqueueEnsure(user, priority = false, source = 'user-operation', reconcileId) {
        this.enqueue({
            attempts: 0,
            baId: user.id,
            baUser: user,
            kind: 'ensure',
            nextAt: Date.now(),
            reconcileId,
            source
        }, priority);
    }
    /** Seed tasks by comparing users page by page (Better-Auth → Payload). */ async seedFullReconcile() {
        const log = this.deps?.log ?? (()=>{});
        this.lastSeedAt = new Date().toISOString();
        const reconcileId = `reconcile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        log('reconcile.seed.start', {
            reconcileId
        });
        // Clear all previous full-reconcile tasks, but preserve user-operation tasks
        this.clearFullReconcileTasks();
        await this.seedFullReconcilePaginated(reconcileId);
        log('reconcile.seed.done', this.status());
    }
    start({ reconcileEveryMs = 30 * 60_000, tickMs = 1000 } = {}) {
        this.reconcileEveryMs = reconcileEveryMs;
        if (!this.tickTimer) {
            this.tickTimer = setInterval(()=>this.tick(), tickMs);
            // Optional unref for Node.js environments to prevent keeping process alive
            if ('unref' in this.tickTimer && typeof this.tickTimer.unref === 'function') {
                this.tickTimer.unref();
            }
        }
        // Schedule the first reconcile
        this.scheduleNextReconcile();
    }
    status() {
        const userOpCount = this.q.filter((t)=>t.source === 'user-operation').length;
        const fullReconcileCount = this.q.filter((t)=>t.source === 'full-reconcile').length;
        return {
            failed: this.failed,
            fullReconcileTasks: fullReconcileCount,
            lastError: this.lastError,
            lastSeedAt: this.lastSeedAt,
            processed: this.processed,
            processing: this.processing,
            queueSize: this.q.length,
            reconciling: this.reconciling,
            sampleKeys: Array.from(this.keys.keys()).slice(0, 50),
            userOperationTasks: userOpCount
        };
    }
}

//# sourceMappingURL=reconcile-queue.js.map