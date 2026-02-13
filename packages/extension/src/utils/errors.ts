/**
 * Error utilities for PartyBrowser extension
 * Provides CodedError class matching MCP server pattern
 */

/**
 * Error codes for machine-readable failure reasons
 */
export const ErrorCodes = {
  SESSION_NOT_INITIALIZED: 'SESSION_NOT_INITIALIZED',
  SESSION_TAB_CLOSED: 'SESSION_TAB_CLOSED',
  SESSION_ID_REQUIRED: 'SESSION_ID_REQUIRED',
  SESSION_LEASE_NOT_FOUND: 'SESSION_LEASE_NOT_FOUND',
  EXPLICIT_TABID_NOT_SUPPORTED: 'EXPLICIT_TABID_NOT_SUPPORTED',
  UNKNOWN_MESSAGE_KIND: 'UNKNOWN_MESSAGE_KIND',
  CONTROL_EVENT_INVALID: 'CONTROL_EVENT_INVALID',
  WAITING_ROOM_ENTRY_NOT_FOUND: 'WAITING_ROOM_ENTRY_NOT_FOUND',
  TRANSPORT_UNAVAILABLE: 'TRANSPORT_UNAVAILABLE',
  COMMAND_FAILED: 'COMMAND_FAILED',
  KILL_SWITCH_DISABLED: 'KILL_SWITCH_DISABLED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * Type for error codes
 */
export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Error class with error code for machine-readable failure reasons
 */
export class CodedError extends Error {
  errorCode: ErrorCode;

  constructor(message: string, errorCode: ErrorCode = ErrorCodes.UNKNOWN_ERROR) {
    super(message);
    this.name = 'CodedError';
    this.errorCode = errorCode;
  }
}
