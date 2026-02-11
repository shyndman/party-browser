/**
 * Background script for Blindflight Firefox extension
 * Manages WebSocket server and routes commands between MCP server and content scripts
 */

/// <reference path="../src/types/global.d.ts" />

import { defineBackground } from 'wxt/utils/define-background';
import { CodedError, ErrorCodes, type ErrorCode } from '../src/utils/errors';

import type {
  CommandResult,
  CommandName,
  NavigateParams,
  ClickParams,
  TypeParams,
  EvaluateParams,
  ScreenshotParams,
  SnapshotParams,
  SelectOptionParams,
  WaitParams,
  GetNetworkRequestsParams,
  GetConsoleMessagesParams,
  GoBackParams,
  GoForwardParams,
  PressKeyParams,
  WaitForParams,
  DragParams,
  HoverParams,
  CloseParams,
  GetUrlParams,
  GetTitleParams,
  GetConsoleLogsParams
} from '../src/types/commands';
import type { NetworkRequest } from '../src/types/session';
import type { McpMessage, StatusResponse, KillSwitchResponse } from '../src/types/messages';

// Configuration
const CONFIG = {
  DEFAULT_PORT: 3456,
  RECONNECT_INTERVAL: 5000,
  MAX_RECONNECT_ATTEMPTS: 10
} as const;

const ICON_PATHS = {
  connected: {
    64: 'icons/state_connected_64.png',
    128: 'icons/state_connected_128.png'
  },
  disconnected: {
    64: 'icons/state_disconnected_64.png',
    128: 'icons/state_disconnected_128.png'
  },
  off: {
    64: 'icons/state_off_64.png',
    128: 'icons/state_off_128.png'
  }
} as const;

const MAX_LOG_SIZE = 1000;

