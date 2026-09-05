/**
 * Background script entrypoint for PartyBrowser Firefox extension
 * Orchestrates session management, messaging, and command handling
 */

/// <reference path="../src/types/global.d.ts" />

import { defineBackground } from 'wxt/utils/define-background';
import type BrowserNamespace from 'webextension-polyfill';
import { ErrorCodes, type ErrorCode } from '../src/utils/errors';
import type { CommandName } from '../src/types/commands';
import {
  PopupMessageKinds,
  type StatusResponse,
  type KillSwitchResponse,
  type WaitingRoomDecision,
  WaitingRoomDecisions,
  type WaitingRoomDecisionResponse,
  type WaitingRoomListResponse,
} from '../src/types/messages';

import { SessionManager, DEFAULT_SESSION_CONFIG } from '../src/session/session-manager';
import { NetworkCapture } from '../src/session/network-capture';
import { McpBridge, DEFAULT_BRIDGE_CONFIG } from '../src/messaging/mcp-bridge';
import { ContentBridge } from '../src/messaging/content-bridge';
import { CommandHandler } from '../src/commands/command-handler';
import { IconManager } from '../src/utils/icons';

const DEFAULT_PORT = 3456;

export default defineBackground({
  persistent: true,
  main() {
    let isKillSwitchEnabled = true;

    // Initialize modules
    const sessionManager = new SessionManager(DEFAULT_SESSION_CONFIG);
    const networkCapture = new NetworkCapture();
    const iconManager = new IconManager();
    const contentBridge = new ContentBridge();

    // Create command handler with dependencies
    const commandHandler = new CommandHandler(
      sessionManager,
      networkCapture,
      contentBridge
    );

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

    function summarizeTab(tab: BrowserNamespace.Tabs.Tab): Record<string, unknown> {
      return {
        status: tab.status,
        url: tab.url,
        title: tab.title,
        pendingUrl: tab.pendingUrl,
        windowId: tab.windowId,
        favIconUrl: tab.favIconUrl,
        audible: tab.audible,
        discarded: tab.discarded,
      };
    }

    function getLeaseContextForTab(tabId: number): { sessionId: string; lease: ReturnType<typeof sessionManager.getLease> } | null {
      const snapshot = sessionManager.getLeaseSnapshot();

      for (const [sessionId, lease] of Object.entries(snapshot)) {
        if (lease.tabId === tabId) {
          return { sessionId, lease };
        }
      }

      return null;
    }

    function logLeasedTabEvent(
      level: 'log' | 'warn' | 'error',
      message: string,
      tabId: number,
      fields: Record<string, unknown> = {},
    ): void {
      const leaseContext = getLeaseContextForTab(tabId);
      if (!leaseContext) {
        return;
      }

      console[level](`[PartyBrowser] ${message}`, {
        sessionId: leaseContext.sessionId,
        tabId,
        windowId: leaseContext.lease?.windowId,
        leaseKind: leaseContext.lease?.leaseKind,
        ownership: leaseContext.lease?.ownership,
        ...fields,
      });
    }

    function logWebNavigationEvent(
      event: string,
      details: {
        tabId: number;
        frameId?: number;
        parentFrameId?: number;
        url?: string;
        timeStamp?: number;
        transitionType?: string;
        transitionQualifiers?: string[];
        error?: string;
      },
      level: 'log' | 'warn' | 'error' = 'log',
    ): void {
      logLeasedTabEvent(level, 'Background webNavigation event.', details.tabId, {
        event,
        frameId: details.frameId,
        parentFrameId: details.parentFrameId,
        url: details.url,
        timeStamp: details.timeStamp,
        transitionType: details.transitionType,
        transitionQualifiers: details.transitionQualifiers,
        error: details.error,
      });
    }

    // Create MCP bridge
    const mcpBridge = new McpBridge(
      sessionManager,
      commandHandler,
      DEFAULT_BRIDGE_CONFIG,
      () => isKillSwitchEnabled
    );

    mcpBridge.onConnectionStateChanged((isConnected) => {
      iconManager.updateFromStatus(isConnected, isKillSwitchEnabled);
    });


    sessionManager.onLeaseCreated((sessionId, lease) => {
      networkCapture.startCapture(lease.tabId);
      console.log('[PartyBrowser] Lease created callback.', {
        sessionId,
        tabId: lease.tabId,
        windowId: lease.windowId,
        leaseKind: lease.leaseKind,
        ownership: lease.ownership,
        closeOnRevoke: lease.closeOnRevoke,
        activeLeaseCount: sessionManager.getLeaseCount(),
        leaseSnapshot: summarizeValue(sessionManager.getLeaseSnapshot()),
      });
    });
    sessionManager.onLeaseRevoked((sessionId, lease, reason) => {
      networkCapture.stopCapture(lease.tabId);
      networkCapture.clearLogs(lease.tabId);
      console.log('[PartyBrowser] Lease revoked callback.', {
        sessionId,
        tabId: lease.tabId,
        windowId: lease.windowId,
        leaseKind: lease.leaseKind,
        ownership: lease.ownership,
        closeOnRevoke: lease.closeOnRevoke,
        reason,
        activeLeaseCount: sessionManager.getLeaseCount(),
        leaseSnapshot: summarizeValue(sessionManager.getLeaseSnapshot()),
      });
    });

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      logLeasedTabEvent('log', 'Background tabs.onUpdated event.', tabId, {
        changedFields: summarizeValue(changeInfo),
        tabState: summarizeTab(tab),
      });
    });

    browser.webNavigation.onBeforeNavigate.addListener((details) => {
      logWebNavigationEvent('onBeforeNavigate', details);
    });

    browser.webNavigation.onCommitted.addListener((details) => {
      logWebNavigationEvent('onCommitted', details);
    });

    browser.webNavigation.onDOMContentLoaded.addListener((details) => {
      logWebNavigationEvent('onDOMContentLoaded', details);
    });

    browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
      logWebNavigationEvent('onHistoryStateUpdated', details);
    });

    browser.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
      logWebNavigationEvent('onReferenceFragmentUpdated', details);
    });

    browser.webNavigation.onCompleted.addListener((details) => {
      logWebNavigationEvent('onCompleted', details);
    });

    browser.webNavigation.onErrorOccurred.addListener((details) => {
      logWebNavigationEvent('onErrorOccurred', details, 'error');
    });

    // ============================================================
    // Initialization
    // ============================================================

    async function init(): Promise<void> {
      console.log('[PartyBrowser] Background script initialized');
      iconManager.updateFromStatus(false, isKillSwitchEnabled);
      const port = await loadPortFromStorage();
      mcpBridge.connect(port).catch((error) => {
        console.error('[PartyBrowser] Initial connection failed:', error);
      });
    }

    async function loadPortFromStorage(): Promise<number> {
      try {
        const result = await browser.storage.local.get('serverPort');
        return (result.serverPort as number) || DEFAULT_PORT;
      } catch (error) {
        console.error('[PartyBrowser] Failed to load port from storage:', error);
        return DEFAULT_PORT;
      }
    }

    // ============================================================
    // Kill Switch
    // ============================================================

    async function toggleKillSwitch(): Promise<KillSwitchResponse> {
      isKillSwitchEnabled = !isKillSwitchEnabled;
      console.log('[PartyBrowser] Kill switch toggled:', isKillSwitchEnabled ? 'ENABLED' : 'DISABLED');

      if (!isKillSwitchEnabled) {
        console.warn(
          `[PartyBrowser] Kill switch disable path is revoking all leases (leaseCount=${sessionManager.getLeaseCount()})`,
        );
        mcpBridge.publishKillSwitchState(false);
        mcpBridge.disconnect();
        await sessionManager.revokeAllLeases('kill_switch_disabled');
        networkCapture.stopCapture();
        networkCapture.clearLogs();
        iconManager.updateFromStatus(false, isKillSwitchEnabled);
        return { isEnabled: isKillSwitchEnabled };
      }

      const port = await loadPortFromStorage();
      await mcpBridge.connect(port).catch((error) => {
        console.error('[PartyBrowser] Connection failed after kill switch:', error);
      });
      mcpBridge.publishKillSwitchState(true);
      iconManager.updateFromStatus(mcpBridge.isConnected(), isKillSwitchEnabled);
      return { isEnabled: isKillSwitchEnabled };
    }

    async function getWaitingRoomList(refresh: boolean): Promise<WaitingRoomListResponse> {
      if (refresh) {
        await mcpBridge.requestWaitingRoomRefresh().catch((error) => {
          console.warn('[PartyBrowser] Waiting-room refresh request failed:', (error as Error).message);
        });
      }

      return {
        entries: mcpBridge.getWaitingRoomEntries(),
        refreshedAt: Date.now()
      };
    }

    async function submitWaitingRoomDecision(
      sessionId: string,
      decision: WaitingRoomDecision,
    ): Promise<WaitingRoomDecisionResponse> {
      const response = await mcpBridge.submitWaitingRoomDecision(sessionId, decision);
      if (!response.success) {
        return {
          success: false,
          sessionId,
          decision,
          error: response.error || 'Waiting-room decision failed.',
          errorCode: response.errorCode
        };
      }

      await mcpBridge.requestWaitingRoomRefresh().catch((error) => {
        console.warn('[PartyBrowser] Waiting-room refresh after decision failed:', (error as Error).message);
      });

      return {
        success: true,
        sessionId,
        decision
      };
    }

    // ============================================================
    // Event Listeners
    // ============================================================

    browser.runtime.onMessage.addListener(((
      message: unknown,
      _sender: BrowserNamespace.Runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean => {
      console.log('[PartyBrowser] Message received:', message);

      const msg = message as { type?: string; command?: CommandName; params?: Record<string, unknown> };

      if (msg.type === 'mcpCommand') {
        if (!isKillSwitchEnabled) {
          sendResponse({
            success: false,
            error: 'Kill switch is disabled. Click the extension icon to resume MCP communications.',
            errorCode: ErrorCodes.KILL_SWITCH_DISABLED
          });
          return false;
        }

        const sessionId = (msg as { sessionId?: unknown }).sessionId;
        const command = msg.command;
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          sendResponse({
            success: false,
            error: 'Missing required sessionId for command execution.',
            errorCode: ErrorCodes.SESSION_ID_REQUIRED
          });
          return false;
        }

        if (typeof command !== 'string' || command.length === 0) {
          sendResponse({
            success: false,
            error: 'Missing required command name.',
            errorCode: ErrorCodes.COMMAND_FAILED
          });
          return false;
        }

        commandHandler.execute(command as CommandName, msg.params || {}, sessionId)
          .then((result) => sendResponse({ success: true, result }))
          .catch((error) => sendResponse({
            success: false,
            error: (error as Error).message,
            errorCode: (error as { errorCode?: ErrorCode }).errorCode || ErrorCodes.COMMAND_FAILED
          }));
        return true;
      }

      if (msg.type === PopupMessageKinds.GET_STATUS) {
        const status: StatusResponse = {
          isServerRunning: mcpBridge.isConnected(),
          reconnectAttempts: mcpBridge.getReconnectAttempts(),
          isKillSwitchEnabled,
          activeLeaseCount: sessionManager.getLeaseCount(),
          waitingRoomCount: mcpBridge.getWaitingRoomEntries().length
        };
        sendResponse(status);
        return false;
      }

      if (msg.type === PopupMessageKinds.TOGGLE_KILL_SWITCH) {
        toggleKillSwitch()
          .then((response) => sendResponse(response))
          .catch((error) => sendResponse({
            isEnabled: isKillSwitchEnabled,
            error: (error as Error).message
          }));
        return true;
      }

      if (msg.type === PopupMessageKinds.GET_KILL_SWITCH_STATE) {
        sendResponse({ isEnabled: isKillSwitchEnabled });
        return false;
      }

      if (msg.type === PopupMessageKinds.GET_WAITING_ROOM_LIST) {
        const refresh = Boolean((msg as { refresh?: boolean }).refresh);
        getWaitingRoomList(refresh)
          .then((response) => sendResponse(response))
          .catch((error) => sendResponse({
            entries: [],
            refreshedAt: Date.now(),
            error: (error as Error).message
          }));
        return true;
      }

      if (msg.type === PopupMessageKinds.WAITING_ROOM_DECISION) {
        const sessionId = (msg as { sessionId?: unknown }).sessionId;
        const decision = (msg as { decision?: unknown }).decision;

        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          sendResponse({
            success: false,
            sessionId: '',
            decision: WaitingRoomDecisions.REJECT,
            error: 'Missing required sessionId.',
            errorCode: ErrorCodes.CONTROL_EVENT_INVALID
          });
          return false;
        }

        if (decision !== WaitingRoomDecisions.JOIN && decision !== WaitingRoomDecisions.REJECT) {
          sendResponse({
            success: false,
            sessionId,
            decision: WaitingRoomDecisions.REJECT,
            error: 'Invalid waiting-room decision.',
            errorCode: ErrorCodes.CONTROL_EVENT_INVALID
          });
          return false;
        }

        submitWaitingRoomDecision(sessionId, decision)
          .then((response) => sendResponse(response))
          .catch((error) => sendResponse({
            success: false,
            sessionId,
            decision,
            error: (error as Error).message,
            errorCode: ErrorCodes.COMMAND_FAILED
          }));
        return true;
      }

      return false;
    }) as BrowserNamespace.Runtime.OnMessageListener);

    browser.runtime.onInstalled.addListener((details) => {
      console.log('[PartyBrowser] Extension installed:', details);
      init();
    });

    browser.browserAction.onClicked.addListener(() => {
      toggleKillSwitch().catch((error) => {
        console.error('[PartyBrowser] Failed to toggle kill switch from toolbar click:', error);
      });
    });

    // Initialize on startup
    init();
  }
});
