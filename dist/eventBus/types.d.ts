/**
 * Handler for timestamp change notifications.
 */
export type TimestampHandler = (timestamp: number) => void;
/**
 * EventBus interface for timestamp-based coordination between plugins.
 *
 * Used for coordinating service startup:
 * - Payload notifies Better Auth when it's ready via timestamp
 * - Better Auth subscribes to know when to trigger reconciliation
 *
 * Note: User sync is handled entirely by the reconcile queue on the Better Auth side.
 * The queue processes ensure/delete tasks with retries when users change.
 *
 * Implementations:
 * - RedisEventBus: For distributed production deployments using Redis Pub/Sub
 * - SqlitePollingEventBus: For development/single-server using SQLite polling
 */
export interface EventBus {
    /**
     * Notify subscribers that a service timestamp has changed.
     * Used for coordination (e.g., Payload notifying Better Auth it's ready).
     */
    notifyTimestampChange(service: string, timestamp: number): void;
    /**
     * Subscribe to timestamp changes for a service.
     * @returns Unsubscribe function
     */
    subscribeToTimestamp(service: string, handler: TimestampHandler): () => void;
}
