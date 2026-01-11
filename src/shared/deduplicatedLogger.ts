import type { SecondaryStorage } from '../storage/types'

/**
 * A logger that deduplicates messages by storing them in KV storage.
 * Only prints if the message is different from the last logged message for that key.
 */
export interface DeduplicatedLogger {
  /**
   * Always log a message (bypasses deduplication).
   * Use for important events that should always be visible.
   */
  always(message: string, extra?: unknown): void

  /**
   * Clear all stored log state (useful for testing or reset).
   */
  clear(key: string): Promise<void>

  /**
   * Log a message if it's different from the last logged message for this key.
   * @param key - Unique key to deduplicate against (e.g., 'init', 'status')
   * @param message - The message to log
   * @param extra - Optional extra data to include (will be JSON stringified)
   */
  log(key: string, message: string, extra?: unknown): Promise<void>
}

export interface CreateLoggerOptions {
  /**
   * Enable logging. If false, all log calls are no-ops.
   */
  enabled: boolean

  /**
   * Prefix for log messages.
   * @default '[payload-better-auth]'
   */
  prefix?: string

  /**
   * Storage instance for deduplication.
   */
  storage: SecondaryStorage
}

const LOG_KEY_PREFIX = 'log:msg:'

/**
 * Create a deduplicated logger instance.
 *
 * @example
 * const logger = createDeduplicatedLogger({
 *   storage,
 *   enabled: true,
 *   prefix: '[my-plugin]'
 * })
 *
 * // Only logs if message changed
 * await logger.log('status', 'Ready')
 * await logger.log('status', 'Ready') // No output (duplicate)
 * await logger.log('status', 'Syncing...') // Logs (different message)
 *
 * // Always logs
 * logger.always('Important event happened!')
 */
export function createDeduplicatedLogger(options: CreateLoggerOptions): DeduplicatedLogger {
  const { enabled, prefix = '[payload-better-auth]', storage } = options

  // No-op logger when disabled
  if (!enabled) {
    return {
      always: () => {},
      clear: () => Promise.resolve(),
      log: () => Promise.resolve(),
    }
  }

  return {
    always(message: string, extra?: unknown): void {
      if (extra !== undefined) {
        // eslint-disable-next-line no-console
        console.log(
          `${prefix} ${message}`,
          typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra,
        )
      } else {
        // eslint-disable-next-line no-console
        console.log(`${prefix} ${message}`)
      }
    },

    async clear(key: string): Promise<void> {
      await storage.delete(LOG_KEY_PREFIX + key)
    },

    async log(key: string, message: string, extra?: unknown): Promise<void> {
      const storageKey = LOG_KEY_PREFIX + key

      // Create a hash of the message + extra for comparison
      const messageHash = extra !== undefined ? `${message}::${JSON.stringify(extra)}` : message

      // Check if this is the same as the last logged message
      const lastHash = await storage.get(storageKey)
      if (lastHash === messageHash) {
        // Same message, skip logging
        return
      }

      // Store the new message hash
      await storage.set(storageKey, messageHash)

      // Log the message
      if (extra !== undefined) {
        // eslint-disable-next-line no-console
        console.log(
          `${prefix} ${message}`,
          typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra,
        )
      } else {
        // eslint-disable-next-line no-console
        console.log(`${prefix} ${message}`)
      }
    },
  }
}
