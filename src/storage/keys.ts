/**
 * Shared KV storage key constants.
 * Used across Better Auth plugin, Payload plugin, and Users collection.
 */

/** Prefix for timestamp-based coordination between plugins */
export const TIMESTAMP_PREFIX = 'timestamp:'

/** Key for storing the session cookie name (set by Better Auth, read by Payload) */
export const SESSION_COOKIE_NAME_KEY = 'config:sessionCookieName'

/** Prefix for nonce storage (replay attack prevention) */
export const NONCE_PREFIX = 'nonce:'

/** Prefix for deduplicated log messages */
export const LOG_KEY_PREFIX = 'log:msg:'
