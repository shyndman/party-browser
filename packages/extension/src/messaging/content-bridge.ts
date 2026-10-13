/**
 * Content Bridge for PartyBrowser extension
 * Handles communication between background script and content scripts
 */

/// <reference path="../types/global.d.ts" />

import type { ConsoleLogEntry } from '../types/session';
import type { CommandName } from '../types/commands';

type LogFields = Record<string, unknown>;

/**
 * Wraps browser.tabs.sendMessage with error handling
 */
export class ContentBridge {
  /**
   * Send a command to the content script in a specific tab
   * @param tabId The target tab ID
   * @param command The command name
   * @param params Command parameters
   * @returns Promise resolving to command result
   */
  async sendCommand(tabId: number, command: CommandName, params: unknown): Promise<unknown> {
    const startedAt = Date.now();
    logContentBridge('log', 'Background content command sending.', {
      tabId,
      command,
      params: summarizeValue(params),
    });

    try {
      const response = await browser.tabs.sendMessage(tabId, {
        type: 'executeCommand',
        command,
        params
      });

      logContentBridge('log', 'Background content command completed.', {
        tabId,
        command,
        durationMs: Date.now() - startedAt,
        response: summarizeCommandResult(response),
      });

      return response;
    } catch (error) {
      logContentBridge('error', 'Background content command failed.', {
        tabId,
        command,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get console messages from the content script
   * @param tabId The target tab ID
   * @param clear Whether to clear logs after retrieval
   * @returns Promise resolving to console log entries
   */
  async getConsoleMessages(tabId: number, clear = false): Promise<ConsoleLogEntry[]> {
    const startedAt = Date.now();

    try {
      const response = await browser.tabs.sendMessage(tabId, {
        type: 'getConsoleMessages',
        clear
      }) as { success?: boolean; logs?: ConsoleLogEntry[] };

      if (response?.success) {
        logContentBridge('log', 'Background console log retrieval completed.', {
          tabId,
          clear,
          durationMs: Date.now() - startedAt,
          logCount: response.logs?.length ?? 0,
        });
        return response.logs || [];
      }

      logContentBridge('warn', 'Background console log retrieval returned unsuccessful response.', {
        tabId,
        clear,
        durationMs: Date.now() - startedAt,
        response: summarizeValue(response),
      });
      return [];
    } catch (error) {
      logContentBridge('log', 'Content script unavailable for console log retrieval.', {
        tabId,
        clear,
        durationMs: Date.now() - startedAt,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Check if content script is available in a tab
   * @param tabId The tab ID to check
   * @returns Promise resolving to availability status
   */
  async isContentScriptAvailable(tabId: number): Promise<boolean> {
    try {
      await browser.tabs.sendMessage(tabId, { type: 'ping' });
      return true;
    } catch {
      return false;
    }
  }
}

function summarizeCommandResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') {
    return summarizeValue(result);
  }

  const response = result as {
    success?: unknown;
    error?: unknown;
    data?: unknown;
    meta?: unknown;
  };

  const data = response.data;
  const meta = response.meta;

  return {
    success: response.success,
    error: typeof response.error === 'string' ? response.error : undefined,
    dataKeys: data && typeof data === 'object' ? Object.keys(data as Record<string, unknown>) : undefined,
    metaKeys: meta && typeof meta === 'object' ? Object.keys(meta as Record<string, unknown>) : undefined,
  };
}

function logContentBridge(
  level: 'log' | 'warn' | 'error',
  message: string,
  fields: LogFields,
): void {
  console[level]('[PartyBrowser] ' + message, fields);
}

function summarizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}
