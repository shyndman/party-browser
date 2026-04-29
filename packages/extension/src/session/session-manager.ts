/**
 * Session Manager for PartyBrowser extension
 * Manages session lifecycle, window-backed leases, and session routing
 */

/// <reference path="../types/global.d.ts" />

import { CodedError, ErrorCodes } from '../utils/errors';
import { TabLifecycle } from '../commands/tab-lifecycle';

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

const LEASE_WINDOW_LEFT_INSET_PX = 200;
const LEASE_WINDOW_TOP_INSET_PX = 400;
const LEASE_WINDOW_RIGHT_INSET_PX = 200;
const LEASE_WINDOW_BOTTOM_INSET_PX = 200;
const MIN_LEASE_WINDOW_WIDTH_PX = 320;
const MIN_LEASE_WINDOW_HEIGHT_PX = 240;

/**
 * Window-backed lease metadata.
 *
 * API goal: preserve strict sessionId -> target-tab routing while also tracking
 * the owning window so lifecycle teardown is deterministic on either tab or
 * window closure.
 */
export interface SessionLease {
  windowId: number;
  tabId: number;
}

/**
 * Manages browser automation session state and lifecycle
 */
export class SessionManager {
  private leases = new Map<string, SessionLease>();
  private leaseCreatedAtMs = new Map<string, number>();
  private readonly tabLifecycle = new TabLifecycle();
  private onLeaseRevokedCallbacks: Array<
    (sessionId: string, lease: SessionLease, reason: string) => void
  > = [];
  private onTabRemovedListener:
    | ((tabId: number, removeInfo?: unknown) => void)
    | null = null;
  private onWindowRemovedListener: ((windowId: number) => void) | null = null;

  constructor(private config: SessionConfig = DEFAULT_SESSION_CONFIG) {
    this.setupTabRemovedListener();
    this.setupWindowRemovedListener();
  }

  /**
   * Set up listener for tab removal to clean up lease state.
   *
   * API goal: commands must never target dead tabs. As soon as a leased tab
   * disappears, the corresponding session lease is revoked.
   */
  private setupTabRemovedListener(): void {
    this.onTabRemovedListener = (removedTabId: number, removeInfo?: unknown) => {
      for (const [sessionId, lease] of this.leases.entries()) {
        if (lease.tabId !== removedTabId) {
          continue;
        }

        const leaseAgeMs = this.getLeaseAgeMs(sessionId);
        console.warn(
          `[PartyBrowser] Lease revoked; tab removed event matched lease for session ${sessionId} (window ${lease.windowId}, tab ${lease.tabId}, ageMs=${leaseAgeMs ?? 'unknown'}, removeInfo=${this.stringifyForLog(removeInfo)})`,
        );
        void this.revokeLease(sessionId, 'tab_closed', false);
        break;
      }
    };
    browser.tabs.onRemoved.addListener(this.onTabRemovedListener);
  }

  /**
   * Set up listener for window removal to clean up lease state.
   */
  private setupWindowRemovedListener(): void {
    this.onWindowRemovedListener = (removedWindowId: number) => {
      for (const [sessionId, lease] of this.leases.entries()) {
        if (lease.windowId !== removedWindowId) {
          continue;
        }

        const leaseAgeMs = this.getLeaseAgeMs(sessionId);
        console.warn(
          `[PartyBrowser] Lease revoked; window removed event matched lease for session ${sessionId} (window ${lease.windowId}, tab ${lease.tabId}, ageMs=${leaseAgeMs ?? 'unknown'})`,
        );
        void this.revokeLease(sessionId, 'window_closed', false);
        break;
      }
    };
    browser.windows.onRemoved.addListener(this.onWindowRemovedListener);
  }

  /**
   * Build deterministic window geometry from focused window bounds.
   */
  private async calculateLeaseWindowGeometry(): Promise<{
    left: number;
    top: number;
    width: number;
    height: number;
  }> {
    const focusedWindow = await browser.windows.getLastFocused();
    const normalWindow =
      focusedWindow.type === 'normal'
        ? focusedWindow
        : (await browser.windows.getAll({})).find((window) => window.type === 'normal') ??
          focusedWindow;

    // API goal: geometry tracks a normal browser window even when approval is
    // triggered from extension UI surfaces (popup/panel).
    const referenceWindow = normalWindow;
    const baseLeft = Number.isFinite(referenceWindow.left) ? Number(referenceWindow.left) : 0;
    const baseTop = Number.isFinite(referenceWindow.top) ? Number(referenceWindow.top) : 0;
    const baseWidth = Number.isFinite(referenceWindow.width) ? Number(referenceWindow.width) : 1280;
    const baseHeight = Number.isFinite(referenceWindow.height) ? Number(referenceWindow.height) : 900;

    const width = Math.max(
      MIN_LEASE_WINDOW_WIDTH_PX,
      baseWidth - LEASE_WINDOW_LEFT_INSET_PX - LEASE_WINDOW_RIGHT_INSET_PX,
    );
    const height = Math.max(
      MIN_LEASE_WINDOW_HEIGHT_PX,
      baseHeight - LEASE_WINDOW_TOP_INSET_PX - LEASE_WINDOW_BOTTOM_INSET_PX,
    );

    return {
      left: baseLeft + LEASE_WINDOW_LEFT_INSET_PX,
      top: baseTop + LEASE_WINDOW_TOP_INSET_PX,
      width,
      height,
    };
  }

