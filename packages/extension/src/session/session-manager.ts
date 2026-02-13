/**
 * Session Manager for PartyBrowser extension
 * Manages session lifecycle, tab creation, and session leases
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
  private leases = new Map<string, number>();
  private onLeaseRevokedCallbacks: Array<
    (sessionId: string, tabId: number, reason: string) => void
  > = [];
  private onTabRemovedListener: ((tabId: number) => void) | null = null;

  constructor(private config: SessionConfig = DEFAULT_SESSION_CONFIG) {
    this.setupTabRemovedListener();
  }

  /**
   * Set up listener for tab removal to clean up lease state
   */
  private setupTabRemovedListener(): void {
    this.onTabRemovedListener = (removedTabId: number) => {
      for (const [sessionId, tabId] of this.leases.entries()) {
        if (tabId !== removedTabId) {
          continue;
        }

        console.warn(
          `[PartyBrowser] Lease revoked; tab closed for session ${sessionId}`,
        );
        void this.revokeLease(sessionId, 'tab_closed', false);
        break;
      }
    };
    browser.tabs.onRemoved.addListener(this.onTabRemovedListener);
  }

  /**
   * Create a new tab for a lease
   * @returns Promise resolving to the new tab ID
   */
  private async createLeaseTab(url: string): Promise<number> {
    const tab = await browser.tabs.create({
      url,
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
   * Create a session lease with a fresh tab
   */
  async createLease(sessionId: string, url: string): Promise<number> {
    if (!sessionId) {
      throw new CodedError(
        'sessionId is required to create a lease.',
        ErrorCodes.SESSION_ID_REQUIRED,
      );
    }

    if (this.leases.has(sessionId)) {
      throw new CodedError(
        `Lease already exists for sessionId ${sessionId}.`,
        ErrorCodes.COMMAND_FAILED,
      );
    }

    const tabId = await this.createLeaseTab(url);
    this.leases.set(sessionId, tabId);

    console.log(`[PartyBrowser] Lease created: ${sessionId} -> tab ${tabId}`);

    return tabId;
  }

  /**
   * Resolve the target tab ID for session-scoped commands
   * Throws on missing sessionId, unknown sessionId, or closed tab
   * @returns Promise resolving to the valid tab ID
   */
  async resolveTargetTab(params?: {
    sessionId?: string;
    tabId?: number;
  }): Promise<number> {
    if (params && Object.prototype.hasOwnProperty.call(params, 'tabId')) {
      throw new CodedError(
        'tabId overrides are not supported. PartyBrowser uses the session-owned tab.',
        ErrorCodes.EXPLICIT_TABID_NOT_SUPPORTED,
      );
    }

    if (!params?.sessionId) {
      throw new CodedError(
        'sessionId is required for command execution.',
        ErrorCodes.SESSION_ID_REQUIRED,
      );
    }

    const tabId = this.leases.get(params.sessionId);
    if (tabId === undefined) {
      throw new CodedError(
        `No active lease for sessionId ${params.sessionId}.`,
        ErrorCodes.SESSION_LEASE_NOT_FOUND,
      );
    }

    try {
      await browser.tabs.get(tabId);
    } catch {
      this.leases.delete(params.sessionId);
      throw new CodedError(
        `Leased tab for sessionId ${params.sessionId} was closed.`,
        ErrorCodes.SESSION_TAB_CLOSED,
      );
    }

    return tabId;
  }

  /**
   * Get the current lease for a session
   */
  getLease(sessionId: string): number | null {
    const tabId = this.leases.get(sessionId);
    return tabId === undefined ? null : tabId;
  }

  /**
   * Check if a session has an active lease
   */
  hasLease(sessionId: string): boolean {
    return this.leases.has(sessionId);
  }

  /**
   * Number of active leases
   */
  getLeaseCount(): number {
    return this.leases.size;
  }

  /**
   * List active leases
   */
  getLeaseSnapshot(): Record<string, number> {
    return Object.fromEntries(this.leases.entries());
  }

  /**
   * Revoke a lease by sessionId
   * @param closeTab Whether to close tab as part of revocation
   * @returns true if a lease was revoked, false if no lease existed
   */
  async revokeLease(
    sessionId: string,
    reason: string,
    closeTab = true,
  ): Promise<boolean> {
    const tabId = this.leases.get(sessionId);
    if (tabId === undefined) {
      return false;
    }

    this.leases.delete(sessionId);

    if (closeTab) {
      try {
        await browser.tabs.remove(tabId);
      } catch {
        // Tab may already be closed
      }
    }

    console.log(
      `[PartyBrowser] Lease revoked: ${sessionId} (tab ${tabId}, reason: ${reason})`,
    );
    this.onLeaseRevokedCallbacks.forEach((cb) => cb(sessionId, tabId, reason));
    return true;
  }

  /**
   * Revoke all active leases
   */
  async revokeAllLeases(reason: string, closeTabs = true): Promise<void> {
    const sessionIds = Array.from(this.leases.keys());
    for (const sessionId of sessionIds) {
      await this.revokeLease(sessionId, reason, closeTabs);
    }
  }

  /**
   * Register callback for lease revocation
   */
  onLeaseRevoked(
    callback: (sessionId: string, tabId: number, reason: string) => void,
  ): void {
    this.onLeaseRevokedCallbacks.push(callback);
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
