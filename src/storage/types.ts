/**
 * Minimal key-value storage interface for Better Auth + Payload synchronization.
 *
 * This interface is intentionally simple - just get/set/delete operations.
 * The plugins handle higher-level concerns (timestamps, sessions, nonces) internally.
 *
 * Compatible with better-auth's SecondaryStorage interface.
 */
export interface SecondaryStorage {
  /**
   * Delete a value by key.
   */
  delete(key: string): Promise<void>

  /**
   * Get a value by key.
   * @returns The value as a string, or null if not found/expired
   */
  get(key: string): Promise<null | string>

  /**
   * Set a value with optional TTL.
   * @param key - The key to store
   * @param value - The value (will be stored as string)
   * @param ttl - Optional time-to-live in seconds
   */
  set(key: string, value: string, ttl?: number): Promise<void>
}

