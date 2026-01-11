/**
 * Shared EventBus instance for development.
 * Both the Payload plugin and Better Auth plugin must use the SAME eventBus
 * for real-time event delivery to work.
 *
 * Using SQLite-backed EventBus with polling for cross-process communication.
 * This works correctly even when Turbopack spawns multiple worker processes.
 */
import { DatabaseSync } from 'node:sqlite'
import { createSqlitePollingEventBus } from 'payload-better-auth/eventBus'

const db = new DatabaseSync('.event-bus.db')

export const eventBus = createSqlitePollingEventBus({ db })
