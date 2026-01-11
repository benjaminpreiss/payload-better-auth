const LOG_KEY_PREFIX = 'log:msg:';
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
 */ export function createDeduplicatedLogger(options) {
    const { enabled, prefix = '[payload-better-auth]', storage } = options;
    // No-op logger when disabled
    if (!enabled) {
        return {
            always: ()=>{},
            clear: ()=>Promise.resolve(),
            log: ()=>Promise.resolve()
        };
    }
    return {
        always (message, extra) {
            if (extra !== undefined) {
                // eslint-disable-next-line no-console
                console.log(`${prefix} ${message}`, typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra);
            } else {
                // eslint-disable-next-line no-console
                console.log(`${prefix} ${message}`);
            }
        },
        async clear (key) {
            await storage.delete(LOG_KEY_PREFIX + key);
        },
        async log (key, message, extra) {
            const storageKey = LOG_KEY_PREFIX + key;
            // Create a hash of the message + extra for comparison
            const messageHash = extra !== undefined ? `${message}::${JSON.stringify(extra)}` : message;
            // Check if this is the same as the last logged message
            const lastHash = await storage.get(storageKey);
            if (lastHash === messageHash) {
                // Same message, skip logging
                return;
            }
            // Store the new message hash
            await storage.set(storageKey, messageHash);
            // Log the message
            if (extra !== undefined) {
                // eslint-disable-next-line no-console
                console.log(`${prefix} ${message}`, typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra);
            } else {
                // eslint-disable-next-line no-console
                console.log(`${prefix} ${message}`);
            }
        }
    };
}

//# sourceMappingURL=deduplicatedLogger.js.map