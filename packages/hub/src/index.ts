import { WebSocketServer, type WebSocket } from "ws";

import {
  HUB_ERROR_CODES,
  HubError,
  type HubErrorCode,
} from "@/errors";
import { CommandRouter } from "@/router/command-router";
import { routeExtensionIngressMessage } from "@/router/extension-router";
import { routeMcpIngressMessage } from "@/router/mcp-router";
import {
  HUB_CONTROL_COMMANDS,
  HUB_CONTROL_EVENTS,
  HUB_CONTROL_MESSAGE_TYPES,
  HUB_EXTENSION_MESSAGE_TYPES,
  HUB_JOIN_DECISIONS,
  parseJsonMessage,
  type ExtensionControlCommandMessage,
  type ExtensionControlEventMessage,
  type ExtensionControlResponseMessage,
  type ExtensionSessionResultMessage,
  type JoinDecisionMessage,
  type JoinRequestMessage,
  type McpSessionCommandEnvelope,
  type McpSessionResultEnvelope,
} from "@/protocol/messages";
import { SessionStore, SESSION_LIFECYCLE_STATES } from "@/state/session-store";
import { WaitingRoomStore } from "@/state/waiting-room-store";

const DEFAULT_HUB_PORT = 3456;
const DEFAULT_HUB_HOST = "127.0.0.1";

type HubRuntimeOptions = {
  port?: number;
  host?: string;
};

type ConnectionRole = "unknown" | "mcp" | "extension";

type ConnectionRecord = {
  id: string;
  role: ConnectionRole;
  socket: WebSocket;
};

export class HubRuntime {
  private readonly options: Required<HubRuntimeOptions>;
  private readonly connections = new Map<string, ConnectionRecord>();
  private readonly commandRouter = new CommandRouter();
  private readonly sessionStore = new SessionStore();
  private readonly waitingRoomStore = new WaitingRoomStore();
  private extensionConnectionId: string | undefined;
  private killSwitchEnabled = true;
  private wss: WebSocketServer | undefined;
  private nextConnectionSequence = 0;

  constructor(options: HubRuntimeOptions = {}) {
    this.options = {
      port: options.port ?? DEFAULT_HUB_PORT,
      host: options.host ?? DEFAULT_HUB_HOST,
    };
  }

