/**
 * MCP Bridge for PartyBrowser extension
 * Manages WebSocket connection to MCP/hub with reconnect logic
 */

/// <reference path="../types/global.d.ts" />

import type { CommandName, CommandResult } from '../types/commands';
import {
  ControlCommands,
  ControlEvents,
  type ControlResponseMessage,
  type McpMessage,
  type WaitingRoomDecision,
  type WaitingRoomEntry,
  WaitingRoomDecisions,
  WsMessageKinds,
} from '../types/messages';
import { ErrorCodes, type ErrorCode } from '../utils/errors';
import type { SessionManager } from '../session/session-manager';
import type { CommandHandler } from '../commands/command-handler';

export interface McpBridgeConfig {
  reconnectInterval: number;
}

export const DEFAULT_BRIDGE_CONFIG: McpBridgeConfig = {
  reconnectInterval: 10000,
};

const CONTROL_RESPONSE_TIMEOUT_MS = 5000;

interface PendingControlRequest {
  resolve: (value: ControlResponseMessage) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Manages WebSocket connection to MCP server
 */
export class McpBridge {
  private wsConnection: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isServerRunning = false;
  private port = 3456;
  private controlRequestSeq = 0;

  private waitingRoom = new Map<string, WaitingRoomEntry>();
  private pendingControlRequests = new Map<string, PendingControlRequest>();
  private waitingRoomChangedCallbacks: Array<(entries: WaitingRoomEntry[]) => void> = [];
  private connectionStateCallbacks: Array<(isConnected: boolean) => void> = [];


  constructor(
    private sessionManager: SessionManager,
    private commandHandler: CommandHandler,
    private config: McpBridgeConfig = DEFAULT_BRIDGE_CONFIG,
    private isCommandExecutionAllowed: () => boolean = () => true,
  ) {}

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
          console.log('[PartyBrowser] Extension connected to MCP/hub');
          this.isServerRunning = true;
          this.reconnectAttempts = 0;
          this.notifyConnectionStateChange(true);
          resolve();
        };

        this.wsConnection.onmessage = async (event) => {
          try {
            const parsed = JSON.parse(event.data) as McpMessage;
            await this.handleInboundMessage(parsed);
          } catch (error) {
            console.error('[PartyBrowser] Error processing message:', error);
            this.sendErrorResponse(
              undefined,
              (error as Error).message,
              (error as { errorCode?: ErrorCode }).errorCode ?? ErrorCodes.COMMAND_FAILED,
            );
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

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.wsConnection) {
      try {
        if (
          this.wsConnection.readyState === WebSocket.OPEN ||
          this.wsConnection.readyState === WebSocket.CONNECTING
        ) {
          this.wsConnection.close();
        }
      } catch (error) {
        console.error('[PartyBrowser] Error closing WebSocket:', error);
      }
      this.wsConnection = null;
    }

    this.isServerRunning = false;
    this.notifyConnectionStateChange(false);
    this.reconnectAttempts = 0;
    this.rejectPendingControlRequests('transport disconnected');
  }

