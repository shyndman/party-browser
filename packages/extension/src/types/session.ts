/**
 * Session type definitions for Blindflight extension
 * Session-scoped state and network/console capture types
 */

/**
 * Session state for a browser automation session
 */
export interface SessionState {
  tabId: number;
  sessionId: string;
  startTime: number;
}

/**
 * Network request entry captured via webRequest API
 */
export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  type: string;
  timestamp: number;
  requestBody: unknown | null;
  statusCode: number | null;
  responseHeaders: Record<string, string>[] | null;
  error: string | null;
}

/**
 * Console log entry captured from content script
 */
export interface ConsoleLogEntry {
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: number;
  stack?: string;
}

/**
 * Formatted network request for API responses
 */
export interface FormattedNetworkRequest {
  id: string;
  url: string;
  method: string;
  type: string;
  status: number | null;
  timestamp: number;
  error: string | null;
}

/**
 * Formatted console message for API responses
 */
export interface FormattedConsoleMessage {
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: number;
  stack?: string;
}

/**
 * Session metadata for artifact export
 */
export interface SessionMetadata {
  sessionId: string;
  startTime: number;
  endTime?: number;
  url?: string;
  title?: string;
}