  /**
   * Create a dedicated window for a lease.
   */
  private async createLeaseWindow(url: string): Promise<SessionLease> {
    const geometry = await this.calculateLeaseWindowGeometry();
    let windowId: number | undefined;

    try {
      const createdWindow = await browser.windows.create({
        url,
        type: 'normal',
        left: geometry.left,
        top: geometry.top,
        width: geometry.width,
        height: geometry.height,
      });

      windowId = createdWindow.id;
      if (windowId === undefined) {
        throw new CodedError(
          'Could not create lease window: missing window id.',
          ErrorCodes.COMMAND_FAILED,
        );
      }

      let tabId = createdWindow.tabs?.[0]?.id;
      if (tabId === undefined) {
        const tabs = await browser.tabs.query({ windowId });
        tabId = tabs[0]?.id;
      }

      if (tabId === undefined) {
        throw new CodedError(
          `Could not resolve lease tab for window ${windowId}.`,
          ErrorCodes.COMMAND_FAILED,
        );
      }

      await this.tabLifecycle.waitForTabToSettle({
        command: 'lease_setup',
        sessionId: 'lease_setup',
        tabId,
      });

      return { windowId, tabId };
    } catch (error) {
      if (windowId !== undefined) {
        try {
          await browser.windows.remove(windowId);
        } catch (cleanupError) {
          console.warn(
            `[PartyBrowser] Failed to remove lease setup window ${windowId}:`,
            cleanupError,
          );
        }
      }

      throw error;
    }
  }

  /**
   * Create a session lease with a fresh window and tab
   */
  async createLease(sessionId: string, url: string): Promise<SessionLease> {
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

    const lease = await this.createLeaseWindow(url);
    this.leases.set(sessionId, lease);
    this.leaseCreatedAtMs.set(sessionId, Date.now());

    console.log(
      `[PartyBrowser] Lease created: ${sessionId} -> window ${lease.windowId}, tab ${lease.tabId}, url=${url}`,
    );

    return lease;
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

    const lease = this.leases.get(params.sessionId);
    if (lease === undefined) {
      throw new CodedError(
        `No active lease for sessionId ${params.sessionId}.`,
        ErrorCodes.SESSION_LEASE_NOT_FOUND,
      );
    }

    try {
      await browser.tabs.get(lease.tabId);
    } catch {
      this.leases.delete(params.sessionId);
      throw new CodedError(
        `Leased tab for sessionId ${params.sessionId} was closed.`,
        ErrorCodes.SESSION_TAB_CLOSED,
      );
    }

    return lease.tabId;
  }

  /**
   * Get the current lease for a session
   */
  getLease(sessionId: string): SessionLease | null {
    const lease = this.leases.get(sessionId);
    return lease === undefined ? null : { ...lease };
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
  getLeaseSnapshot(): Record<string, SessionLease> {
    return Object.fromEntries(
      [...this.leases.entries()].map(([sessionId, lease]) => [sessionId, { ...lease }]),
    );
  }

  /**
   * Revoke a lease by sessionId
   * @param closeWindow Whether to close window as part of revocation
   * @returns true if a lease was revoked, false if no lease existed
   */
  async revokeLease(
    sessionId: string,
    reason: string,
    closeWindow = true,
  ): Promise<boolean> {
    const lease = this.leases.get(sessionId);
    if (lease === undefined) {
      return false;
    }

    const leaseAgeMs = this.getLeaseAgeMs(sessionId);
    this.leases.delete(sessionId);
    this.leaseCreatedAtMs.delete(sessionId);

    if (closeWindow) {
      try {
        await browser.windows.remove(lease.windowId);
      } catch {
        // Window may already be closed
      }
    }

    console.log(
      `[PartyBrowser] Lease revoked: ${sessionId} (window ${lease.windowId}, tab ${lease.tabId}, reason: ${reason}, ageMs=${leaseAgeMs ?? 'unknown'})`,
    );
    this.onLeaseRevokedCallbacks.forEach((cb) => cb(sessionId, { ...lease }, reason));
    return true;
  }

  private getLeaseAgeMs(sessionId: string): number | null {
    const createdAtMs = this.leaseCreatedAtMs.get(sessionId);
    return createdAtMs === undefined ? null : Date.now() - createdAtMs;
  }

  private stringifyForLog(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }

  /**
   * Revoke all active leases
   */
  async revokeAllLeases(reason: string, closeWindows = true): Promise<void> {
    const sessionIds = Array.from(this.leases.keys());
    for (const sessionId of sessionIds) {
      await this.revokeLease(sessionId, reason, closeWindows);
    }
  }

  /**
   * Register callback for lease revocation
   */
  onLeaseRevoked(
    callback: (sessionId: string, lease: SessionLease, reason: string) => void,
  ): void {
    this.onLeaseRevokedCallbacks.push(callback);
  }

  /**
   * Dispose the session manager and clean up listeners
   */
  dispose(): void {
    if (this.onTabRemovedListener) {
      browser.tabs.onRemoved.removeListener(this.onTabRemovedListener);
    }
    if (this.onWindowRemovedListener) {
      browser.windows.onRemoved.removeListener(this.onWindowRemovedListener);
    }
  }
}
