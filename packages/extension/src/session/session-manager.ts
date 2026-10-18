/**
 * Session Manager for PartyBrowser extension
 * Manages session lifecycle, window-backed leases, and session routing
 */

/// <reference path="../types/global.d.ts" />

import { CodedError, ErrorCodes } from '../utils/errors';
import { TabLifecycle } from '../commands/tab-lifecycle';
import { requireSuccessfulCommandResult } from '../commands/command-result';
import { TakeoverGroup } from './takeover-group';
import {
  SessionLeaseKinds,
  SessionLeaseOwnerships,
  type SessionLeaseKind,
  type SessionLeaseOwnership,
} from '../types/session';

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
  leaseKind: SessionLeaseKind;
  ownership: SessionLeaseOwnership;
  closeOnRevoke: boolean;
}

interface PendingLeaseSetup {
  lease?: SessionLease;
  resolvedTabId?: number;
  cancelled: boolean;
  finished: Promise<void>;
  finish: () => void;
}

/**
 * Manages browser automation session state and lifecycle
 */
export class SessionManager {
  private leases = new Map<string, SessionLease>();
  private leaseCreatedAtMs = new Map<string, number>();
  private readonly tabLifecycle = new TabLifecycle();
  private readonly takeoverGroups = new Map<string, TakeoverGroup>();
  private readonly tabClaims = new Map<number, string>();
  private readonly pendingSetups = new Map<string, PendingLeaseSetup>();
  private readonly releasingSessions = new Set<string>();
  private onLeaseCreatedCallbacks: Array<
    (sessionId: string, lease: SessionLease) => void
  > = [];
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
      for (const pending of this.pendingSetups.values()) {
        if (pending.lease?.tabId === removedTabId) {
          pending.cancelled = true;
        }
      }

