/**
 * Background script entrypoint for Blindflight Firefox extension
 * Orchestrates session management, messaging, and command handling
 */

/// <reference path="../src/types/global.d.ts" />

import { defineBackground } from 'wxt/utils/define-background';
import { CodedError, ErrorCodes, type ErrorCode } from '../src/utils/errors';
import type { CommandName, CommandResult } from '../src/types/commands';
import type { StatusResponse, KillSwitchResponse, McpMessage } from '../src/types/messages';

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
    // Initialize modules
    const sessionManager = new SessionManager(DEFAULT_SESSION_CONFIG);
    const networkCapture = new NetworkCapture();
    const iconManager = new IconManager();
    const contentBridge = new ContentBridge();

    // Create command handler with dependencies
    const commandHandler = new CommandHandler(
      sessionManager,
      networkCapture,
      null as unknown as McpBridge,  // Will be set after creation
      contentBridge
    );

    // Create MCP bridge with circular dependency resolution
    const mcpBridge = new McpBridge(
      sessionManager,
      commandHandler,
      DEFAULT_BRIDGE_CONFIG
    );

    // Update command handler with mcpBridge reference
    (commandHandler as unknown as { mcpBridge: McpBridge }).mcpBridge = mcpBridge;

    // State
    let isKillSwitchEnabled = true;

    // ============================================================
    // Initialization
    // ============================================================

    async function init(): Promise<void> {
      console.log('[Blindflight] Background script initialized');
      iconManager.updateFromStatus(false, isKillSwitchEnabled);
      const port = await loadPortFromStorage();
      mcpBridge.connect(port).catch((error) => {
        console.error('[Blindflight] Initial connection failed:', error);
      });
    }

    async function loadPortFromStorage(): Promise<number> {
      try {
        const result = await browser.storage.local.get('serverPort');
        return (result.serverPort as number) || DEFAULT_PORT;
      } catch (error) {
        console.error('[Blindflight] Failed to load port from storage:', error);
        return DEFAULT_PORT;
      }
    }

    // ============================================================
    // Kill Switch
    // ============================================================

    async function toggleKillSwitch(): Promise<KillSwitchResponse> {
      isKillSwitchEnabled = !isKillSwitchEnabled;
      console.log('[Blindflight] Kill switch toggled:', isKillSwitchEnabled ? 'ENABLED' : 'DISABLED');

      if (!isKillSwitchEnabled) {
        mcpBridge.disconnect();
        iconManager.updateFromStatus(false, isKillSwitchEnabled);
        return { isEnabled: isKillSwitchEnabled };
      }

      const port = await loadPortFromStorage();
      mcpBridge.connect(port).catch((error) => {
        console.error('[Blindflight] Connection failed after kill switch:', error);
      });
      iconManager.updateFromStatus(mcpBridge.isConnected(), isKillSwitchEnabled);
      return { isEnabled: isKillSwitchEnabled };
    }

    // ============================================================
    // Event Listeners
    // ============================================================

    browser.runtime.onMessage.addListener(((
      message: unknown,
      _sender: browser.Runtime.MessageSender,
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
        commandHandler.execute(msg.command!, msg.params || {})
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
          isServerRunning: mcpBridge.isConnected(),
          reconnectAttempts: mcpBridge.getReconnectAttempts(),
          isKillSwitchEnabled,
          sessionTabId: sessionManager.getSessionTabId()
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
      if (sessionManager.getSessionTabId() === removedTabId) {
        console.log('[Blindflight] Session ownership cleared (reason: tab_closed)');
        console.warn('[Blindflight] Session tab closed; clearing session binding');

        networkCapture.stopCapture();
        networkCapture.clearLogs();
        sessionManager.clearSession('tab_closed');

        if (mcpBridge.isConnected()) {
          try {
            mcpBridge.send({
              type: 'session_lost',
              reason: 'tab_closed',
              message: 'Session tab was closed'
            });
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
