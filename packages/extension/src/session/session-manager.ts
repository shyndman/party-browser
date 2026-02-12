/**
 * Session Manager for PartyBrowser extension
 * Manages session lifecycle, tab creation, and session state
 */

/// <reference path="../types/global.d.ts" />

import { CodedError, ErrorCodes } from '../utils/errors';

export interface SessionConfig {
  defaultPort: number;
  reconnectInterval: number;
  maxReconnectAttempts: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  defaultPort: 3456,
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
};

/**
 * Manages browser automation session state and lifecycle
 */
export class SessionManager {
  private sessionTabId: number | null = null;
  private sessionId: string | null = null;
  private sessionStartTime: number | null = null;
  private onSessionClearedCallbacks: Array<(reason: string) => void> = [];
  private onTabRemovedListener: ((tabId: number) => void) | null = null;

  constructor(private config: SessionConfig = DEFAULT_SESSION_CONFIG) {
    this.setupTabRemovedListener();
  }

  /**
   * Set up listener for tab removal to clean up session state
   */
  private setupTabRemovedListener(): void {
    this.onTabRemovedListener = (removedTabId: number) => {
      if (this.sessionTabId === removedTabId) {
        console.log(
          '[PartyBrowser] Session ownership cleared (reason: tab_closed)',
        );
        console.warn(
          '[PartyBrowser] Session tab closed; clearing session binding',
        );
        this.clearSession('tab_closed');
      }
    };
    browser.tabs.onRemoved.addListener(this.onTabRemovedListener);
  }

  /**
   * Create a new session tab
   * @returns Promise resolving to the new tab ID
   */
  async createSessionTab(): Promise<number> {
    const tab = await browser.tabs.create({
      url: 'about:blank',
      active: false,
    });

    await this.waitForTabLoad(tab.id!);

    try {
      await browser.tabs.executeScript(tab.id!, {
        code: `document.title = 'OC | PartyBrowser Session'`,
      });
    } catch (error) {
      console.log(
        '[PartyBrowser] Could not set initial tab title:',
        (error as Error).message,
      );
    }

    try {
      await this.addTabToSessionGroup(tab.id!);
    } catch (error) {
      console.log(
        '[PartyBrowser] Could not add tab to group:',
        (error as Error).message,
      );
    }

    return tab.id!;
  }

  /**
   * Create a new session with a fresh tab
   * @returns Promise resolving to the new tab ID
   */
  async createSession(): Promise<number> {
    const tabId = await this.createSessionTab();
    this.sessionTabId = tabId;
    this.sessionId =
      'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.sessionStartTime = Date.now();

    console.log(`[PartyBrowser] Session started: ${this.sessionId}`);
    console.log(`[PartyBrowser] Session tab created: ${this.sessionTabId}`);

    return tabId;
  }

  /**
   * Resolve the target tab ID for commands
   * Throws if session is not initialized or tab is closed
   * @param params Optional params (checks for unsupported tabId override)
   * @returns Promise resolving to the valid tab ID
   */
  async resolveTargetTab(params?: { tabId?: number }): Promise<number> {
    if (params && Object.prototype.hasOwnProperty.call(params, 'tabId')) {
      throw new CodedError(
        'tabId overrides are not supported. PartyBrowser uses the session-owned tab.',
        ErrorCodes.EXPLICIT_TABID_NOT_SUPPORTED,
      );
    }

    if (this.sessionTabId === null) {
      throw new CodedError(
        'Session not initialized. Run navigate first to create a session tab.',
        ErrorCodes.SESSION_NOT_INITIALIZED,
      );
    }

    try {
      await browser.tabs.get(this.sessionTabId);
    } catch {
      throw new CodedError(
        'Session tab was closed. Run navigate to create a new session tab.',
        ErrorCodes.SESSION_TAB_CLOSED,
      );
    }

    return this.sessionTabId;
  }

  /**
   * Get the current session tab ID (may be null)
   */
  getSessionTabId(): number | null {
    return this.sessionTabId;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get the session start time
   */
  getSessionStartTime(): number | null {
    return this.sessionStartTime;
  }

  /**
   * Check if a session is active
   */
  hasSession(): boolean {
    return this.sessionTabId !== null;
  }

  /**
   * Clear all session state
   * @param reason The reason for clearing the session
   */
  clearSession(reason: string): void {
    const hadSession = this.sessionTabId !== null;
    this.sessionTabId = null;
    this.sessionId = null;
    this.sessionStartTime = null;

    if (hadSession) {
      console.log(
        `[PartyBrowser] Session ownership cleared (reason: ${reason})`,
      );
      this.onSessionClearedCallbacks.forEach((cb) => cb(reason));
    }
  }

  /**
   * Register a callback for when the session is cleared
   */
  onSessionCleared(callback: (reason: string) => void): void {
    this.onSessionClearedCallbacks.push(callback);
  }

  /**
   * Add tab to the session group (if tabGroups API is available)
   */
  private async addTabToSessionGroup(tabId: number): Promise<void> {
    if (!browser.tabGroups) {
      console.log('[PartyBrowser] Tab groups API not available');
      return;
    }

    const groups = await browser.tabGroups.query({});
    const existingGroup = groups.find((g) => g.title?.includes('BF') || false);

    if (existingGroup) {
      await browser.tabs.group({
        tabIds: tabId,
        groupId: existingGroup.id,
      });
      console.log(
        `[PartyBrowser] Added tab ${tabId} to existing group: ${existingGroup.title}`,
      );
    } else {
      const groupId = await browser.tabs.group({
        tabIds: tabId,
      });
      await browser.tabGroups.update(groupId, {
        title: 'BF',
        color: 'blue',
      });
      console.log(`[PartyBrowser] Created new tab group`);
    }
  }

  /**
   * Wait for a tab to finish loading
   */
  private waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: { status?: string },
      ) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          browser.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      browser.tabs.onUpdated.addListener(listener);

      setTimeout(() => {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10000);
    });
  }

  /**
   * Dispose the session manager and clean up listeners
   */
  dispose(): void {
    if (this.onTabRemovedListener) {
      browser.tabs.onRemoved.removeListener(this.onTabRemovedListener);
    }
  }
}
