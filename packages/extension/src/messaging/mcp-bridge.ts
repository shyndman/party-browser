/**
 * MCP Bridge for PartyBrowser extension
 * Manages WebSocket connection to MCP/hub with reconnect logic
 */

/// <reference path="../types/global.d.ts" />

import {
  MCP_COMMANDS,
  ControlCommands,
  ControlEvents,
  type ControlResponseMessage,
  type McpMessage,
  type WaitingRoomDecision,
  type WaitingRoomEntry,
  WaitingRoomDecisions,
  WsMessageKinds,
} from '../types/messages';
import { CodedError, ErrorCodes, type ErrorCode } from '../utils/errors';
import type { SessionManager } from '../session/session-manager';
import type { CommandHandler } from '../commands/command-handler';
import { SessionLeaseKinds, type SessionLeaseKind } from '../types/session';

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
      console.log('[PartyBrowser] Connection already active');
      return Promise.resolve();
    }

    if (this.reconnectAttempts > 0) {
      console.log(
        `[PartyBrowser] (Attempt ${this.reconnectAttempts}) Reconnecting to Hub on port ${port}...`,
      );
    } else {
      console.log(`[PartyBrowser] Connecting to Hub on port ${port}...`);
    }

    return new Promise((resolve, reject) => {
      try {
        this.wsConnection = new WebSocket(`ws://localhost:${port}`);

        this.wsConnection.onopen = () => {
          console.log('[PartyBrowser] WebSocket connected successfully');
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

        this.wsConnection.onclose = (event) => {
          console.warn(
            `[PartyBrowser] WebSocket closed (code: ${event.code}, reason: "${event.reason || 'none'}", wasClean: ${event.wasClean})`,
          );
          this.handleDisconnect(event.code, event.reason);
        };

        this.wsConnection.onerror = () => {
          // onclose will follow and handle the state/reconnect
          console.error('[PartyBrowser] WebSocket error occurred');
          this.isServerRunning = false;
          reject(new Error('WebSocket error'));
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
    if (decision === WaitingRoomDecisions.REJECT) {
      return this.sendControlCommand(
        ControlCommands.WAITING_ROOM_DECIDE,
        { sessionId, decision },
        true,
      );
    }

    const entry = this.waitingRoom.get(sessionId);
    if (!entry) {
      return this.createLocalControlFailure(
        `Waiting-room entry not found for session ${sessionId}`,
        ErrorCodes.WAITING_ROOM_ENTRY_NOT_FOUND,
      );
    }

    let leaseCreated = false;
    try {
      await this.createLeaseForWaitingRoomEntry(entry);
      leaseCreated = true;

      const response = await this.sendControlCommand(
        ControlCommands.WAITING_ROOM_DECIDE,
        { sessionId, decision },
        true,
      );

      if (!response.success) {
        await this.sessionManager.revokeLease(sessionId, 'hub_decision_failed');
      }

      return response;
    } catch (error) {
      if (leaseCreated) {
        await this.sessionManager.revokeLease(sessionId, 'hub_decision_failed');
      }

      const message = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof CodedError ? error.errorCode : ErrorCodes.COMMAND_FAILED;
      console.error('[PartyBrowser] Session approval setup failed.', {
        operation: 'approval_setup',
        sessionId,
        error: message,
        errorCode,
      });

      if (!leaseCreated) {
        this.waitingRoom.delete(sessionId);
        this.notifyWaitingRoomChanged();
        try {
          const response = await this.sendControlCommand(
            ControlCommands.WAITING_ROOM_DECIDE,
            { sessionId, decision: 'setup_failed', error: message, errorCode },
            true,
          );
          if (!response.success) {
            console.error('[PartyBrowser] Failed to report approval setup failure to hub.', {
              sessionId, error: response.error, errorCode: response.errorCode,
            });
          }
        } catch (reportError) {
          console.error('[PartyBrowser] Failed to report approval setup failure to hub.', {
            sessionId, error: reportError instanceof Error ? reportError.message : String(reportError),
          });
        }
      }
      return this.createLocalControlFailure(message, errorCode);
    }
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
    const wireCommand = this.requireString(message.command, 'command');
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

    if (!Object.hasOwn(MCP_COMMANDS, wireCommand)) {
      const error = `Unknown command: ${wireCommand}`;
      console.error('[PartyBrowser] MCP command rejected.', { requestId, sessionId, command: wireCommand, error });
      this.send({
        type: WsMessageKinds.SESSION_RESULT,
        requestId,
        sessionId,
        success: false,
        error,
        errorCode: ErrorCodes.COMMAND_FAILED,
      });
      return;
    }

    const command = MCP_COMMANDS[wireCommand as keyof typeof MCP_COMMANDS];

    const result = await this.commandHandler.execute(command, payload, sessionId, requestId);
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
        const leaseKind = this.parseSessionLeaseKind(payload.leaseKind, 'payload.leaseKind');

        console.log(
          `[PartyBrowser] Control event SESSION_APPROVED received (sessionId=${sessionId}, leaseKind=${leaseKind}, alreadyLeased=${this.sessionManager.hasLease(sessionId)}, waitingRoomSize=${this.waitingRoom.size})`,
        );

        const existingLease = this.sessionManager.getLease(sessionId);
        if (!existingLease) {
          console.error(
            `[PartyBrowser] SESSION_APPROVED arrived without a local lease for session ${sessionId}; refusing old post-approval lease creation path.`,
          );
          return;
        }

        console.log(
          `[PartyBrowser] Approved session already has lease: ${sessionId} (kind=${existingLease.leaseKind}, window ${existingLease.windowId}, tab ${existingLease.tabId})`,
        );
        return;
      }

      case ControlEvents.SESSION_REVOKED: {
        const sessionId = this.requireString(payload.sessionId, 'payload.sessionId');
        const reason =
          typeof payload.reason === 'string' && payload.reason.length > 0
            ? payload.reason
            : 'hub_revoke';
        const existingLease = this.sessionManager.getLease(sessionId);
        console.warn(
          `[PartyBrowser] Control event SESSION_REVOKED received (sessionId=${sessionId}, reason=${reason}, hasLease=${existingLease !== null}, lease=${this.stringifyForLog(existingLease)})`,
        );
        await this.sessionManager.revokeLease(sessionId, reason);
        this.waitingRoom.delete(sessionId);
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.SESSIONS_REVOKED_ALL: {
        const reason =
          typeof payload.reason === 'string' && payload.reason.length > 0
            ? payload.reason
            : 'hub_revoke_all';
        console.warn(
          `[PartyBrowser] Control event SESSIONS_REVOKED_ALL received (reason=${reason}, leaseCount=${this.sessionManager.getLeaseCount()}, waitingRoomSize=${this.waitingRoom.size})`,
        );
        await this.sessionManager.revokeAllLeases(reason);
        this.waitingRoom.clear();
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.WAITING_ROOM_SYNC: {
        const entries = this.parseWaitingRoomEntries(payload.entries);
        console.log(
          `[PartyBrowser] Control event WAITING_ROOM_SYNC received (entryCount=${entries.length}, existingWaitingRoomSize=${this.waitingRoom.size})`,
        );
        this.waitingRoom.clear();
        for (const entry of entries) {
          this.waitingRoom.set(entry.sessionId, entry);
        }
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.WAITING_ROOM_ENTRY_ADDED: {
        const entry = this.parseWaitingRoomEntry(payload.entry);
        console.log(
          `[PartyBrowser] Control event WAITING_ROOM_ENTRY_ADDED received (sessionId=${entry.sessionId}, leaseKind=${entry.leaseKind}, url=${entry.url ?? 'none'}, reason=${entry.reason})`,
        );
        this.waitingRoom.set(entry.sessionId, entry);
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.WAITING_ROOM_ENTRY_REMOVED: {
        const sessionId = this.requireString(payload.sessionId, 'payload.sessionId');
        console.log(
          `[PartyBrowser] Control event WAITING_ROOM_ENTRY_REMOVED received (sessionId=${sessionId}, wasPresent=${this.waitingRoom.has(sessionId)})`,
        );
        this.waitingRoom.delete(sessionId);
        this.notifyWaitingRoomChanged();
        return;
      }

      case ControlEvents.KILL_SWITCH_CHANGED: {
        const enabled = Boolean(payload.enabled);
        console.warn(
          `[PartyBrowser] Control event KILL_SWITCH_CHANGED received (enabled=${enabled}, leaseCount=${this.sessionManager.getLeaseCount()})`,
        );
        if (!enabled) {
          await this.sessionManager.revokeAllLeases('kill_switch_disabled');
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
    const leaseKind = this.parseSessionLeaseKind(entry.leaseKind, 'entry.leaseKind');
    const url =
      leaseKind === SessionLeaseKinds.WORKSPACE
        ? this.requireString(entry.url, 'entry.url')
        : undefined;

    if (leaseKind === SessionLeaseKinds.TAKEOVER && entry.url !== undefined) {
      const error = new Error('takeover waiting-room entries must omit url') as Error & {
        errorCode?: ErrorCode;
      };
      error.errorCode = ErrorCodes.CONTROL_EVENT_INVALID;
      throw error;
    }

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
      leaseKind,
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

  private handleDisconnect(code?: number, closeReason?: string): void {
    const reason =
      code === 1000 || code === 1001
        ? 'normal_closure'
        : this.reconnectAttempts > 0
          ? 'reconnect'
          : 'transport_drop';

    this.isServerRunning = false;
    this.wsConnection = null;
    this.notifyConnectionStateChange(false);
    this.rejectPendingControlRequests('transport disconnected');

    console.warn(
      `[PartyBrowser] Disconnected (reason=${reason}, code=${code}, closeReason="${closeReason || ''}"). Revoking ${this.sessionManager.getLeaseCount()} leases.`,
    );

    void this.sessionManager.revokeAllLeases(reason);

    this.waitingRoom.clear();
    this.notifyWaitingRoomChanged();

    this.reconnectAttempts += 1;
    console.log(`[PartyBrowser] Scheduled reconnect in ${this.config.reconnectInterval}ms`);
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

  private stringifyForLog(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }

  private async createLeaseForWaitingRoomEntry(entry: WaitingRoomEntry): Promise<void> {
    if (entry.leaseKind === SessionLeaseKinds.WORKSPACE) {
      if (!entry.url) {
        throw new Error(`Workspace waiting-room entry ${entry.sessionId} is missing url.`);
      }

      await this.sessionManager.createWorkspaceLease(entry.sessionId, entry.url);
      return;
    }

    await this.sessionManager.createTakeoverLease(entry.sessionId);
  }

  private parseSessionLeaseKind(value: unknown, fieldName: string): SessionLeaseKind {
    if (value === SessionLeaseKinds.WORKSPACE || value === SessionLeaseKinds.TAKEOVER) {
      return value;
    }

    const error = new Error(`Missing or invalid required field: ${fieldName}`) as Error & {
      errorCode?: ErrorCode;
    };
    error.errorCode = ErrorCodes.CONTROL_EVENT_INVALID;
    throw error;
  }

  private createLocalControlFailure(error: string, errorCode: ErrorCode): ControlResponseMessage {
    return {
      type: WsMessageKinds.CONTROL_RESPONSE,
      requestId: this.nextControlRequestId(),
      success: false,
      error,
      errorCode,
    };
  }
}
