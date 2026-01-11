/**
 * Handler for timestamp change notifications.
 */ /**
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
 */ export { };

//# sourceMappingURL=types.js.map