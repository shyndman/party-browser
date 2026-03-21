/**
 * Command type definitions for PartyBrowser extension
 * Mirrors the command structures from background.js
 */

import type { ErrorCode } from '@/utils/errors';

/**
 * Result of a command execution
 */
export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: ErrorCode;
  stack?: string;
}

/**
 * Command handler function type
 */
export type CommandHandler<T = unknown> = (params: T) => Promise<CommandResult> | CommandResult;

/**
 * Command name union type - all supported browser commands
 */
export type CommandName =
  | 'navigate'
  | 'click'
  | 'type'
  | 'evaluate'
  | 'screenshot'
  | 'snapshot'
  | 'select_option'
  | 'wait'
  | 'getTabs'
  | 'getNetworkRequests'
  | 'getConsoleMessages'
  | 'go_back'
  | 'go_forward'
  | 'press_key'
  | 'wait_for'
  | 'drag'
  | 'hover'
  | 'close'
  | 'getUrl'
  | 'getTitle';

export interface SessionScopedParams {
  sessionId: string;
  tabId?: number;
}

// ============================================================================
// Command Parameters
// ============================================================================

/**
 * Parameters for navigate command
 */
export interface NavigateParams extends SessionScopedParams {
  url: string;
}

/**
 * Element reference - can be css:, xpath:, text:, or eN format
 */
export type ElementRef = string;

/**
 * Parameters for click command
 */
export interface ClickParams extends SessionScopedParams {
  element: ElementRef;
}

/**
 * Parameters for type command
 */
export interface TypeParams extends SessionScopedParams {
  element: ElementRef;
  text: string;
}

/**
 * Parameters for evaluate command
 */
export interface EvaluateParams extends SessionScopedParams {
  script: string;
}

/**
 * Parameters for screenshot command
 */
export type ScreenshotParams = SessionScopedParams;

/**
 * Parameters for snapshot command
 */
export type SnapshotParams = SessionScopedParams;

/**
 * Parameters for select_option command
 */
export interface SelectOptionParams extends SessionScopedParams {
  element: ElementRef;
  value: string;
}

/**
 * Parameters for wait command
 * `time` specifies the duration to wait, in seconds.
 */
export interface WaitParams extends SessionScopedParams {
  time: number;
}

/**
 * Network request filter
 */
export interface NetworkRequestFilter {
  types?: string[];
  urlPattern?: string;
}

/**
 * Parameters for getNetworkRequests command
 */
export interface GetNetworkRequestsParams extends SessionScopedParams {
  filter?: NetworkRequestFilter;
}

/**
 * Parameters for getConsoleMessages command
 */
export interface GetConsoleMessagesParams extends SessionScopedParams {
  level?: 'all' | 'log' | 'error' | 'warn' | 'info';
  since?: number;
}

/**
 * Parameters for go_back command
 */
export type GoBackParams = SessionScopedParams;

/**
 * Parameters for go_forward command
 */
export type GoForwardParams = SessionScopedParams;

/**
 * Parameters for press_key command
 */
export interface PressKeyParams extends SessionScopedParams {
  key: string;
}

/**
 * Payload for wait_for command (no session metadata)
 */
export type WaitForPayload =
  | { mode: 'time'; value: number; timeout?: number }
  | { mode: 'text'; value: string; timeout: number }
  | { mode: 'text_gone'; value: string; timeout: number };

/**
 * Parameters for wait_for command
 */
export type WaitForParams = SessionScopedParams & WaitForPayload;

/**
 * Parameters for drag command
 */
export interface DragParams extends SessionScopedParams {
  startElement: ElementRef;
  endElement: ElementRef;
}

/**
 * Parameters for hover command
 */
export interface HoverParams extends SessionScopedParams {
  element: ElementRef;
}

/**
 * Parameters for close command
 */
export type CloseParams = SessionScopedParams;

/**
 * Parameters for getUrl command
 */
export type GetUrlParams = SessionScopedParams;

/**
 * Parameters for getTitle command
 */
export type GetTitleParams = SessionScopedParams;

/**
 * Union type for all command parameters
 */
export type CommandParams =
  | NavigateParams
  | ClickParams
  | TypeParams
  | EvaluateParams
  | ScreenshotParams
  | SnapshotParams
  | SelectOptionParams
  | WaitParams
  | GetNetworkRequestsParams
  | GetConsoleMessagesParams
  | GoBackParams
  | GoForwardParams
  | PressKeyParams
  | WaitForParams
  | DragParams
  | HoverParams
  | CloseParams
  | GetUrlParams
  | GetTitleParams;
