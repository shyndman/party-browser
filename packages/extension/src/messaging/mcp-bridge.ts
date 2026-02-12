/**
 * MCP Bridge for PartyBrowser extension
 * Manages WebSocket connection to MCP server with reconnection logic
 */

/// <reference path="../types/global.d.ts" />

import type { CommandName, CommandResult } from '../types/commands';
import type { McpMessage } from '../types/messages';
import { ErrorCodes, type ErrorCode } from '../utils/errors';
import type { SessionManager } from '../session/session-manager';
import type { CommandHandler } from '../commands/command-handler';

export interface McpBridgeConfig {
  reconnectInterval: number;
  maxReconnectAttempts: number;
}

export const DEFAULT_BRIDGE_CONFIG: McpBridgeConfig = {
  reconnectInterval: 5000,
  maxReconnectAttempts: 10
};

/**
 * Manages WebSocket connection to MCP server
 */
export class McpBridge {
  private wsConnection: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isServerRunning = false;
  private port: number = 3456;

  constructor(
    private sessionManager: SessionManager,
    private commandHandler: CommandHandler,
    private config: McpBridgeConfig = DEFAULT_BRIDGE_CONFIG
  ) {}

  /**
   * Connect to the MCP server WebSocket
   * @param port The WebSocket port to connect to
   */
  connect(port: number): Promise<void> {
    this.port = port;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.isServerRunning) {
      console.log('[PartyBrowser] Server already running');
      return Promise.resolve();
    }

    console.log(`[PartyBrowser] Starting WebSocket connection on port ${port}`);

    return new Promise((resolve, reject) => {
      try {
        this.wsConnection = new WebSocket(`ws://localhost:${port}`);

        this.wsConnection.onopen = () => {
          console.log('[PartyBrowser] Extension connected to MCP server');
          this.isServerRunning = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.wsConnection.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data) as McpMessage;
            console.log('[PartyBrowser] Received command from MCP:', message);

            // Handle mcpCommand type
            const mcpCmd = message as { type?: string; command?: CommandName; params?: Record<string, unknown> };
            if (mcpCmd.type === 'mcpCommand' && mcpCmd.command) {
              const result = await this.commandHandler.execute(mcpCmd.command, mcpCmd.params || {});
              console.log('[PartyBrowser] Sending response to MCP:', result);
              this.send(result);
              return;
            }

            // Handle direct message types (legacy format)
            const directMessageTypes: Record<string, CommandName> = {
              'navigate': 'navigate',
              'go_back': 'go_back',
              'go_forward': 'go_forward',
              'click': 'click',
              'drag': 'drag',
              'hover': 'hover',
              'type': 'type',
              'press_key': 'press_key',
              'select_option': 'select_option',
              'wait': 'wait',
              'wait_for': 'wait_for',
              'screenshot': 'screenshot',
              'snapshot': 'snapshot',
              'get_console_logs': 'getConsoleLogs',
              'evaluate': 'evaluate',
              'close': 'close',
              'getUrl': 'getUrl',
              'getTitle': 'getTitle',
              'get_network_requests': 'getNetworkRequests',
              'get_console_messages': 'getConsoleMessages'
            };

            const msg = message as { type?: string; id?: string; payload?: Record<string, unknown> };
            if (msg.type && directMessageTypes[msg.type]) {
              const command = directMessageTypes[msg.type];
              const result = await this.commandHandler.execute(command, msg.payload || {});
              const responsePayload = {
                id: msg.id,
                result: result,
                error: result.success ? undefined : result.error,
                errorCode: result.errorCode
              };
              console.log('[PartyBrowser] Sending response to MCP:', responsePayload);
              this.send(responsePayload);
              return;
            }

            const unknownTypeResponse = {
              id: msg.id,
              success: false,
              error: `Unknown message type: ${msg.type}`,
              errorCode: ErrorCodes.COMMAND_FAILED
            };
            this.send(unknownTypeResponse);
          } catch (error) {
            console.error('[PartyBrowser] Error processing message:', error);
            this.sendErrorResponse(error);
          }
        };

        this.wsConnection.onclose = () => {
          this.handleDisconnect();
        };

        this.wsConnection.onerror = (error) => {
          console.error('[PartyBrowser] WebSocket error:', error);
          this.isServerRunning = false;
          reject(error);
        };
      } catch (error) {
        console.error('[PartyBrowser] Failed to start WebSocket:', error);
        this.isServerRunning = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the MCP server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.wsConnection) {
      try {
        if (this.wsConnection.readyState === WebSocket.OPEN || this.wsConnection.readyState === WebSocket.CONNECTING) {
          this.wsConnection.close();
        }
      } catch (error) {
        console.error('[PartyBrowser] Error closing WebSocket:', error);
      }
      this.wsConnection = null;
    }

    this.isServerRunning = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Send a message to the MCP server
   */
  send(message: unknown): void {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify(message));
    }
  }

  /**
   * Check if connected to MCP server
   */
  isConnected(): boolean {
    return this.isServerRunning && this.wsConnection?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current reconnect attempt count
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Handle disconnect and schedule reconnect
   */
  private handleDisconnect(): void {
    const wasConnected = this.isServerRunning;
    this.isServerRunning = false;
    this.wsConnection = null;

    let reason = 'transport_drop';
    if (this.reconnectAttempts > 0) {
      reason = 'reconnect';
    }

    // Clear session on disconnect
    this.sessionManager.clearSession(reason);

    console.warn(`[PartyBrowser] Extension disconnected (reason: ${reason}); pending commands will fail. Reconnecting...`);

    // Schedule reconnect if under max attempts
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[PartyBrowser] Attempting reconnect ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
      this.reconnectTimer = setTimeout(() => {
        this.connect(this.port).catch((error) => {
          console.error('[PartyBrowser] Reconnect failed:', error);
        });
      }, this.config.reconnectInterval);
    }
  }

  /**
   * Send error response for processing errors
   */
  private sendErrorResponse(error: unknown): void {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      const errorResponse = {
        success: false,
        error: (error as Error).message,
        errorCode: (error as { errorCode?: ErrorCode }).errorCode || ErrorCodes.TRANSPORT_UNAVAILABLE
      };
      this.wsConnection.send(JSON.stringify(errorResponse));
    }
  }
}