export default defineBackground({
  persistent: true,
  main() {
    // State
    let serverSocket: WebSocket | null = null;
    let isServerRunning = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let wsConnection: WebSocket | null = null;
    let isKillSwitchEnabled = true;
    let sessionTabId: number | null = null;
    let sessionId: string | null = null;
    let sessionStartTime: number | null = null;

    // Session-scoped network and console capture
    const sessionNetworkLogs = new Map<number, NetworkRequest[]>();
    let networkCaptureListener: {
      tabId: number;
      onBeforeRequest: (details: browser.WebRequest.OnBeforeRequestDetailsType) => void;
      onCompleted: (details: browser.WebRequest.OnCompletedDetailsType) => void;
      onErrorOccurred: (details: browser.WebRequest.OnErrorOccurredDetailsType) => void;
    } | null = null;

    // ============================================================
    // Initialization
    // ============================================================

    function init(): void {
      console.log('[Blindflight] Background script initialized');
      updateToolbarIcon();
      loadPortFromStorage().then((port) => {
        startWebSocketServer(port);
      });
    }

    // ============================================================
    // Icon Management
    // ============================================================

    function updateToolbarIcon(): void {
      const iconState = !isKillSwitchEnabled
        ? 'off'
        : (isServerRunning ? 'connected' : 'disconnected');

      void browser.browserAction.setIcon({ path: ICON_PATHS[iconState] }).catch((error: Error) => {
        console.error('[Blindflight] Failed to update toolbar icon:', error);
      });
    }

    // ============================================================
    // Network Capture
    // ============================================================

    function startNetworkCapture(tabId: number): void {
      stopNetworkCapture();

      console.log(`[Blindflight] Starting network capture for tab ${tabId}`);
      sessionNetworkLogs.set(tabId, []);

      const onBeforeRequest = (details: browser.WebRequest.OnBeforeRequestDetailsType): void => {
        if (details.tabId !== tabId) return;

        const logs = sessionNetworkLogs.get(tabId);
        if (!logs) return;

        const requestEntry: NetworkRequest = {
          requestId: details.requestId,
          url: details.url,
          method: details.method,
          type: details.type,
          timestamp: details.timeStamp,
          requestBody: details.requestBody || null,
          statusCode: null,
          responseHeaders: null,
          error: null
        };

        logs.push(requestEntry);
        if (logs.length > MAX_LOG_SIZE) {
          logs.shift();
        }
      };

      const onCompleted = (details: browser.WebRequest.OnCompletedDetailsType): void => {
        if (details.tabId !== tabId) return;

        const logs = sessionNetworkLogs.get(tabId);
        if (!logs) return;

        const entry = logs.find((r) => r.requestId === details.requestId);
        if (entry) {
          entry.statusCode = details.statusCode;
          entry.responseHeaders = (details.responseHeaders as unknown as Record<string, string>[]) || null;
        }
      };

      const onErrorOccurred = (details: browser.WebRequest.OnErrorOccurredDetailsType): void => {
        if (details.tabId !== tabId) return;

        const logs = sessionNetworkLogs.get(tabId);
        if (!logs) return;

        const entry = logs.find((r) => r.requestId === details.requestId);
        if (entry) {
          entry.error = details.error;
        }
      };

      browser.webRequest.onBeforeRequest.addListener(
        onBeforeRequest as Parameters<typeof browser.webRequest.onBeforeRequest.addListener>[0],
        { urls: ['<all_urls>'], tabId },
        ['requestBody']
      );

      browser.webRequest.onCompleted.addListener(
        onCompleted as Parameters<typeof browser.webRequest.onCompleted.addListener>[0],
        { urls: ['<all_urls>'], tabId },
        ['responseHeaders']
      );

      browser.webRequest.onErrorOccurred.addListener(
        onErrorOccurred as Parameters<typeof browser.webRequest.onErrorOccurred.addListener>[0],
        { urls: ['<all_urls>'], tabId }
      );

      networkCaptureListener = { tabId, onBeforeRequest, onCompleted, onErrorOccurred };
    }

    function stopNetworkCapture(): void {
      if (networkCaptureListener) {
        const { onBeforeRequest, onCompleted, onErrorOccurred } = networkCaptureListener;

        try {
          browser.webRequest.onBeforeRequest.removeListener(
            onBeforeRequest as Parameters<typeof browser.webRequest.onBeforeRequest.removeListener>[0]
          );
        } catch {
          // Listener may not exist
        }

        try {
          browser.webRequest.onCompleted.removeListener(
            onCompleted as Parameters<typeof browser.webRequest.onCompleted.removeListener>[0]
          );
        } catch {
          // Listener may not exist
        }

        try {
          browser.webRequest.onErrorOccurred.removeListener(
            onErrorOccurred as Parameters<typeof browser.webRequest.onErrorOccurred.removeListener>[0]
          );
        } catch {
          // Listener may not exist
        }

        console.log(`[Blindflight] Stopped network capture for tab ${networkCaptureListener.tabId}`);
        networkCaptureListener = null;
      }
    }

    function clearSessionNetworkLogs(tabId?: number): void {
      if (tabId !== undefined) {
        sessionNetworkLogs.delete(tabId);
      } else {
        sessionNetworkLogs.clear();
      }
    }

    function getSessionNetworkRequests(filter: { types?: string[]; urlPattern?: string } = {}): NetworkRequest[] {
      if (sessionTabId === null) {
        return [];
      }

      let logs = sessionNetworkLogs.get(sessionTabId) || [];

      if (filter.types && filter.types.length > 0) {
        logs = logs.filter((r) => filter.types!.includes(r.type));
      }

      if (filter.urlPattern) {
        const pattern = filter.urlPattern.toLowerCase();
        logs = logs.filter((r) => r.url.toLowerCase().includes(pattern));
      }

      return logs;
    }

    // ============================================================
    // Tab Management
    // ============================================================

    async function resolveTargetTabId(params?: { tabId?: number }): Promise<number> {
      if (params && Object.prototype.hasOwnProperty.call(params, 'tabId')) {
        const error = new CodedError(
          'tabId overrides are not supported. Blindflight uses the session-owned tab.',
          ErrorCodes.EXPLICIT_TABID_NOT_SUPPORTED
        );
        throw error;
      }

      if (sessionTabId === null) {
        const error = new CodedError(
          'Session not initialized. Run browser_navigate first to create a session tab.',
          ErrorCodes.SESSION_NOT_INITIALIZED
        );
        throw error;
      }

      try {
        await browser.tabs.get(sessionTabId);
      } catch {
        const error = new CodedError(
          'Session tab was closed. Run browser_navigate to create a new session tab.',
          ErrorCodes.SESSION_TAB_CLOSED
        );
        throw error;
      }

      return sessionTabId;
    }

    async function loadPortFromStorage(): Promise<number> {
      try {
        const result = await browser.storage.local.get('serverPort');
        return (result.serverPort as number) || CONFIG.DEFAULT_PORT;
      } catch (error) {
        console.error('[Blindflight] Failed to load port from storage:', error);
        return CONFIG.DEFAULT_PORT;
      }
    }

    async function createSessionTab(): Promise<number> {
      const tab = await browser.tabs.create({
        url: 'about:blank',
        active: false
      });

      await waitForTabLoad(tab.id!);

      try {
        await browser.tabs.executeScript(tab.id!, {
          code: `document.title = 'OC | Blindflight Session'`
        });
      } catch (error) {
        console.log('[Blindflight] Could not set initial tab title:', (error as Error).message);
      }

      try {
        await addTabToSessionGroup(tab.id!);
      } catch (error) {
        console.log('[Blindflight] Could not add tab to group:', (error as Error).message);
      }

      return tab.id!;
    }

    async function addTabToSessionGroup(tabId: number): Promise<void> {
      if (!browser.tabGroups) {
        console.log('[Blindflight] Tab groups API not available');
        return;
      }

      const groups = await browser.tabGroups.query({});
      const existingGroup = groups.find((g) =>
        g.title && (g.title.includes('OpenCode') || g.title.includes('OC'))
      );

      if (existingGroup) {
        await browser.tabs.group({
          tabIds: tabId,
          groupId: existingGroup.id
        });
        console.log(`[Blindflight] Added tab ${tabId} to existing group: ${existingGroup.title}`);
      } else {
        const groupId = await browser.tabs.group({
          tabIds: tabId
        });
        await browser.tabGroups.update(groupId, {
          title: 'OpenCode Sessions',
          color: 'blue'
        });
        console.log(`[Blindflight] Created new tab group: OpenCode Sessions`);
      }
    }

    function waitForTabLoad(tabId: number): Promise<void> {
      return new Promise((resolve) => {
        const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
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

    // ============================================================
    // WebSocket Server
    // ============================================================

    function startWebSocketServer(port: number): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (isServerRunning) {
        console.log('[Blindflight] Server already running');
        return;
      }

      if (!isKillSwitchEnabled) {
        console.log('[Blindflight] Kill switch disabled, not connecting');
        updateToolbarIcon();
        return;
      }

      console.log(`[Blindflight] Starting WebSocket server on port ${port}`);

      try {
        wsConnection = new WebSocket(`ws://localhost:${port}`);

        wsConnection.onopen = async () => {
          console.log('[Blindflight] Extension connected to MCP server');
          isServerRunning = true;
          reconnectAttempts = 0;
          updateToolbarIcon();
        };

        wsConnection.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data) as McpMessage;
            console.log('[Blindflight] Received command from MCP:', message);

            if (!isKillSwitchEnabled) {
              const killSwitchResponse = {
                success: false,
                error: 'Kill switch is disabled. Click the extension icon to resume MCP communications.',
                errorCode: ErrorCodes.KILL_SWITCH_DISABLED
              };
              wsConnection?.send(JSON.stringify(killSwitchResponse));
              return;
            }

            // Handle mcpCommand type
            const mcpCmd = message as { type?: string; command?: CommandName; params?: Record<string, unknown> };
            if (mcpCmd.type === 'mcpCommand' && mcpCmd.command) {
              const result = await handleBrowserCommand(mcpCmd.command, mcpCmd.params || {});
              console.log('[Blindflight] Sending response to MCP:', result);
              wsConnection?.send(JSON.stringify(result));
              return;
            }

            const directMessageTypes: Record<string, CommandName> = {
              'browser_navigate': 'navigate',
              'browser_go_back': 'go_back',
              'browser_go_forward': 'go_forward',
              'browser_click': 'click',
              'browser_drag': 'drag',
              'browser_hover': 'hover',
              'browser_type': 'type',
              'browser_press_key': 'press_key',
              'browser_select_option': 'select_option',
              'browser_wait': 'wait',
              'browser_wait_for': 'wait_for',
              'browser_screenshot': 'screenshot',
              'browser_snapshot': 'snapshot',
              'browser_get_console_logs': 'getConsoleLogs',
              'browser_evaluate': 'evaluate',
              'browser_close': 'close',
              'getUrl': 'getUrl',
              'getTitle': 'getTitle',
              'browser_get_network_requests': 'getNetworkRequests',
              'browser_get_console_messages': 'getConsoleMessages'
            };

            const msg = message as { type?: string; id?: string; payload?: Record<string, unknown> };
            if (msg.type && directMessageTypes[msg.type]) {
              const command = directMessageTypes[msg.type];
              const result = await handleBrowserCommand(command, msg.payload || {});
              const responsePayload = {
                id: msg.id,
                result: result,
                error: result.success ? undefined : result.error,
                errorCode: result.errorCode
              };
              console.log('[Blindflight] Sending response to MCP:', responsePayload);
              wsConnection?.send(JSON.stringify(responsePayload));
              return;
            }

            const unknownTypeResponse = {
              id: msg.id,
              success: false,
              error: `Unknown message type: ${msg.type}`,
              errorCode: ErrorCodes.COMMAND_FAILED
            };
            wsConnection?.send(JSON.stringify(unknownTypeResponse));
          } catch (error) {
            console.error('[Blindflight] Error processing message:', error);
            if (wsConnection?.readyState === WebSocket.OPEN) {
              const errorResponse = {
                success: false,
                error: (error as Error).message,
                errorCode: (error as { errorCode?: ErrorCode }).errorCode || ErrorCodes.TRANSPORT_UNAVAILABLE
              };
              wsConnection.send(JSON.stringify(errorResponse));
            }
          }
        };

        wsConnection.onclose = () => {
          const wasConnected = isServerRunning;
          isServerRunning = false;
          wsConnection = null;

          let reason = 'transport_drop';
          if (!isKillSwitchEnabled) {
            reason = 'kill_switch';
          } else if (reconnectAttempts > 0) {
            reason = 'reconnect';
          }

          const clearedTabId = sessionTabId;
          sessionTabId = null;
          sessionId = null;
          sessionStartTime = null;
          if (clearedTabId !== null) {
            console.log(`[Blindflight] Session ownership cleared (reason: ${reason})`);
          }

          console.warn(`[Blindflight] Extension disconnected (reason: ${reason}); pending commands will fail. Reconnecting...`);
          updateToolbarIcon();

          if (isKillSwitchEnabled && reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`[Blindflight] Attempting reconnect ${reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS}`);
            reconnectTimer = setTimeout(() => {
              startWebSocketServer(port);
            }, CONFIG.RECONNECT_INTERVAL);
          }
        };

        wsConnection.onerror = (error) => {
          console.error('[Blindflight] WebSocket error:', error);
          isServerRunning = false;
          updateToolbarIcon();
        };
      } catch (error) {
        console.error('[Blindflight] Failed to start WebSocket:', error);
        isServerRunning = false;
        updateToolbarIcon();
      }
    }

    async function stopWebSocketServer(reason = 'kill_switch'): Promise<void> {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (wsConnection) {
        try {
          if (wsConnection.readyState === WebSocket.OPEN || wsConnection.readyState === WebSocket.CONNECTING) {
            wsConnection.close();
          }
        } catch (error) {
          console.error('[Blindflight] Error closing WebSocket:', error);
        }
        wsConnection = null;
      }

      if (sessionTabId !== null) {
        try {
          await browser.tabs.remove(sessionTabId);
          console.log(`[Blindflight] Session tab closed (reason: ${reason})`);
        } catch {
          console.log('[Blindflight] Session tab already closed or unavailable');
        }
      }

      stopNetworkCapture();
      clearSessionNetworkLogs(sessionTabId ?? undefined);

      isServerRunning = false;
      reconnectAttempts = 0;
      const clearedTabId = sessionTabId;
      sessionTabId = null;
      sessionId = null;
      sessionStartTime = null;
      updateToolbarIcon();

      if (clearedTabId !== null) {
        console.log(`[Blindflight] Session ownership cleared (reason: ${reason})`);
      }
      console.log('[Blindflight] Server stopped and session cleaned up');
    }

    // ============================================================
    // Command Handlers
    // ============================================================

    async function handleBrowserCommand(
      command: CommandName,
      params: Record<string, unknown>
    ): Promise<CommandResult> {
      console.log('[Blindflight] Handling command:', command, params);

      try {
        switch (command) {
          case 'navigate':
            return await handleNavigate(params as unknown as NavigateParams);
          case 'click':
            return await handleClick(params as unknown as ClickParams);
          case 'type':
            return await handleType(params as unknown as TypeParams);
          case 'evaluate':
            return await handleEvaluate(params as unknown as EvaluateParams);
          case 'screenshot':
            return await handleScreenshot(params as unknown as ScreenshotParams);
          case 'snapshot':
            return await handleSnapshot(params as unknown as SnapshotParams);
          case 'select_option':
            return await handleSelectOption(params as unknown as SelectOptionParams);
          case 'wait':
            return await handleWait(params as unknown as WaitParams);
          case 'getTabs':
            return await handleGetTabs();
          case 'getNetworkRequests':
            return await handleGetNetworkRequests(params as unknown as GetNetworkRequestsParams);
          case 'getConsoleMessages':
            return await handleGetConsoleMessages(params as unknown as GetConsoleMessagesParams);
          case 'go_back':
            return await handleGoBack(params as unknown as GoBackParams);
          case 'go_forward':
            return await handleGoForward(params as unknown as GoForwardParams);
          case 'press_key':
            return await handlePressKey(params as unknown as PressKeyParams);
          case 'wait_for':
            return await handleWaitFor(params as unknown as WaitForParams);
          case 'drag':
            return await handleDrag(params as unknown as DragParams);
          case 'hover':
            return await handleHover(params as unknown as HoverParams);
          case 'close':
            return await handleClose(params as unknown as CloseParams);
          case 'getUrl':
            return await handleGetUrl(params as unknown as GetUrlParams);
          case 'getTitle':
            return await handleGetTitle(params as unknown as GetTitleParams);
          case 'getConsoleLogs':
            return await handleGetConsoleLogs(params as unknown as GetConsoleLogsParams);
          default:
            throw new Error(`Unknown command: ${command}`);
        }
      } catch (error) {
        console.error('[Blindflight] Command failed:', error);
        return {
          success: false,
          error: (error as Error).message,
          errorCode: (error as { errorCode?: ErrorCode }).errorCode || ErrorCodes.COMMAND_FAILED,
          stack: (error as Error).stack
        };
      }
    }

    async function handleNavigate(params: NavigateParams): Promise<CommandResult> {
      const { url } = params;
      let targetTabId: number;

      if (sessionTabId === null) {
        console.log('[Blindflight] Creating session tab at about:blank');
        targetTabId = await createSessionTab();
        sessionTabId = targetTabId;

        sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStartTime = Date.now();
        console.log(`[Blindflight] Session started: ${sessionId}`);
        console.log(`[Blindflight] Session tab created: ${sessionTabId}`);

        startNetworkCapture(sessionTabId);
      } else {
        targetTabId = sessionTabId;

        try {
          await browser.tabs.get(targetTabId);
        } catch {
          console.log('[Blindflight] Prior session tab closed; creating new session tab');
          targetTabId = await createSessionTab();
          sessionTabId = targetTabId;
        }
      }

      await browser.tabs.update(targetTabId, { url });
      await waitForTabLoad(targetTabId);

      try {
        await browser.tabs.executeScript(targetTabId, {
          code: `document.title = 'OC | ' + document.title`
        });
      } catch (error) {
        console.log('[Blindflight] Could not update tab title:', (error as Error).message);
      }

      return { success: true, data: { url, tabId: targetTabId } };
    }

    async function handleClick(params: ClickParams): Promise<CommandResult> {
      const { element } = params;
      const targetTabId = await resolveTargetTabId(params);

      const results = await browser.tabs.sendMessage(targetTabId, {
        type: 'executeCommand',
        command: 'click',
        params: { element }
      });

      return results as CommandResult;
    }

    async function handleType(params: TypeParams): Promise<CommandResult> {
      const { element, value } = params;
      const targetTabId = await resolveTargetTabId(params);

      const results = await browser.tabs.sendMessage(targetTabId, {
        type: 'executeCommand',
        command: 'type',
        params: { element, value }
      });

      return results as CommandResult;
    }

    async function handleEvaluate(params: EvaluateParams): Promise<CommandResult> {
      const { script } = params;
      const targetTabId = await resolveTargetTabId(params);

      const results = await browser.tabs.sendMessage(targetTabId, {
        type: 'executeCommand',
        command: 'evaluate',
        params: { script }
      });

      return results as CommandResult;
    }

    async function handleScreenshot(params: ScreenshotParams): Promise<CommandResult> {
      const targetTabId = await resolveTargetTabId(params);

      const screenshot = await browser.tabs.captureTab(targetTabId, {
        format: 'png'
      });

      return { success: true, data: { screenshot } };
    }

    async function handleSnapshot(params: SnapshotParams): Promise<CommandResult> {
      const targetTabId = await resolveTargetTabId(params);

      const results = await browser.tabs.sendMessage(targetTabId, {
        type: 'executeCommand',
        command: 'snapshot'
      });

      return results as CommandResult;
    }

    async function handleSelectOption(params: SelectOptionParams): Promise<CommandResult> {
      const { element, value } = params;
      const targetTabId = await resolveTargetTabId(params);

      const results = await browser.tabs.sendMessage(targetTabId, {
        type: 'executeCommand',
        command: 'select_option',
        params: { element, value }
      });

      return results as CommandResult;
    }

    async function handleWait(params: WaitParams): Promise<CommandResult> {
      const { timeout } = params;
      await new Promise((resolve) => setTimeout(resolve, timeout));
      return { success: true };
    }

    async function handleGetTabs(): Promise<CommandResult> {
      const tabs = await browser.tabs.query({});
      return {
        success: true,
        data: tabs.map((tab) => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active
        }))
      };
    }

    async function handleGetNetworkRequests(params: GetNetworkRequestsParams): Promise<CommandResult> {
      await resolveTargetTabId(params);

      const { filter } = params;
      const logs = getSessionNetworkRequests(filter);

      const formatted = logs.map((r) => ({
        id: r.requestId,
        url: r.url,
        method: r.method,
        type: r.type,
        status: r.statusCode,
        timestamp: r.timestamp,
        error: r.error
      }));

      return {
        success: true,
        data: {
          count: formatted.length,
          requests: formatted
        }
      };
    }

    async function handleGetConsoleMessages(params: GetConsoleMessagesParams): Promise<CommandResult> {
      const targetTabId = await resolveTargetTabId(params);

      let logs: Array<{ level: string; message: string; timestamp: number; stack?: string }> = [];
      try {
        const response = await browser.tabs.sendMessage(targetTabId, {
          type: 'getConsoleLogs',
          clear: false
        }) as { success?: boolean; logs?: Array<{ level: string; message: string; timestamp: number; stack?: string }> };
        if (response && response.success) {
          logs = response.logs || [];
        }
      } catch (error) {
        console.log('[Blindflight] Content script not available for console logs:', (error as Error).message);
      }

      if (params.level && params.level !== 'all') {
        logs = logs.filter((l) => l.level === params.level);
      }

      if (params.since) {
        logs = logs.filter((l) => l.timestamp >= params.since!);
      }

      return {
        success: true,
        data: {
          count: logs.length,
          logs: logs.map((l) => ({
            level: l.level,
            message: l.message,
            timestamp: l.timestamp,
            stack: l.stack
          }))
        }
      };
    }

    async function handleGoBack(params: GoBackParams): Promise<CommandResult> {
      const targetTabId = await resolveTargetTabId(params);
      await browser.tabs.goBack(targetTabId);
      return { success: true };
    }

    async function handleGoForward(params: GoForwardParams): Promise<CommandResult> {
      const targetTabId = await resolveTargetTabId(params);
      await browser.tabs.goForward(targetTabId);
      return { success: true };
    }

    async function handlePressKey(params: PressKeyParams): Promise<CommandResult> {
      const { key } = params;
      const targetTabId = await resolveTargetTabId(params);

      const results = await browser.tabs.sendMessage(targetTabId, {
        type: 'executeCommand',
        command: 'press_key',
        params: { key }
      });

      return results as CommandResult;
    }

    async function handleWaitFor(params: WaitForParams): Promise<CommandResult> {
      const { mode, value, timeout } = params;
      const targetTabId = await resolveTargetTabId(params);

      const results = await browser.tabs.sendMessage(targetTabId, {
        type: 'executeCommand',
        command: 'wait_for',
        params: { mode, value, timeout }
      });

      return results as CommandResult;
    }

    async function handleDrag(params: DragParams): Promise<CommandResult> {
      const { startElement, endElement } = params;
      const targetTabId = await resolveTargetTabId(params);

      const results = await browser.tabs.sendMessage(targetTabId, {
        type: 'executeCommand',
        command: 'drag',
        params: { startElement, endElement }
      });

      return results as CommandResult;
    }

    async function handleHover(params: HoverParams): Promise<CommandResult> {
      const { element } = params;
      const targetTabId = await resolveTargetTabId(params);

      const results = await browser.tabs.sendMessage(targetTabId, {
        type: 'executeCommand',
        command: 'hover',
        params: { element }
      });

      return results as CommandResult;
    }

    async function handleClose(params: CloseParams): Promise<CommandResult> {
      await resolveTargetTabId(params);
      await stopWebSocketServer('user_close');
      return { success: true, data: { message: 'Session closed' } };
    }

    async function handleGetUrl(params: GetUrlParams): Promise<CommandResult> {
      const targetTabId = await resolveTargetTabId(params);
      const tab = await browser.tabs.get(targetTabId);
      return { success: true, data: { url: tab.url } };
    }

    async function handleGetTitle(params: GetTitleParams): Promise<CommandResult> {
      const targetTabId = await resolveTargetTabId(params);
      const tab = await browser.tabs.get(targetTabId);
      return { success: true, data: { title: tab.title } };
    }

    async function handleGetConsoleLogs(params: GetConsoleLogsParams): Promise<CommandResult> {
      const targetTabId = await resolveTargetTabId(params);

      const response = await browser.tabs.sendMessage(targetTabId, {
        type: 'getConsoleLogs',
        clear: false
      }) as { success?: boolean; logs?: unknown[] };

      if (!response || !response.success) {
        return {
          success: false,
          error: 'Failed to get console logs',
          errorCode: ErrorCodes.COMMAND_FAILED
        };
      }

      return {
        success: true,
        data: {
          count: response.logs?.length || 0,
          logs: response.logs || []
        }
      };
    }

    // ============================================================
    // Kill Switch
    // ============================================================

    async function toggleKillSwitch(): Promise<KillSwitchResponse> {
      isKillSwitchEnabled = !isKillSwitchEnabled;
      console.log('[Blindflight] Kill switch toggled:', isKillSwitchEnabled ? 'ENABLED' : 'DISABLED');

      if (!isKillSwitchEnabled) {
        await stopWebSocketServer('kill_switch');
        return { isEnabled: isKillSwitchEnabled };
      }

      const port = await loadPortFromStorage();
      startWebSocketServer(port);
      updateToolbarIcon();
      return { isEnabled: isKillSwitchEnabled };
    }

    // ============================================================
    // Event Listeners
    // ============================================================

    browser.runtime.onMessage.addListener(((
      message: unknown,
      sender: browser.Runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean => {
      console.log('[Blindflight] Message received:', message);

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
        handleBrowserCommand(msg.command!, msg.params || {})
          .then((result) => sendResponse({ success: true, result }))
          .catch((error) => sendResponse({
            success: false,
            error: (error as Error).message,
            errorCode: (error as { errorCode?: ErrorCode }).errorCode || ErrorCodes.COMMAND_FAILED
          }));
        return true;
      }

      if (msg.type === 'getStatus') {
        const status: StatusResponse = {
          isServerRunning,
          reconnectAttempts,
          isKillSwitchEnabled,
          sessionTabId
        };
        sendResponse(status);
        return false;
      }

      if (msg.type === 'toggleKillSwitch') {
        toggleKillSwitch()
          .then((response) => sendResponse(response))
          .catch((error) => sendResponse({
            isEnabled: isKillSwitchEnabled,
            error: (error as Error).message
          }));
        return true;
      }

      if (msg.type === 'getKillSwitchState') {
        sendResponse({ isEnabled: isKillSwitchEnabled });
        return false;
      }

      return false;
    }) as browser.Runtime.OnMessageListener);

    browser.runtime.onInstalled.addListener((details) => {
      console.log('[Blindflight] Extension installed:', details);
      init();
    });

    browser.tabs.onRemoved.addListener((removedTabId) => {
      if (sessionTabId === removedTabId) {
        console.log('[Blindflight] Session ownership cleared (reason: tab_closed)');
        console.warn('[Blindflight] Session tab closed; clearing session binding');

        stopNetworkCapture();
        clearSessionNetworkLogs(sessionTabId ?? undefined);

        sessionTabId = null;
        sessionId = null;
        sessionStartTime = null;

        if (wsConnection?.readyState === WebSocket.OPEN) {
          try {
            wsConnection.send(JSON.stringify({
              type: 'session_lost',
              reason: 'tab_closed',
              message: 'Session tab was closed'
            }));
          } catch (error) {
            console.log('[Blindflight] Failed to notify server of session loss:', (error as Error).message);
          }
        }
      }
    });

    browser.browserAction.onClicked.addListener(() => {
      toggleKillSwitch().catch((error) => {
        console.error('[Blindflight] Failed to toggle kill switch from toolbar click:', error);
      });
    });

    // Initialize on startup
    init();
  }
});