  send(message: unknown): void {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify(message));
    }
  }

  isConnected(): boolean {
    return (
      this.isServerRunning && this.wsConnection?.readyState === WebSocket.OPEN
    );
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  getWaitingRoomEntries(): WaitingRoomEntry[] {
    return this.sortedWaitingRoomEntries();
  }

  onWaitingRoomChanged(callback: (entries: WaitingRoomEntry[]) => void): void {
    this.waitingRoomChangedCallbacks.push(callback);
  }
  onConnectionStateChanged(callback: (isConnected: boolean) => void): void {
    this.connectionStateCallbacks.push(callback);
    callback(this.isConnected());
  }



  async requestWaitingRoomRefresh(): Promise<void> {
    await this.sendControlCommand(ControlCommands.WAITING_ROOM_LIST, {}, true);
  }

  async submitWaitingRoomDecision(
    sessionId: string,
    decision: WaitingRoomDecision,
  ): Promise<ControlResponseMessage> {
    return this.sendControlCommand(
      ControlCommands.WAITING_ROOM_DECIDE,
      { sessionId, decision },
      true,
    );
  }

  publishKillSwitchState(enabled: boolean): void {
    void this.sendControlCommand(
      ControlCommands.KILL_SWITCH_SET,
      { enabled },
      false,
    );
  }

  private async handleInboundMessage(message: McpMessage): Promise<void> {
    if (message.type === WsMessageKinds.SESSION_COMMAND) {
      await this.handleSessionCommand(message as {
        requestId?: unknown;
        sessionId?: unknown;
        command?: unknown;
        payload?: unknown;
      });
      return;
    }

    if (message.type === WsMessageKinds.CONTROL_EVENT) {
      await this.handleControlEvent(message as {
        event?: unknown;
        payload?: unknown;
      });
      return;
    }

    if (message.type === WsMessageKinds.CONTROL_RESPONSE) {
      this.handleControlResponse(message as {
        requestId?: unknown;
        success?: unknown;
        payload?: unknown;
        error?: unknown;
        errorCode?: unknown;
      });
      return;
    }

    this.sendErrorResponse(
      undefined,
      `Unknown message kind: ${(message as { type?: unknown }).type as string}`,
      ErrorCodes.UNKNOWN_MESSAGE_KIND,
    );
  }

  private async handleSessionCommand(message: {
    requestId?: unknown;
    sessionId?: unknown;
    command?: unknown;
    payload?: unknown;
  }): Promise<void> {
    const requestId = this.requireString(message.requestId, 'requestId');
    const sessionId = this.requireString(message.sessionId, 'sessionId');
    const command = this.requireString(message.command, 'command') as CommandName;
    const payload =
      typeof message.payload === 'object' && message.payload !== null
        ? (message.payload as Record<string, unknown>)
        : {};

    if (!this.isCommandExecutionAllowed()) {
      this.send({
        type: WsMessageKinds.SESSION_RESULT,
        requestId,
        sessionId,
        success: false,
        error:
          'Kill switch is disabled. Command execution is hard-denied until re-enabled.',
        errorCode: ErrorCodes.KILL_SWITCH_DISABLED,
      });
      return;
    }

    const result = await this.commandHandler.execute(command, payload, sessionId);
    this.send({
      type: WsMessageKinds.SESSION_RESULT,
      requestId,
      sessionId,
      success: result.success,
      result,
      error: result.error,
      errorCode: result.errorCode,
    });
  }

  private async handleControlEvent(message: {
    event?: unknown;
    payload?: unknown;
  }): Promise<void> {
    const event = this.requireString(message.event, 'event');
    const payload =
      typeof message.payload === 'object' && message.payload !== null
        ? (message.payload as Record<string, unknown>)
        : {};

    switch (event) {
      case ControlEvents.SESSION_APPROVED: {
        const sessionId = this.requireString(payload.sessionId, 'payload.sessionId');
        const url = this.requireString(payload.url, 'payload.url');

        if (!this.sessionManager.hasLease(sessionId)) {
          const lease = await this.sessionManager.createLease(sessionId, url);
          console.log(
            `[PartyBrowser] Approved session lease created: ${sessionId} (window ${lease.windowId}, tab ${lease.tabId})`,
          );
        } else {
          const existingLease = this.sessionManager.getLease(sessionId);
          if (existingLease) {
            console.log(
              `[PartyBrowser] Approved session already has lease: ${sessionId} (window ${existingLease.windowId}, tab ${existingLease.tabId})`,
            );
          }
        }
        return;
      }

      case ControlEvents.SESSION_REVOKED: {
        const sessionId = this.requireString(payload.sessionId, 'payload.sessionId');
        const reason =
          typeof payload.reason === 'string' && payload.reason.length > 0
            ? payload.reason
            : 'hub_revoke';
        await this.sessionManager.revokeLease(sessionId, reason, true);
        this.waitingRoom.delete(sessionId);
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.SESSIONS_REVOKED_ALL: {
        const reason =
          typeof payload.reason === 'string' && payload.reason.length > 0
            ? payload.reason
            : 'hub_revoke_all';
        await this.sessionManager.revokeAllLeases(reason, true);
        this.waitingRoom.clear();
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.WAITING_ROOM_SYNC: {
        const entries = this.parseWaitingRoomEntries(payload.entries);
        this.waitingRoom.clear();
        for (const entry of entries) {
          this.waitingRoom.set(entry.sessionId, entry);
        }
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.WAITING_ROOM_ENTRY_ADDED: {
        const entry = this.parseWaitingRoomEntry(payload.entry);
        this.waitingRoom.set(entry.sessionId, entry);
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.WAITING_ROOM_ENTRY_REMOVED: {
        const sessionId = this.requireString(payload.sessionId, 'payload.sessionId');
        this.waitingRoom.delete(sessionId);
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.KILL_SWITCH_CHANGED: {
        const enabled = Boolean(payload.enabled);
        if (!enabled) {
          await this.sessionManager.revokeAllLeases('kill_switch_disabled', true);
        }
        return;
      }

      default:
        this.sendErrorResponse(
          undefined,
          `Unknown control event: ${event}`,
          ErrorCodes.CONTROL_EVENT_INVALID,
        );
    }
  }

  private handleControlResponse(message: {
    requestId?: unknown;
    success?: unknown;
    payload?: unknown;
    error?: unknown;
    errorCode?: unknown;
  }): void {
    const requestId = this.requireString(message.requestId, 'requestId');
    const pending = this.pendingControlRequests.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingControlRequests.delete(requestId);

    pending.resolve({
      type: WsMessageKinds.CONTROL_RESPONSE,
      requestId,
      success: Boolean(message.success),
      payload:
        typeof message.payload === 'object' && message.payload !== null
          ? (message.payload as Record<string, unknown>)
          : undefined,
      error: typeof message.error === 'string' ? message.error : undefined,
      errorCode:
        typeof message.errorCode === 'string'
          ? (message.errorCode as ErrorCode)
          : undefined,
    });
  }

  private sendControlCommand(
    command: string,
    payload: Record<string, unknown>,
    awaitResponse: boolean,
  ): Promise<ControlResponseMessage> {
    if (!this.isConnected()) {
      return Promise.reject(
        new Error('Cannot send control command while transport is disconnected.'),
      );
    }

    const requestId = this.nextControlRequestId();
    this.send({
      type: WsMessageKinds.CONTROL_COMMAND,
      requestId,
      command,
      payload,
    });

    if (!awaitResponse) {
      return Promise.resolve({
        type: WsMessageKinds.CONTROL_RESPONSE,
        requestId,
        success: true,
      });
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingControlRequests.delete(requestId);
        reject(
          new Error(
            `Timed out waiting for control response to ${command} (${requestId}).`,
          ),
        );
      }, CONTROL_RESPONSE_TIMEOUT_MS);

      this.pendingControlRequests.set(requestId, { resolve, reject, timeout });
    });
  }

  private requireString(value: unknown, fieldName: string): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    const error = new Error(`Missing or invalid required field: ${fieldName}`) as Error & {
      errorCode?: ErrorCode;
    };
    error.errorCode = ErrorCodes.CONTROL_EVENT_INVALID;
    throw error;
  }

  private parseWaitingRoomEntries(raw: unknown): WaitingRoomEntry[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.map((entry) => this.parseWaitingRoomEntry(entry));
  }

  private parseWaitingRoomEntry(raw: unknown): WaitingRoomEntry {
    const entry = raw as Record<string, unknown>;
    const sessionId = this.requireString(entry.sessionId, 'entry.sessionId');
    const name = this.requireString(entry.name, 'entry.name');
    const reason = this.requireString(entry.reason, 'entry.reason');
    const url = this.requireString(entry.url, 'entry.url');
    const joinRequestTime = Number(
      entry.joinRequestTime ?? entry.join_request_time,
    );

    if (!Number.isFinite(joinRequestTime)) {
      const error = new Error('Missing or invalid required field: entry.joinRequestTime') as Error & {
        errorCode?: ErrorCode;
      };
      error.errorCode = ErrorCodes.CONTROL_EVENT_INVALID;
      throw error;
    }

    return {
      sessionId,
      name,
      reason,
      url,
      joinRequestTime,
    };
  }

  private sortedWaitingRoomEntries(): WaitingRoomEntry[] {
    return [...this.waitingRoom.values()].sort((a, b) => {
      if (a.joinRequestTime !== b.joinRequestTime) {
        return a.joinRequestTime - b.joinRequestTime;
      }
      return a.sessionId.localeCompare(b.sessionId);
    });
  }
  private notifyConnectionStateChange(isConnected: boolean): void {
    for (const callback of this.connectionStateCallbacks) {
      try {
        callback(isConnected);
      } catch (error) {
        console.error('[PartyBrowser] Connection state callback failed:', error);
      }
    }
  }


  private notifyWaitingRoomChanged(): void {
    const entries = this.sortedWaitingRoomEntries();
    this.waitingRoomChangedCallbacks.forEach((cb) => cb(entries));
  }

  private rejectPendingControlRequests(reason: string): void {
    for (const [requestId, pending] of this.pendingControlRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Control request ${requestId} failed: ${reason}`));
    }
    this.pendingControlRequests.clear();
  }

  private nextControlRequestId(): string {
    this.controlRequestSeq += 1;
    return `ctrl_${Date.now()}_${this.controlRequestSeq}`;
  }

  private handleDisconnect(): void {
    const reason = this.reconnectAttempts > 0 ? 'reconnect' : 'transport_drop';

    this.isServerRunning = false;
    this.wsConnection = null;
    this.notifyConnectionStateChange(false);
    this.rejectPendingControlRequests('transport disconnected');

    void this.sessionManager.revokeAllLeases(reason, true);

    this.waitingRoom.clear();
    this.notifyWaitingRoomChanged();

    console.warn(
      `[PartyBrowser] Extension disconnected (reason: ${reason}); pending commands will fail. Reconnecting...`,
    );

    this.reconnectAttempts += 1;
    console.log(
      `[PartyBrowser] Attempting reconnect ${this.reconnectAttempts}`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.port).catch((error) => {
        console.error('[PartyBrowser] Reconnect failed:', error);
      });
    }, this.config.reconnectInterval);
  }

  private sendErrorResponse(
    requestId: string | undefined,
    error: string,
    errorCode: ErrorCode,
  ): void {
    this.send({
      type: WsMessageKinds.ERROR,
      requestId,
      success: false,
      error,
      errorCode,
    });
  }
}
