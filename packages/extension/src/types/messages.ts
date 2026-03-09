/**
 * Message type definitions for PartyBrowser extension
 * Hub/control-plane, content script, and popup messaging contracts
 */

import type { CommandName, CommandParams, CommandResult } from './commands';
import type { ErrorCode } from '@/utils/errors';

export const WsMessageKinds = {
  SESSION_COMMAND: 'session_command',
  SESSION_RESULT: 'session_result',
  CONTROL_EVENT: 'control_event',
  CONTROL_COMMAND: 'control_command',
  CONTROL_RESPONSE: 'control_response',
  ERROR: 'error',
} as const;

export const ControlEvents = {
  SESSION_APPROVED: 'session.approved',
  SESSION_REVOKED: 'session.revoked',
  SESSIONS_REVOKED_ALL: 'session.revoke_all',
  WAITING_ROOM_SYNC: 'waiting_room.sync',
  WAITING_ROOM_ENTRY_ADDED: 'waiting_room.entry_added',
  WAITING_ROOM_ENTRY_REMOVED: 'waiting_room.entry_removed',
  KILL_SWITCH_CHANGED: 'kill_switch.changed',
} as const;

export const ControlCommands = {
  WAITING_ROOM_LIST: 'waiting_room.list',
  WAITING_ROOM_DECIDE: 'waiting_room.decide',
  KILL_SWITCH_SET: 'kill_switch.set',
} as const;

export const PopupMessageKinds = {
  GET_STATUS: 'getStatus',
  TOGGLE_KILL_SWITCH: 'toggleKillSwitch',
  GET_KILL_SWITCH_STATE: 'getKillSwitchState',
  GET_WAITING_ROOM_LIST: 'getWaitingRoomList',
  WAITING_ROOM_DECISION: 'waitingRoomDecision',
} as const;

export const WaitingRoomDecisions = {
  JOIN: 'join',
  REJECT: 'reject',
} as const;

export type WsMessageKind = (typeof WsMessageKinds)[keyof typeof WsMessageKinds];
export type ControlEventType = (typeof ControlEvents)[keyof typeof ControlEvents];
export type WaitingRoomDecision =
  (typeof WaitingRoomDecisions)[keyof typeof WaitingRoomDecisions];

export interface WaitingRoomEntry {
  sessionId: string;
  name: string;
  reason: string;
  url: string;
  joinRequestTime: number;
}

export interface SessionCommandMessage {
  type: typeof WsMessageKinds.SESSION_COMMAND;
  requestId: string;
  sessionId: string;
  command: CommandName;
  payload: CommandParams;
}

export interface SessionResultMessage {
  type: typeof WsMessageKinds.SESSION_RESULT;
  requestId: string;
  sessionId: string;
  success: boolean;
  result?: CommandResult;
  error?: string;
  errorCode?: ErrorCode;
}

export interface ControlEventMessage {
  type: typeof WsMessageKinds.CONTROL_EVENT;
  event: ControlEventType;
  payload: Record<string, unknown>;
}

export interface ControlCommandMessage {
  type: typeof WsMessageKinds.CONTROL_COMMAND;
  requestId: string;
  command: string;
  payload: Record<string, unknown>;
}

export interface ControlResponseMessage {
  type: typeof WsMessageKinds.CONTROL_RESPONSE;
  requestId: string;
  success: boolean;
  payload?: Record<string, unknown>;
  error?: string;
  errorCode?: ErrorCode;
}

export interface WsErrorMessage {
  type: typeof WsMessageKinds.ERROR;
  requestId?: string;
  success: false;
  error: string;
  errorCode: ErrorCode;
}

export type McpMessage =
  | SessionCommandMessage
  | ControlEventMessage
  | ControlResponseMessage
  | WsErrorMessage;

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
 * Get console messages from background to content script
 */
export interface GetConsoleMessagesMessage {
  type: 'getConsoleMessages';
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
  | GetConsoleMessagesMessage
  | ConsoleLogsResponse
  | CommandResult;

// ============================================================================
// Popup Messages (Popup <-> Background)
// ============================================================================

/**
 * Get status message from popup
 */
export interface GetStatusMessage {
  type: typeof PopupMessageKinds.GET_STATUS;
}

/**
 * Toggle kill switch message from popup
 */
export interface ToggleKillSwitchMessage {
  type: typeof PopupMessageKinds.TOGGLE_KILL_SWITCH;
}

/**
 * Get kill switch state message
 */
export interface GetKillSwitchStateMessage {
  type: typeof PopupMessageKinds.GET_KILL_SWITCH_STATE;
}

export interface GetWaitingRoomListMessage {
  type: typeof PopupMessageKinds.GET_WAITING_ROOM_LIST;
  refresh?: boolean;
}

export interface WaitingRoomDecisionMessage {
  type: typeof PopupMessageKinds.WAITING_ROOM_DECISION;
  sessionId: string;
  decision: WaitingRoomDecision;
}

/**
 * Status response to popup
 */
export interface StatusResponse {
  isServerRunning: boolean;
  reconnectAttempts: number;
  isKillSwitchEnabled: boolean;
  activeLeaseCount: number;
  waitingRoomCount: number;
}

/**
 * Kill switch response
 */
export interface KillSwitchResponse {
  isEnabled: boolean;
  error?: string;
}

export interface WaitingRoomListResponse {
  entries: WaitingRoomEntry[];
  refreshedAt: number;
}

export interface WaitingRoomDecisionResponse {
  success: boolean;
  sessionId: string;
  decision: WaitingRoomDecision;
  error?: string;
  errorCode?: ErrorCode;
}

/**
 * Union type for popup messages
 */
export type PopupMessage =
  | GetStatusMessage
  | ToggleKillSwitchMessage
  | GetKillSwitchStateMessage
  | GetWaitingRoomListMessage
  | WaitingRoomDecisionMessage
  | StatusResponse
  | KillSwitchResponse
  | WaitingRoomListResponse
  | WaitingRoomDecisionResponse;

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
