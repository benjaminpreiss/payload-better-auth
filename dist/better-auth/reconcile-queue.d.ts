import type { AuthContext } from 'better-auth';
import type { BAUser, BetterAuthAccount, BetterAuthUser, PayloadUser } from './sources';
export interface QueueDeps {
    /** Prefix for Better Auth collections */
    collectionPrefix: string;
    /** Delete user and associated BA collection entries from Payload */
    deleteUserFromPayload: (baId: string) => Promise<void>;
    /** Better Auth internal adapter for fetching users and accounts */
    internalAdapter: AuthContext['internalAdapter'];
    listPayloadUsersPage: (limit: number, page: number) => Promise<{
        hasNextPage: boolean;
        total: number;
        users: PayloadUser[];
    }>;
    log?: (msg: string, extra?: unknown) => void;
    /** Map BA user to Payload user data */
    mapUserToPayload: (baUser: BetterAuthUser) => Record<string, unknown>;
    prunePayloadOrphans?: boolean;
    /** Sync user and BA collection entries to Payload */
    syncUserToPayload: (baUser: BAUser, accounts?: BetterAuthAccount[]) => Promise<void>;
}
export type TaskSource = 'full-reconcile' | 'user-operation';
export interface InitOptions {
    forceReset?: boolean;
    reconcileEveryMs?: number;
    runOnBoot?: boolean;
    tickMs?: number;
}
export declare class Queue {
    private deps;
    private failed;
    private keys;
    private lastError;
    private lastSeedAt;
    private processed;
    private processing;
    private q;
    private reconcileEveryMs;
    private reconcileTimeout;
    private reconciling;
    private tickTimer;
    constructor(deps: QueueDeps, opts?: InitOptions);
    private bumpFront;
    /** Clear all full-reconcile tasks from the queue, preserving user-operation tasks */
    private clearFullReconcileTasks;
    private enqueue;
    private listBAUsersPage;
    private runTask;
    private scheduleNextReconcile;
    /** Paginated approach: process users page by page to reduce memory usage */
    private seedFullReconcilePaginated;
    private tick;
    enqueueDelete(baId: string, priority?: boolean, source?: TaskSource, reconcileId?: string): void;
    enqueueEnsure(user: BAUser, priority?: boolean, source?: TaskSource, reconcileId?: string): void;
    /** Seed tasks by comparing users page by page (Better-Auth → Payload). */
    seedFullReconcile(): Promise<void>;
    start({ reconcileEveryMs, tickMs }?: {
        reconcileEveryMs?: number | undefined;
        tickMs?: number | undefined;
    }): void;
    status(): {
        failed: number;
        fullReconcileTasks: number;
        lastError: string | null;
        lastSeedAt: string | null;
        processed: number;
        processing: boolean;
        queueSize: number;
        reconciling: boolean;
        sampleKeys: string[];
        userOperationTasks: number;
    };
}