  async start(): Promise<void> {
    if (this.wss) {
      return;
    }

    this.wss = new WebSocketServer({
      host: this.options.host,
      port: this.options.port,
    });

    this.wss.on("connection", (socket) => {
      const id = this.createConnectionId();
      this.connections.set(id, {
        id,
        role: "unknown",
        socket,
      });

      socket.on("message", (data) => {
        this.handleInboundMessage(id, data.toString());
      });

      socket.on("close", () => {
        this.handleConnectionClosed(id);
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.wss?.once("listening", () => resolve());
      this.wss?.once("error", reject);
    });

    console.log(
      `[hub] listening on ws://${this.options.host}:${this.options.port}`,
    );
  }

  async stop(): Promise<void> {
    if (!this.wss) {
      return;
    }

    const sockets = [...this.connections.values()].map((connection) => connection.socket);
    for (const socket of sockets) {
      socket.close();
    }
    this.connections.clear();

    await new Promise<void>((resolve, reject) => {
      this.wss?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.wss = undefined;
  }

  getBoundPort(): number {
    const address = this.wss?.address();
    if (address && typeof address === "object" && "port" in address) {
      return address.port;
    }
    return this.options.port;
  }

  private handleInboundMessage(connectionId: string, rawMessage: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = parseJsonMessage(rawMessage);
    } catch {
      this.sendHubError(connection, "Malformed JSON message.", HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
      return;
    }

    try {
      this.routeByRole(connection, parsed);
    } catch (error) {
      const hubError =
        error instanceof HubError
          ? error
          : new HubError(String(error), HUB_ERROR_CODES.ROUTING_FAILED);
      this.sendHubError(connection, hubError.message, hubError.errorCode);
    }
  }

  private routeByRole(connection: ConnectionRecord, parsed: unknown): void {
    if (connection.role === "unknown") {
      this.assignConnectionRole(connection, parsed);
    }

    if (connection.role === "mcp") {
      routeMcpIngressMessage(parsed, {
        onJoinRequest: (message) => this.handleJoinRequest(connection.id, message),
        onSessionCommand: (message) => this.handleMcpSessionCommand(connection.id, message),
      });
      return;
    }

    if (connection.role === "extension") {
      routeExtensionIngressMessage(parsed, {
        onControlCommand: (message) => this.handleExtensionControlCommand(connection.id, message),
        onSessionResult: (message) => this.handleExtensionSessionResult(message),
      });
      return;
    }

    throw new HubError(
      "Unable to infer connection role from message.",
      HUB_ERROR_CODES.PROTOCOL_UNKNOWN_MESSAGE_TYPE,
    );
  }

  private assignConnectionRole(connection: ConnectionRecord, parsed: unknown): void {
    try {
      routeMcpIngressMessage(parsed, {
        onJoinRequest: () => undefined,
        onSessionCommand: () => undefined,
      });
      connection.role = "mcp";
      return;
    } catch {
      // Not MCP shape.
    }

    try {
      routeExtensionIngressMessage(parsed, {
        onControlCommand: () => undefined,
        onSessionResult: () => undefined,
      });
      this.setExtensionConnection(connection);
      return;
    } catch {
      // Not extension shape.
    }

    throw new HubError(
      "First message does not match MCP or extension protocol.",
      HUB_ERROR_CODES.PROTOCOL_UNKNOWN_MESSAGE_TYPE,
    );
  }

  private handleJoinRequest(connectionId: string, message: JoinRequestMessage): void {
    if (!this.killSwitchEnabled) {
      this.sendJoinDecision(connectionId, {
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION,
        decision: HUB_JOIN_DECISIONS.REJECT,
        rejectReason: "Kill switch is disabled.",
      });
      return;
    }

    const joinRequestTime = Date.now();
    const session = this.sessionStore.createPendingSession({
      connectionId,
      name: message.name,
      reason: message.reason,
      url: message.url,
      joinRequestTime,
    });

    this.waitingRoomStore.add({
      sessionId: session.sessionId,
      connectionId,
      name: message.name,
      reason: message.reason,
      url: message.url,
      joinRequestTime,
    });

    this.broadcastWaitingRoomSync();
  }

  private handleMcpSessionCommand(connectionId: string, message: McpSessionCommandEnvelope): void {
    this.sessionStore.assertSessionConnection(message.sessionId, connectionId);

    if (!this.killSwitchEnabled) {
      this.sendMcpSessionResult(connectionId, {
        requestId: message.requestId,
        sessionId: message.sessionId,
        type: message.type,
        payload: null,
        error: "Kill switch is disabled.",
        errorCode: HUB_ERROR_CODES.KILL_SWITCH_DISABLED,
      });
      return;
    }

    const session = this.sessionStore.getSession(message.sessionId);
    if (!session || session.state === SESSION_LIFECYCLE_STATES.REVOKED) {
      this.sendMcpSessionResult(connectionId, {
        requestId: message.requestId,
        sessionId: message.sessionId,
        type: message.type,
        payload: null,
        error: "Session is revoked.",
        errorCode: HUB_ERROR_CODES.SESSION_REVOKED,
      });
      return;
    }

    if (session.state !== SESSION_LIFECYCLE_STATES.ACTIVE) {
      this.sendMcpSessionResult(connectionId, {
        requestId: message.requestId,
        sessionId: message.sessionId,
        type: message.type,
        payload: null,
        error: "Waiting-room decision required before command routing.",
        errorCode: HUB_ERROR_CODES.WAITING_ROOM_DECISION_REQUIRED,
      });
      return;
    }

    const extensionConnection = this.getExtensionConnection();
    if (!extensionConnection) {
      this.sendMcpSessionResult(connectionId, {
        requestId: message.requestId,
        sessionId: message.sessionId,
        type: message.type,
        payload: null,
        error: "Extension connection is unavailable.",
        errorCode: HUB_ERROR_CODES.EXTENSION_UNAVAILABLE,
      });
      return;
    }

    this.commandRouter.forwardToExtension(message, connectionId, extensionConnection.socket);
  }

  private handleExtensionSessionResult(message: ExtensionSessionResultMessage): void {
    const resolution = this.commandRouter.resolveFromExtension(message);
    if (!resolution) {
      return;
    }

    this.sendMcpSessionResult(resolution.mcpConnectionId, resolution.response);
  }

  private handleExtensionControlCommand(
    connectionId: string,
    message: ExtensionControlCommandMessage,
  ): void {
    if (message.command === HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST) {
      this.sendControlResponse(connectionId, {
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE,
        requestId: message.requestId,
        success: true,
        payload: { entries: this.waitingRoomStore.listSorted() },
      });
      return;
    }

    if (message.command === HUB_CONTROL_COMMANDS.WAITING_ROOM_DECIDE) {
      this.applyWaitingRoomDecision(connectionId, message);
      return;
    }

    if (message.command === HUB_CONTROL_COMMANDS.KILL_SWITCH_SET) {
      this.applyKillSwitchCommand(connectionId, message);
      return;
    }

    this.sendControlResponse(connectionId, {
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE,
      requestId: message.requestId,
      success: false,
      error: `Unknown control command: ${message.command}`,
      errorCode: HUB_ERROR_CODES.PROTOCOL_UNKNOWN_MESSAGE_TYPE,
    });
  }

  private applyWaitingRoomDecision(
    connectionId: string,
    message: ExtensionControlCommandMessage,
  ): void {
    const sessionId = String(message.payload.sessionId || "");
    const decision = String(message.payload.decision || "");
    if (!sessionId || !decision) {
      this.sendControlResponse(connectionId, {
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE,
        requestId: message.requestId,
        success: false,
        error: "Missing sessionId or decision for waiting-room decision.",
        errorCode: HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      });
      return;
    }

    const waitingEntry = this.waitingRoomStore.remove(sessionId);
    if (!waitingEntry) {
      this.sendControlResponse(connectionId, {
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE,
        requestId: message.requestId,
        success: false,
        error: `Waiting-room entry not found for session ${sessionId}`,
        errorCode: HUB_ERROR_CODES.WAITING_ROOM_ENTRY_NOT_FOUND,
      });
      return;
    }

    if (decision === HUB_JOIN_DECISIONS.JOIN) {
      this.sessionStore.activateSession(sessionId);
      this.sendJoinDecision(waitingEntry.connectionId, {
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION,
        decision: HUB_JOIN_DECISIONS.JOIN,
        sessionId,
      });
      this.sendControlEvent({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT,
        event: HUB_CONTROL_EVENTS.SESSION_APPROVED,
        payload: {
          sessionId,
          url: waitingEntry.url,
        },
      });
    } else {
      this.sessionStore.revokeSession(sessionId, "operator_reject");
      this.sendJoinDecision(waitingEntry.connectionId, {
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION,
        decision: HUB_JOIN_DECISIONS.REJECT,
        rejectReason: "Join request rejected by operator.",
      });
    }

    this.broadcastWaitingRoomSync();
    this.sendControlResponse(connectionId, {
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE,
      requestId: message.requestId,
      success: true,
      payload: {
        sessionId,
        decision,
      },
    });
  }

  private applyKillSwitchCommand(
    connectionId: string,
    message: ExtensionControlCommandMessage,
  ): void {
    const enabled = Boolean(message.payload.enabled);
    this.killSwitchEnabled = enabled;
    if (!enabled) {
      this.revokeAll("kill_switch_disabled", HUB_ERROR_CODES.KILL_SWITCH_DISABLED);
    }

    this.sendControlEvent({
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT,
      event: HUB_CONTROL_EVENTS.SESSIONS_REVOKED_ALL,
      payload: {
        reason: enabled ? "kill_switch_enabled" : "kill_switch_disabled",
      },
    });

    this.sendControlResponse(connectionId, {
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE,
      requestId: message.requestId,
      success: true,
      payload: { enabled },
    });
  }

  private revokeAll(reason: string, errorCode: HubErrorCode): void {
    const waitingEntries = this.waitingRoomStore.listSorted();
    for (const entry of waitingEntries) {
      this.sendJoinDecision(entry.connectionId, {
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION,
        decision: HUB_JOIN_DECISIONS.REJECT,
        rejectReason: reason,
      });
    }

    this.waitingRoomStore.clear();
    this.sessionStore.revokeAllSessions(reason);
    this.broadcastWaitingRoomSync();

    const failures = this.commandRouter.failAll(reason, errorCode);
    for (const failure of failures) {
      this.sendMcpSessionResult(failure.mcpConnectionId, failure.response);
    }
  }

  private sendJoinDecision(connectionId: string, decision: JoinDecisionMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }
    connection.socket.send(JSON.stringify(decision));
  }

  private sendMcpSessionResult(connectionId: string, response: McpSessionResultEnvelope): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }
    connection.socket.send(JSON.stringify(response));
  }

  private sendControlResponse(
    connectionId: string,
    response: ExtensionControlResponseMessage,
  ): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }
    connection.socket.send(JSON.stringify(response));
  }

  private sendControlEvent(message: ExtensionControlEventMessage): void {
    const extensionConnection = this.getExtensionConnection();
    if (!extensionConnection) {
      return;
    }
    extensionConnection.socket.send(JSON.stringify(message));
  }

  private broadcastWaitingRoomSync(): void {
    this.sendControlEvent({
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT,
      event: HUB_CONTROL_EVENTS.WAITING_ROOM_SYNC,
      payload: {
        entries: this.waitingRoomStore.listSorted(),
      },
    });
  }

  private sendHubError(
    connection: ConnectionRecord,
    message: string,
    errorCode: HubErrorCode,
  ): void {
    connection.socket.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.ERROR,
        success: false,
        error: message,
        errorCode,
      }),
    );
  }

  private setExtensionConnection(connection: ConnectionRecord): void {
    connection.role = "extension";
    if (this.extensionConnectionId && this.extensionConnectionId !== connection.id) {
      const previous = this.connections.get(this.extensionConnectionId);
      previous?.socket.close();
    }
    this.extensionConnectionId = connection.id;
    this.broadcastWaitingRoomSync();
  }

  private getExtensionConnection(): ConnectionRecord | undefined {
    if (!this.extensionConnectionId) {
      return undefined;
    }
    return this.connections.get(this.extensionConnectionId);
  }

  private handleConnectionClosed(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    this.connections.delete(connectionId);
    if (connection.role === "extension") {
      this.extensionConnectionId = undefined;
      this.revokeAll("extension_disconnect", HUB_ERROR_CODES.SESSION_REVOKED);
    }
  }

  private createConnectionId(): string {
    this.nextConnectionSequence += 1;
    return `conn_${Date.now()}_${this.nextConnectionSequence}`;
  }
}

async function run(): Promise<void> {
  const port = Number(process.env.PARTYBROWSER_HUB_PORT ?? DEFAULT_HUB_PORT);
  const host = process.env.PARTYBROWSER_HUB_HOST ?? DEFAULT_HUB_HOST;
  const runtime = new HubRuntime({ port, host });
  await runtime.start();

  const stop = async () => {
    await runtime.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void stop();
  });
  process.on("SIGTERM", () => {
    void stop();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void run();
}
