/**
 * Message type definitions for PartyBrowser extension
 * WebSocket and content script messaging types
 */

import type { CommandName, CommandParams, CommandResult } from './commands';
import type { ErrorCode } from '@/utils/errors';

// ============================================================================
// WebSocket Messages (MCP Server <-> Extension)
// ============================================================================

/**
 * MCP command message from server
 */
export interface McpCommandMessage {
  type: 'mcpCommand';
  command: CommandName;
  params: CommandParams;
}

/**
 * Direct browser command message (legacy format)
 */
export interface DirectBrowserMessage {
  type: string;
  id?: string;
  payload?: CommandParams;
}

/**
 * Response message to MCP server
 */
export interface McpResponseMessage {
  id?: string;
  success: boolean;
  result?: unknown;
  error?: string;
  errorCode?: ErrorCode;
}

/**
 * Session lost notification
 */
export interface SessionLostMessage {
  type: 'session_lost';
  reason: string;
  message: string;
}

/**
 * Union type for all MCP messages
 */
export type McpMessage =
  | McpCommandMessage
  | DirectBrowserMessage
  | McpResponseMessage
  | SessionLostMessage;

// ============================================================================
// Content Script Messages (Background <-> Content Script)
// ============================================================================

/**
 * Execute command message from background to content script
 */
export interface ExecuteCommandMessage {
  type: 'executeCommand';
  command: CommandName;
  params: CommandParams;
}

/**
 * Get console logs message from background to content script
 */
export interface GetConsoleLogsMessage {
  type: 'getConsoleLogs';
  clear?: boolean;
}

/**
 * Console logs response from content script
 */
export interface ConsoleLogsResponse {
  success: boolean;
  logs: {
    level: 'log' | 'error' | 'warn' | 'info';
    message: string;
    timestamp: number;
    stack?: string;
  }[];
}

/**
 * Union type for content script messages
 */
export type ContentScriptMessage =
  | ExecuteCommandMessage
  | GetConsoleLogsMessage
  | ConsoleLogsResponse
  | CommandResult;

// ============================================================================
// Popup Messages (Popup <-> Background)
// ============================================================================

/**
 * Get status message from popup
 */
export interface GetStatusMessage {
  type: 'getStatus';
}

/**
 * Toggle kill switch message from popup
 */
export interface ToggleKillSwitchMessage {
  type: 'toggleKillSwitch';
}

/**
 * Get kill switch state message
 */
export interface GetKillSwitchStateMessage {
  type: 'getKillSwitchState';
}

/**
 * Status response to popup
 */
export interface StatusResponse {
  isServerRunning: boolean;
  reconnectAttempts: number;
  isKillSwitchEnabled: boolean;
  sessionTabId: number | null;
}

/**
 * Kill switch response
 */
export interface KillSwitchResponse {
  isEnabled: boolean;
  error?: string;
}

/**
 * Union type for popup messages
 */
export type PopupMessage =
  | GetStatusMessage
  | ToggleKillSwitchMessage
  | GetKillSwitchStateMessage
  | StatusResponse
  | KillSwitchResponse;

// ============================================================================
// Runtime Messages (All)
// ============================================================================

/**
 * Union of all runtime message types
 */
export type RuntimeMessage =
  | McpMessage
  | ContentScriptMessage
  | PopupMessage;
