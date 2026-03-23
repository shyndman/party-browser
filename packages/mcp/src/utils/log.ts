/**
 * Core logging functions for the MCP server.
 *
 * All functions log to `console.error` to avoid polluting `stdout`,
 * which is reserved for the MCP JSON-RPC protocol.
 */

/**
 * Error logging (visible by default)
 */
export const errorLog: typeof console.error = (...args) => console.error(...args);

/**
 * Information logging (visible by default)
 */
export const infoLog: typeof console.error = (...args) => console.error(...args);

/**
 * Debug logging (can be toggled or filtered)
 */
export const debugLog: typeof console.error = (...args) => console.error(...args);
