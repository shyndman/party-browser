/**
 * Content Bridge for PartyBrowser extension
 * Handles communication between background script and content scripts
 */

/// <reference path="../types/global.d.ts" />

import type { ConsoleLogEntry } from '../types/session';

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
  async sendCommand(tabId: number, command: string, params: unknown): Promise<unknown> {
    try {
      return await browser.tabs.sendMessage(tabId, {
        type: 'executeCommand',
        command,
        params
      });
    } catch (error) {
      console.error(`[PartyBrowser] Failed to send command to tab ${tabId}:`, error);
      throw error;
    }
  }

  /**
   * Get console logs from the content script
   * @param tabId The target tab ID
   * @param clear Whether to clear logs after retrieval
   * @returns Promise resolving to console log entries
   */
  async getConsoleLogs(tabId: number, clear = false): Promise<ConsoleLogEntry[]> {
    try {
      const response = await browser.tabs.sendMessage(tabId, {
        type: 'getConsoleLogs',
        clear
      }) as { success?: boolean; logs?: ConsoleLogEntry[] };

      if (response?.success) {
        return response.logs || [];
      }
      return [];
    } catch (error) {
      console.log('[PartyBrowser] Content script not available for console logs:', (error as Error).message);
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
