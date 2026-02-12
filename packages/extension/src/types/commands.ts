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
  | 'getTitle'
  | 'getConsoleLogs';

// ============================================================================
// Command Parameters
// ============================================================================

/**
 * Parameters for navigate command
 */
export interface NavigateParams {
  url: string;
}

/**
 * Element reference - can be css:, xpath:, text:, or eN format
 */
export type ElementRef = string;

/**
 * Parameters for click command
 */
export interface ClickParams {
  element: ElementRef;
  tabId?: number;
}

/**
 * Parameters for type command
 */
export interface TypeParams {
  element: ElementRef;
  value: string;
  tabId?: number;
}

/**
 * Parameters for evaluate command
 */
export interface EvaluateParams {
  script: string;
  tabId?: number;
}

/**
 * Parameters for screenshot command
 */
export interface ScreenshotParams {
  tabId?: number;
}

/**
 * Parameters for snapshot command
 */
export interface SnapshotParams {
  tabId?: number;
}

/**
 * Parameters for select_option command
 */
export interface SelectOptionParams {
  element: ElementRef;
  value: string;
  tabId?: number;
}

/**
 * Parameters for wait command
 */
export interface WaitParams {
  timeout: number;
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
export interface GetNetworkRequestsParams {
  filter?: NetworkRequestFilter;
  tabId?: number;
}

/**
 * Parameters for getConsoleMessages command
 */
export interface GetConsoleMessagesParams {
  level?: 'all' | 'log' | 'error' | 'warn' | 'info';
  since?: number;
  tabId?: number;
}

/**
 * Parameters for go_back command
 */
export interface GoBackParams {
  tabId?: number;
}

/**
 * Parameters for go_forward command
 */
export interface GoForwardParams {
  tabId?: number;
}

/**
 * Parameters for press_key command
 */
export interface PressKeyParams {
  key: string;
  tabId?: number;
}

/**
 * Parameters for wait_for command
 */
export interface WaitForParams {
  mode: 'time' | 'text' | 'text_gone';
  value: string;
  timeout?: number;
  tabId?: number;
}

/**
 * Parameters for drag command
 */
export interface DragParams {
  startElement: ElementRef;
  endElement: ElementRef;
  tabId?: number;
}

/**
 * Parameters for hover command
 */
export interface HoverParams {
  element: ElementRef;
  tabId?: number;
}

/**
 * Parameters for close command
 */
export interface CloseParams {
  tabId?: number;
}

/**
 * Parameters for getUrl command
 */
export interface GetUrlParams {
  tabId?: number;
}

/**
 * Parameters for getTitle command
 */
export interface GetTitleParams {
  tabId?: number;
}

/**
 * Parameters for getConsoleLogs command
 */
export interface GetConsoleLogsParams {
  tabId?: number;
}

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
  | GetTitleParams
  | GetConsoleLogsParams;