      for (const [sessionId, lease] of this.leases.entries()) {
        if (lease.tabId !== removedTabId) {
          continue;
        }

        const leaseAgeMs = this.getLeaseAgeMs(sessionId);
        console.warn(
          `[PartyBrowser] Lease revoked; tab removed event matched lease for session ${sessionId} (window ${lease.windowId}, tab ${lease.tabId}, ageMs=${leaseAgeMs ?? 'unknown'}, removeInfo=${this.stringifyForLog(removeInfo)})`,
        );
        void this.revokeLeaseForClosedBrowserTarget(sessionId, 'tab_closed');
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
      for (const pending of this.pendingSetups.values()) {
        if (pending.lease?.windowId === removedWindowId) {
          pending.cancelled = true;
        }
      }

      for (const [sessionId, lease] of this.leases.entries()) {
        if (lease.windowId !== removedWindowId) {
          continue;
        }

        const leaseAgeMs = this.getLeaseAgeMs(sessionId);
        console.warn(
          `[PartyBrowser] Lease revoked; window removed event matched lease for session ${sessionId} (window ${lease.windowId}, tab ${lease.tabId}, ageMs=${leaseAgeMs ?? 'unknown'})`,
        );
        void this.revokeLeaseForClosedBrowserTarget(sessionId, 'window_closed');
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
  private async createLeaseWindow(
    sessionId: string,
    url: string,
    pending: PendingLeaseSetup,
  ): Promise<SessionLease> {
    const geometry = await this.calculateLeaseWindowGeometry();
    this.assertLeaseSetupActive(pending);

    let windowId: number | undefined;
    let tabId: number | undefined;

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

      tabId = createdWindow.tabs?.[0]?.id;
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

      pending.resolvedTabId = tabId;
      this.assertTabNotAlreadyLeased(tabId, sessionId);

      this.tabClaims.set(tabId, sessionId);
      const lease: SessionLease = {
        windowId,
        tabId,
        leaseKind: SessionLeaseKinds.WORKSPACE,
        ownership: SessionLeaseOwnerships.OWNED,
        closeOnRevoke: true,
      };
      pending.lease = lease;

      return lease;
    } catch (error) {
      const claimant = tabId === undefined ? undefined : this.tabClaims.get(tabId);

      if (windowId !== undefined && (claimant === undefined || claimant === sessionId)) {
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

  private beginLeaseSetup(sessionId: string): PendingLeaseSetup {
    let finish!: () => void;
    const pending: PendingLeaseSetup = {
      cancelled: false,
      finished: new Promise<void>((resolve) => { finish = resolve; }),
      finish: () => finish(),
    };

    this.pendingSetups.set(sessionId, pending);

    return pending;
  }

  /**
   * Create a workspace session lease with a fresh owned window and tab
   */
  async createWorkspaceLease(sessionId: string, url: string): Promise<SessionLease> {
    if (!sessionId) {
      throw new CodedError(
        'sessionId is required to create a lease.',
        ErrorCodes.SESSION_ID_REQUIRED,
      );
    }

    if (!url) {
      throw new CodedError(
        'url is required to create a workspace lease.',
        ErrorCodes.COMMAND_FAILED,
      );
    }

    if (this.leases.has(sessionId) || this.pendingSetups.has(sessionId) || this.releasingSessions.has(sessionId)) {
      throw new CodedError(
        `Lease already exists for sessionId ${sessionId}.`,
        ErrorCodes.COMMAND_FAILED,
      );
    }

    const pending = this.beginLeaseSetup(sessionId);

    try {
      const lease = await this.createLeaseWindow(sessionId, url, pending);
      this.assertLeaseSetupActive(pending);

      await this.tabLifecycle.waitForTabToSettle({
        command: 'lease_setup',
        sessionId,
        tabId: lease.tabId,
      });
      this.assertLeaseSetupActive(pending);

      await this.initializeTelemetry(lease.tabId);
      this.assertLeaseSetupActive(pending);

      this.leases.set(sessionId, lease);
      this.leaseCreatedAtMs.set(sessionId, Date.now());
      this.pendingSetups.delete(sessionId);
      this.onLeaseCreatedCallbacks.forEach((callback) => callback(sessionId, { ...lease }));

      console.log(
        `[PartyBrowser] Workspace lease created: ${sessionId} -> window ${lease.windowId}, tab ${lease.tabId}, url=${url}`,
      );

      return lease;
    } catch (error) {
      console.warn('[PartyBrowser] Workspace setup failed.', {
        operation: 'workspace_setup',
        sessionId,
        tabId: pending.resolvedTabId,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof CodedError ? error.errorCode : undefined,
      });

      const lease = pending.lease;

      if (lease) {
        await this.stopTelemetry(sessionId, lease.tabId, 'workspace_setup_cleanup');

        try {
          await browser.windows.remove(lease.windowId);
        } catch (cleanupError) {
          console.warn('[PartyBrowser] Workspace setup cleanup failed.', {
            operation: 'workspace_setup_cleanup',
            sessionId,
            tabId: lease.tabId,
            error: cleanupError,
            errorCode: cleanupError instanceof CodedError ? cleanupError.errorCode : undefined,
          });
        } finally {
          this.tabClaims.delete(lease.tabId);
        }
      }

      throw error;
    } finally {
      this.pendingSetups.delete(sessionId);
      pending.finish();
    }
  }

  /**
   * Create a takeover lease for the currently focused normal-window active tab.
   */
  async createTakeoverLease(sessionId: string): Promise<SessionLease> {
    if (!sessionId) {
      throw new CodedError(
        'sessionId is required to create a lease.',
        ErrorCodes.SESSION_ID_REQUIRED,
      );
    }

    if (this.leases.has(sessionId) || this.pendingSetups.has(sessionId) || this.releasingSessions.has(sessionId)) {
      throw new CodedError(
        `Lease already exists for sessionId ${sessionId}.`,
        ErrorCodes.COMMAND_FAILED,
      );
    }

    const pending = this.beginLeaseSetup(sessionId);

    let group: TakeoverGroup | undefined;
    let claimedTabId: number | undefined;

    try {
      const lease = await this.resolveFocusedNormalTabLease(pending);
      this.assertLeaseSetupActive(pending);
      this.assertTabNotAlreadyLeased(lease.tabId, sessionId);
      this.tabClaims.set(lease.tabId, sessionId);
      claimedTabId = lease.tabId;
      pending.lease = lease;

      await this.tabLifecycle.waitForTabToSettle({
        command: 'takeover_setup',
        sessionId,
        tabId: lease.tabId,
      });

      this.assertLeaseSetupActive(pending);

      group = new TakeoverGroup(lease.tabId);
      await group.setup();
      await browser.tabs.get(lease.tabId);
      this.assertLeaseSetupActive(pending);

      await this.initializeTelemetry(lease.tabId);
      this.assertLeaseSetupActive(pending);

      this.takeoverGroups.set(sessionId, group);
      this.leases.set(sessionId, lease);
      this.leaseCreatedAtMs.set(sessionId, Date.now());
      this.pendingSetups.delete(sessionId);
      this.onLeaseCreatedCallbacks.forEach((callback) => callback(sessionId, { ...lease }));

      console.log(
        `[PartyBrowser] Takeover lease created: ${sessionId} -> window ${lease.windowId}, tab ${lease.tabId}`,
      );

      return lease;
    } catch (error) {
      console.warn('[PartyBrowser] Takeover setup failed.', {
        operation: 'takeover_setup',
        sessionId,
        tabId: pending.resolvedTabId,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof CodedError ? error.errorCode : undefined,
      });

      if (claimedTabId !== undefined) {
        await this.stopTelemetry(sessionId, claimedTabId, 'takeover_setup_cleanup');
      }

      this.leases.delete(sessionId);
      this.leaseCreatedAtMs.delete(sessionId);
      this.takeoverGroups.delete(sessionId);
      await group?.restore();

      if (claimedTabId !== undefined) {
        this.tabClaims.delete(claimedTabId);
      }

      throw error;
    } finally {
      this.pendingSetups.delete(sessionId);
      pending.finish();
    }
  }

  private assertLeaseSetupActive(pending: PendingLeaseSetup): void {
    if (pending.cancelled) {
      throw new CodedError('Lease setup was cancelled.', ErrorCodes.COMMAND_FAILED);
    }
  }

  private async resolveFocusedNormalTabLease(pending: PendingLeaseSetup): Promise<SessionLease> {
    const focusedWindow = await browser.windows.getLastFocused();
    const normalWindow =
      focusedWindow.type === 'normal'
        ? focusedWindow
        : (await browser.windows.getAll({})).find((window) => window.type === 'normal');
    if (!normalWindow) {
      throw new CodedError(
        'Could not resolve focused normal browser window for takeover.',
        ErrorCodes.TAKEOVER_TAB_UNAVAILABLE,
      );
    }

    const windowId = normalWindow.id;
    if (windowId === undefined) {
      throw new CodedError(
        'Could not resolve focused normal browser window for takeover.',
        ErrorCodes.TAKEOVER_TAB_UNAVAILABLE,
      );
    }

    const tabs = await browser.tabs.query({ active: true, windowId });
    const tab = tabs[0];
    const tabId = tab?.id;
    if (tabId === undefined) {
      throw new CodedError(
        `Could not resolve active tab for focused window ${windowId}.`,
        ErrorCodes.TAKEOVER_TAB_UNAVAILABLE,
      );
    }
    pending.resolvedTabId = tabId;

    this.assertTakeoverUrlSupported(tab.url);

    return {
      windowId,
      tabId,
      leaseKind: SessionLeaseKinds.TAKEOVER,
      ownership: SessionLeaseOwnerships.BORROWED,
      closeOnRevoke: false,
    };
  }

  private assertTakeoverUrlSupported(url?: string): void {
    if (!url) {
      throw new CodedError(
        'Cannot take over a tab without a readable URL.',
        ErrorCodes.TAKEOVER_TAB_UNAVAILABLE,
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new CodedError(
        `Cannot take over tab with invalid URL: ${url}`,
        ErrorCodes.TAKEOVER_TAB_UNAVAILABLE,
      );
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new CodedError(
        `Cannot take over restricted tab URL: ${url}`,
        ErrorCodes.TAKEOVER_TAB_UNAVAILABLE,
      );
    }
  }

  private assertTabNotAlreadyLeased(tabId: number, sessionId: string): void {
    const claimant = this.tabClaims.get(tabId);
    if (claimant !== undefined) {
      throw new CodedError(
        `Tab ${tabId} is already leased by sessionId ${claimant}.`,
        ErrorCodes.COMMAND_FAILED,
      );
    }
    for (const [existingSessionId, lease] of this.leases.entries()) {
      if (existingSessionId !== sessionId && lease.tabId === tabId) {
        throw new CodedError(
          `Tab ${tabId} is already leased by sessionId ${existingSessionId}.`,
          ErrorCodes.COMMAND_FAILED,
        );
      }
    }
  }

  /** A commit without an existing lease never activates telemetry. */
  async handleNavigationCommitted(details: { tabId: number; frameId: number }): Promise<void> {
    if (details.frameId !== 0) {
      return;
    }

    for (const [sessionId, lease] of this.leases) {
      if (lease.tabId !== details.tabId) {
        continue;
      }

      try {
        await this.initializeTelemetry(details.tabId);
      } catch (error) {
        console.warn('[PartyBrowser] Navigation telemetry failed.', {
          operation: 'navigation_injection',
          sessionId,
          tabId: details.tabId,
          error: error instanceof Error ? error.message : String(error),
          errorCode: error instanceof CodedError ? error.errorCode : undefined,
        });
      } finally {
        const claimant = this.tabClaims.get(details.tabId);

        if (this.leases.get(sessionId) !== lease &&
            (claimant === undefined || claimant === sessionId)) {
          await this.stopTelemetry(sessionId, details.tabId, 'navigation_release_cleanup');
        }
      }

      return;
    }
  }

  /** Inject only the top-level document and require its initialized message router. */
  private async initializeTelemetry(tabId: number): Promise<void> {
    await browser.tabs.executeScript(tabId, {
      file: '/telemetry.js',
      allFrames: false,
      runAt: 'document_start',
    });

    requireSuccessfulCommandResult(
      await browser.tabs.sendMessage(tabId, { type: 'ping' }, { frameId: 0 }),
      'Telemetry did not become ready.',
    );
  }

  private async stopTelemetry(sessionId: string, tabId: number, operation: string): Promise<void> {
    try {
      await browser.tabs.sendMessage(tabId, { type: 'stopTelemetry' }, { frameId: 0 });
    } catch (error) {
      console.warn('[PartyBrowser] Telemetry cleanup failed.', {
        operation, sessionId, tabId, error,
        errorCode: error instanceof CodedError ? error.errorCode : undefined,
      });
    }
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
      await this.revokeLeaseForClosedBrowserTarget(params.sessionId, 'tab_closed');
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
   * Revoke a lease by sessionId.
   * @returns true if a lease was revoked, false if no lease existed
   */
  async revokeLease(sessionId: string, reason: string): Promise<boolean> {
    return this.revokeLeaseRecord(sessionId, reason, true);
  }

  private async revokeLeaseForClosedBrowserTarget(
    sessionId: string,
    reason: string,
  ): Promise<boolean> {
    return this.revokeLeaseRecord(sessionId, reason, false);
  }

  private async revokeLeaseRecord(
    sessionId: string,
    reason: string,
    closeOwnedBrowserTarget: boolean,
  ): Promise<boolean> {
    const pending = this.pendingSetups.get(sessionId);

    if (pending) {
      const alreadyCancelled = pending.cancelled;
      pending.cancelled = true;

      await pending.finished;

      return !alreadyCancelled;
    }

    const lease = this.leases.get(sessionId);
    if (lease === undefined) {
      return false;
    }

    const leaseAgeMs = this.getLeaseAgeMs(sessionId);
    this.leases.delete(sessionId);
    this.leaseCreatedAtMs.delete(sessionId);
    this.releasingSessions.add(sessionId);
    const group = this.takeoverGroups.get(sessionId);
    this.takeoverGroups.delete(sessionId);
    await this.stopTelemetry(sessionId, lease.tabId, 'lease_release');
    if (group) {
      await group.restore();
    }

    if (lease.closeOnRevoke && closeOwnedBrowserTarget) {
      try {
        await browser.windows.remove(lease.windowId);
      } catch {
        // Window may already be closed
      }
    }

    console.log(
      `[PartyBrowser] Lease revoked: ${sessionId} (kind=${lease.leaseKind}, ownership=${lease.ownership}, window ${lease.windowId}, tab ${lease.tabId}, reason: ${reason}, ageMs=${leaseAgeMs ?? 'unknown'}, closeOnRevoke=${lease.closeOnRevoke}, closeOwnedBrowserTarget=${closeOwnedBrowserTarget})`,
    );

    try {
      this.onLeaseRevokedCallbacks.forEach((cb) => cb(sessionId, { ...lease }, reason));
    } finally {
      this.tabClaims.delete(lease.tabId);
      this.releasingSessions.delete(sessionId);
    }

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
  async revokeAllLeases(reason: string): Promise<void> {
    const sessionIds = new Set([...this.leases.keys(), ...this.pendingSetups.keys()]);

    for (const pending of this.pendingSetups.values()) {
      pending.cancelled = true;
    }

    for (const sessionId of sessionIds) {
      await this.revokeLease(sessionId, reason);
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

  onLeaseCreated(
    callback: (sessionId: string, lease: SessionLease) => void,
  ): void {
    this.onLeaseCreatedCallbacks.push(callback);
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
