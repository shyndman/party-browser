/**
 * Session module for MCP server
 * Re-exports session-related types and utilities
 */

// Re-export from context for session management
export { Context } from "../context";

// Session types can be added here as needed
export interface SessionState {
  connected: boolean;
  tabId?: number;
  url?: string;
  title?: string;
}
