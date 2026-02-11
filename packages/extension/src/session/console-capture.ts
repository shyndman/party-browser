/**
 * Console Capture module for Blindflight content script
 * Captures console logs and errors from the page
 */

import type { ConsoleLogEntry } from '../types/session';

export const MAX_CONSOLE_LOGS = 1000;

/**
 * Manages console log capture in content script context
 */
export class ConsoleCapture {
  private consoleLogs: ConsoleLogEntry[] = [];
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
  };
  private originalOnError: OnErrorEventHandler | null = null;
  private originalOnUnhandledRejection: ((this: WindowEventHandlers, ev: PromiseRejectionEvent) => unknown) | null = null;
  private isActive = false;

  constructor() {
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
    this.startCapture();
  }

  /**
   * Start capturing console output
   */
  private startCapture(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Override console methods
    console.log = (...args: unknown[]) => {
      this.pushLog('log', args);
      this.originalConsole.log.apply(console, args);
    };

    console.error = (...args: unknown[]) => {
      this.pushLog('error', args);
      this.originalConsole.error.apply(console, args);
    };

    console.warn = (...args: unknown[]) => {
      this.pushLog('warn', args);
      this.originalConsole.warn.apply(console, args);
    };

    console.info = (...args: unknown[]) => {
      this.pushLog('info', args);
      this.originalConsole.info.apply(console, args);
    };

    // Capture uncaught errors
    this.originalOnError = window.onerror;
    window.onerror = (message, source, lineno, colno) => {
      this.pushLog('error', [`Uncaught: ${message} at ${source}:${lineno}:${colno}`]);
      return false;
    };

    // Capture unhandled promise rejections
    this.originalOnUnhandledRejection = window.onunhandledrejection;
    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
      this.pushLog('error', [`Unhandled Promise Rejection: ${event.reason}`]);
    };
  }

  /**
   * Push a log entry to the ring buffer
   */
  private pushLog(level: ConsoleLogEntry['level'], args: unknown[]): void {
    const entry: ConsoleLogEntry = {
      level,
      message: args.map((arg) => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' '),
      timestamp: Date.now(),
      stack: level === 'error' ? new Error().stack : undefined
    };

    this.consoleLogs.push(entry);

    if (this.consoleLogs.length > MAX_CONSOLE_LOGS) {
      this.consoleLogs.shift();
    }
  }

  /**
   * Get captured console logs
   * @param clear Whether to clear logs after retrieval
   * @returns Array of log entries
   */
  getLogs(clear = false): ConsoleLogEntry[] {
    const logs = [...this.consoleLogs];
    if (clear) {
      this.consoleLogs.length = 0;
    }
    return logs;
  }

  /**
   * Clear all captured logs
   */
  clearLogs(): void {
    this.consoleLogs.length = 0;
  }

  /**
   * Stop capture and restore original console methods
   */
  dispose(): void {
    if (!this.isActive) return;
    this.isActive = false;

    // Restore original console methods
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;

    // Restore original error handlers
    window.onerror = this.originalOnError;
    window.onunhandledrejection = this.originalOnUnhandledRejection;

    // Clear logs
    this.clearLogs();
  }

  /**
   * Get the number of captured logs
   */
  getLogCount(): number {
    return this.consoleLogs.length;
  }

  /**
   * Check if capture is active
   */
  isCapturing(): boolean {
    return this.isActive;
  }
}
