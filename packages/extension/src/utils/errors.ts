/**
 * Error utilities for Blindflight extension
 * Provides CodedError class matching MCP server pattern
 */

/**
 * Error codes for machine-readable failure reasons
 */
export const ErrorCodes = {
  SESSION_NOT_INITIALIZED: 'SESSION_NOT_INITIALIZED',
  SESSION_TAB_CLOSED: 'SESSION_TAB_CLOSED',
  EXPLICIT_TABID_NOT_SUPPORTED: 'EXPLICIT_TABID_NOT_SUPPORTED',
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
