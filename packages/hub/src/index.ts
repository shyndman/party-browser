import { WebSocketServer, type WebSocket } from "ws";

import {
  HUB_ERROR_CODES,
  HubError,
  type HubErrorCode,
} from "@/errors";
import { createHubLogger, getHubLogLevel } from "@/logger";
import { getHubBuildFingerprintLines } from "@/build-fingerprint";
import { CommandRouter } from "@/router/command-router";
import { routeExtensionIngressMessage } from "@/router/extension-router";
import { routeMcpIngressMessage } from "@/router/mcp-router";
import { WaitingRoomJoinSoundNotifier } from "@/audio/waiting-room-sound";
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
import {
  SessionStore,
  SESSION_LIFECYCLE_STATES,
  type SessionLifecycleState,
  type SessionRecord,
} from "@/state/session-store";
import { WaitingRoomStore } from "@/state/waiting-room-store";

const DEFAULT_HUB_PORT = 3456;
const DEFAULT_HUB_HOST = "127.0.0.1";
const EXTENSION_SESSION_LEASE_NOT_FOUND = "SESSION_LEASE_NOT_FOUND";

type WorkflowLogMetadata = {
  failedPhase?: string;
  waitRequired?: boolean;
};

function extractWorkflowLogMetadata(result: unknown): WorkflowLogMetadata {
  if (!result || typeof result !== "object") {
    return {};
  }

  const workflow = (result as { meta?: { workflow?: WorkflowLogMetadata } }).meta?.workflow;
  return workflow ?? {};
}

type HubRuntimeOptions = {
  port?: number;
  host?: string;
  waitingRoomJoinSoundNotifier?: WaitingRoomJoinSoundNotifierLike;
};

type ResolvedHubRuntimeOptions = {
  port: number;
  host: string;
};

type WaitingRoomJoinSoundNotifierLike = {
  notifyJoinRequest(sessionId: string): Promise<void>;
};

type ConnectionRole = "unknown" | "mcp" | "extension";

type ConnectionRecord = {
  id: string;
  role: ConnectionRole;
  socket: WebSocket;
};

type ErrorDetails = {
  errorName: string;
  errorMessage: string;
  stack?: string;
};

function getErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    };
  }

  return {
    errorName: typeof error,
    errorMessage: String(error),
  };
}

function getMessageType(parsed: unknown): string | undefined {
  if (
    parsed &&
    typeof parsed === "object" &&
    "type" in parsed &&
    typeof (parsed as { type?: unknown }).type === "string"
  ) {
    return (parsed as { type: string }).type;
  }

  return undefined;
}

export class HubRuntime {
  private readonly options: ResolvedHubRuntimeOptions;
  private readonly logger = createHubLogger("hub.runtime");
  private readonly connections = new Map<string, ConnectionRecord>();
  private readonly commandRouter = new CommandRouter();
  private readonly sessionStore = new SessionStore();
  private readonly waitingRoomStore = new WaitingRoomStore();
  private readonly waitingRoomJoinSoundNotifier: WaitingRoomJoinSoundNotifierLike;
  private extensionConnectionId: string | undefined;
  private killSwitchEnabled = true;
  private wss: WebSocketServer | undefined;
  private nextConnectionSequence = 0;

  private getSessionLogMetadata(
    session: Pick<SessionRecord, "sessionId" | "connectionId" | "name" | "url" | "state">,
  ): Record<string, unknown> {
    return {
      sessionId: session.sessionId,
      sessionConnectionId: session.connectionId,
      sessionName: session.name,
      sessionUrl: session.url,
      sessionState: session.state,
    };
  }

  private logSessionLifecycle(
    message: string,
    session: Pick<SessionRecord, "sessionId" | "connectionId" | "name" | "url" | "state">,
    metadata: {
      fromState?: SessionLifecycleState | "none";
      toState: SessionLifecycleState;
      reason?: string;
      requestId?: string;
      decision?: string;
      removedFromWaitingRoom?: boolean;
      leaseReadyAcknowledged?: boolean;
      likelyCause?: string;
    } = {
      toState: session.state,
    },
  ): void {
    this.logger.info(message, {
      event: "session.lifecycle",
      ...this.getSessionLogMetadata(session),
      ...metadata,
    });
  }

  constructor(options: HubRuntimeOptions = {}) {
    this.options = {
      port: options.port ?? DEFAULT_HUB_PORT,
      host: options.host ?? DEFAULT_HUB_HOST,
    };
    this.waitingRoomJoinSoundNotifier =
      options.waitingRoomJoinSoundNotifier ??
      new WaitingRoomJoinSoundNotifier({
        logger: createHubLogger("hub.waiting_room_sound"),
      });
  }

  async start(): Promise<void> {
    if (this.wss) {
      this.logger.debug("Start requested but hub runtime is already running.", {
        event: "hub.start",
        host: this.options.host,
        port: this.options.port,
      });
      return;
    }

    this.logger.info("Starting hub runtime.", {
      event: "hub.start",
      host: this.options.host,
      port: this.options.port,
      logLevel: getHubLogLevel(),
    });

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

      this.logger.info("Connection opened.", {
        event: "connection.open",
        connectionId: id,
        role: "unknown",
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

    this.logger.info("Hub runtime listening.", {
      event: "hub.start",
      host: this.options.host,
      port: this.getBoundPort(),
    });
  }

  async stop(): Promise<void> {
    if (!this.wss) {
      this.logger.debug("Stop requested but hub runtime is not running.", {
        event: "hub.stop",
      });
      return;
    }

    this.logger.info("Stopping hub runtime.", {
      event: "hub.stop",
      connectionCount: this.connections.size,
    });

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

    this.logger.info("Hub runtime stopped.", {
      event: "hub.stop",
    });
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
      this.logger.warn("Inbound message received for missing connection.", {
        event: "message.inbound",
        connectionId,
      });
      return;
    }

    this.logger.info("Inbound message received.", {
      event: "message.inbound",
      connectionId,
      role: connection.role,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Inbound message payload.", {
        event: "message.inbound",
        connectionId,
        role: connection.role,
        payload: rawMessage,
      });
    }

    let parsed: unknown;
    try {
      parsed = parseJsonMessage(rawMessage);
    } catch (error) {
      const parseError = getErrorDetails(error);
      this.logger.error("Failed to parse inbound message.", {
        event: "error.protocol",
        connectionId,
        role: connection.role,
        errorCode: HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
        errorName: parseError.errorName,
        errorMessage: parseError.errorMessage,
        stack: parseError.stack,
      });
      this.sendHubError(connection, "Malformed JSON message.", HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
      return;
    }

    const messageType = getMessageType(parsed) ?? "unknown";
    this.logger.info("Inbound message parsed.", {
      event: "message.inbound",
      connectionId,
      role: connection.role,
      messageType,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Inbound message body.", {
        event: "message.inbound",
        connectionId,
        role: connection.role,
        messageType,
        payload: parsed,
      });
    }

    try {
      this.routeByRole(connection, parsed);
    } catch (error) {
      if (!(error instanceof HubError)) {
        const unexpectedError = getErrorDetails(error);
        this.logger.error("Unexpected routing exception.", {
          event: "error.routing",
          connectionId,
          role: connection.role,
          messageType,
          errorName: unexpectedError.errorName,
          errorMessage: unexpectedError.errorMessage,
          stack: unexpectedError.stack,
        });
      }

      const hubError =
        error instanceof HubError
          ? error
          : new HubError(String(error), HUB_ERROR_CODES.ROUTING_FAILED);

      this.logger.error("Inbound message routing failed.", {
        event: "message.route_error",
        connectionId,
        role: connection.role,
        messageType,
        errorCode: hubError.errorCode,
        errorMessage: hubError.message,
        stack: hubError.stack,
      });

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
        onSessionResult: (message) => this.handleExtensionSessionResult(connection.id, message),
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
      this.logger.info("Assigned connection role.", {
        event: "message.role_assigned",
        connectionId: connection.id,
        role: connection.role,
      });
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
    this.logger.info("Join request received.", {
      event: "session.join_request",
      connectionId,
      name: message.name,
      url: message.url,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Join request payload.", {
        event: "session.join_request",
        connectionId,
        payload: message,
      });
    }

    if (!this.killSwitchEnabled) {
      this.logger.info("Join request rejected because kill switch is disabled.", {
        event: "session.join_request",
        connectionId,
        decision: HUB_JOIN_DECISIONS.REJECT,
        reason: "kill_switch_disabled",
      });
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

    this.logger.info("Join request added to waiting room.", {
      event: "session.join_request",
      connectionId,
      decision: "pending",
      sessionId: session.sessionId,
    });
    this.logSessionLifecycle("Session entered waiting room.", session, {
      fromState: "none",
      toState: session.state,
      reason: "join_request_received",
    });

    void this.waitingRoomJoinSoundNotifier.notifyJoinRequest(session.sessionId).catch((error) => {
      const details = getErrorDetails(error);
      this.logger.warn("Unexpected waiting-room join sound notifier failure.", {
        event: "hub.waiting_room_sound.play",
        sessionId: session.sessionId,
        errorName: details.errorName,
        errorMessage: details.errorMessage,
      });
    });

    this.broadcastWaitingRoomSync();
  }

  private handleMcpSessionCommand(connectionId: string, message: McpSessionCommandEnvelope): void {
    this.logger.info("MCP session command received.", {
      event: "session.command_forwarded",
      connectionId,
      requestId: message.requestId,
      sessionId: message.sessionId,
      commandType: message.type,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("MCP session command payload.", {
        event: "session.command_forwarded",
        connectionId,
        requestId: message.requestId,
        sessionId: message.sessionId,
        commandType: message.type,
        payload: message.payload,
      });
    }

    try {
      this.sessionStore.assertSessionConnection(message.sessionId, connectionId);
    } catch (error) {
      const hubError =
        error instanceof HubError
          ? error
          : new HubError(String(error), HUB_ERROR_CODES.ROUTING_FAILED);

      this.logger.info("MCP session command rejected during session routing.", {
        event: "session.command_forwarded",
        forwarded: false,
        connectionId,
        requestId: message.requestId,
        sessionId: message.sessionId,
        commandType: message.type,
        errorCode: hubError.errorCode,
      });
      this.sendMcpSessionResult(connectionId, {
        requestId: message.requestId,
        sessionId: message.sessionId,
        type: message.type,
        payload: null,
        error: hubError.message,
        errorCode: hubError.errorCode,
      });
      return;
    }

    if (!this.killSwitchEnabled) {
      this.logger.info("MCP session command rejected by kill switch.", {
        event: "session.command_forwarded",
        forwarded: false,
        connectionId,
        requestId: message.requestId,
        sessionId: message.sessionId,
        commandType: message.type,
        errorCode: HUB_ERROR_CODES.KILL_SWITCH_DISABLED,
      });
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
      this.logger.info("MCP session command rejected for revoked session.", {
        event: "session.command_forwarded",
        forwarded: false,
        connectionId,
        requestId: message.requestId,
        sessionId: message.sessionId,
        commandType: message.type,
        errorCode: HUB_ERROR_CODES.SESSION_REVOKED,
      });
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
      this.logger.info("MCP session command rejected pending waiting-room decision.", {
        event: "session.command_forwarded",
        forwarded: false,
        connectionId,
        requestId: message.requestId,
        sessionId: message.sessionId,
        commandType: message.type,
        errorCode: HUB_ERROR_CODES.WAITING_ROOM_DECISION_REQUIRED,
      });
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
      this.logger.info("MCP session command rejected because extension is unavailable.", {
        event: "session.command_forwarded",
        forwarded: false,
        connectionId,
        requestId: message.requestId,
        sessionId: message.sessionId,
        commandType: message.type,
        errorCode: HUB_ERROR_CODES.EXTENSION_UNAVAILABLE,
      });
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
    this.logger.info("MCP session command forwarded to extension.", {
      event: "session.command_forwarded",
      forwarded: true,
      connectionId,
      extensionConnectionId: extensionConnection.id,
      requestId: message.requestId,
      sessionId: message.sessionId,
      commandType: message.type,
    });
  }

  private handleExtensionSessionResult(
    connectionId: string,
    message: ExtensionSessionResultMessage,
  ): void {
    const workflow = extractWorkflowLogMetadata(message.result);

    this.logger.info("Extension session result received.", {
      event: "session.result_resolved",
      connectionId,
      requestId: message.requestId,
      sessionId: message.sessionId,
      success: message.success,
      errorCode: message.errorCode,
      failedPhase: workflow.failedPhase,
      waitRequired: workflow.waitRequired,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Extension session result payload.", {
        event: "session.result_resolved",
        connectionId,
        payload: message,
      });
    }

    const resolution = this.commandRouter.resolveFromExtension(message);
    if (!resolution) {
      this.logger.warn("Extension session result did not match a pending command.", {
        event: "session.result_resolved",
        connectionId,
        requestId: message.requestId,
        sessionId: message.sessionId,
      });
      return;
    }

    if (!message.success && message.errorCode === EXTENSION_SESSION_LEASE_NOT_FOUND) {
      const session = this.sessionStore.getSession(message.sessionId);
      this.logger.warn(
        "Extension reported missing session lease; likely approval-before-lease-ready race after hub approval.",
        {
          event: "session.result_resolved",
          connectionId,
          mcpConnectionId: resolution.mcpConnectionId,
          requestId: resolution.response.requestId,
          sessionId: resolution.response.sessionId,
          commandType: resolution.response.type,
          success: false,
          errorCode: message.errorCode,
          sessionState: session?.state,
          likelyCause: "approval_before_extension_lease_ready",
        },
      );
    }

    if (!message.success && workflow.failedPhase) {
      this.logger.warn("Extension command failed during workflow phase.", {
        event: "session.result_resolved",
        connectionId,
        mcpConnectionId: resolution.mcpConnectionId,
        requestId: resolution.response.requestId,
        sessionId: resolution.response.sessionId,
        commandType: resolution.response.type,
        success: false,
        failedPhase: workflow.failedPhase,
        errorCode: message.errorCode,
      });
    }

    this.logger.info("Resolved extension result to MCP response.", {
      event: "session.result_resolved",
      connectionId,
      mcpConnectionId: resolution.mcpConnectionId,
      requestId: resolution.response.requestId,
      sessionId: resolution.response.sessionId,
      commandType: resolution.response.type,
      success: !resolution.response.error,
      errorCode: resolution.response.errorCode,
      failedPhase: workflow.failedPhase,
      waitRequired: workflow.waitRequired,
    });

    this.sendMcpSessionResult(resolution.mcpConnectionId, resolution.response);
  }

  private handleExtensionControlCommand(
    connectionId: string,
    message: ExtensionControlCommandMessage,
  ): void {
    this.logger.info("Extension control command received.", {
      event: "message.inbound",
      connectionId,
      command: message.command,
      requestId: message.requestId,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Extension control command payload.", {
        event: "message.inbound",
        connectionId,
        command: message.command,
        requestId: message.requestId,
        payload: message.payload,
      });
    }

    if (message.command === HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST) {
      this.logger.info("Returning waiting room list.", {
        event: "control.waiting_room_list",
        connectionId,
        requestId: message.requestId,
      });
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

    this.logger.error("Received unknown extension control command.", {
      event: "error.protocol",
      connectionId,
      requestId: message.requestId,
      command: message.command,
      errorCode: HUB_ERROR_CODES.PROTOCOL_UNKNOWN_MESSAGE_TYPE,
    });

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

    this.logger.info("Applying waiting-room decision.", {
      event: "control.waiting_room_decision",
      connectionId,
      requestId: message.requestId,
      sessionId,
      decision,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Waiting-room decision payload.", {
        event: "control.waiting_room_decision",
        connectionId,
        requestId: message.requestId,
        payload: message.payload,
      });
    }

    if (!sessionId || !decision) {
      this.logger.error("Waiting-room decision missing required fields.", {
        event: "error.protocol",
        connectionId,
        requestId: message.requestId,
        sessionId,
        decision,
        errorCode: HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      });
      this.sendControlResponse(connectionId, {
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE,
        requestId: message.requestId,
        success: false,
        error: "Missing sessionId or decision for waiting-room decision.",
        errorCode: HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      });
      return;
    }

    if (decision !== HUB_JOIN_DECISIONS.JOIN && decision !== HUB_JOIN_DECISIONS.REJECT) {
      this.logger.error("Waiting-room decision has invalid decision value.", {
        event: "error.protocol",
        connectionId,
        requestId: message.requestId,
        sessionId,
        decision,
        errorCode: HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      });
      this.sendControlResponse(connectionId, {
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE,
        requestId: message.requestId,
        success: false,
        error: "Waiting-room decision must be join or reject.",
        errorCode: HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      });
      return;
    }

    const waitingEntry = this.waitingRoomStore.remove(sessionId);
    if (!waitingEntry) {
      this.logger.info("Waiting-room decision referenced missing session.", {
        event: "control.waiting_room_decision",
        connectionId,
        requestId: message.requestId,
        sessionId,
        decision,
        success: false,
        errorCode: HUB_ERROR_CODES.WAITING_ROOM_ENTRY_NOT_FOUND,
      });
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
      const activatedSession = this.sessionStore.activateSession(sessionId);
      this.logSessionLifecycle(
        "Session approved in hub; MCP approval sent before extension lease-ready ack exists.",
        activatedSession,
        {
          fromState: SESSION_LIFECYCLE_STATES.PENDING,
          toState: activatedSession.state,
          requestId: message.requestId,
          decision,
          leaseReadyAcknowledged: false,
        },
      );
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
      const revokeResult = this.sessionStore.revokeSession(sessionId, "operator_reject");
      this.logSessionLifecycle("Session rejected and revoked from waiting room.", revokeResult.record, {
        fromState: SESSION_LIFECYCLE_STATES.PENDING,
        toState: revokeResult.record.state,
        requestId: message.requestId,
        decision,
        reason: "operator_reject",
        removedFromWaitingRoom: true,
      });
      this.sendJoinDecision(waitingEntry.connectionId, {
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION,
        decision: HUB_JOIN_DECISIONS.REJECT,
        rejectReason: "Join request rejected by operator.",
      });
    }

    this.broadcastWaitingRoomSync();
    this.logger.info("Waiting-room decision applied.", {
      event: "control.waiting_room_decision",
      connectionId,
      requestId: message.requestId,
      sessionId,
      decision,
      success: true,
    });
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

    this.logger.info("Applying kill switch command.", {
      event: "control.kill_switch_set",
      connectionId,
      requestId: message.requestId,
      enabled,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Kill switch command payload.", {
        event: "control.kill_switch_set",
        connectionId,
        requestId: message.requestId,
        payload: message.payload,
      });
    }

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

    this.logger.info("Kill switch command applied.", {
      event: "control.kill_switch_set",
      connectionId,
      requestId: message.requestId,
      enabled,
    });
  }

  private revokeAll(reason: string, errorCode: HubErrorCode): void {
    const waitingEntries = this.waitingRoomStore.listSorted();
    const sessionsToRevoke = [
      ...this.sessionStore.getSessionsByState(SESSION_LIFECYCLE_STATES.PENDING),
      ...this.sessionStore.getSessionsByState(SESSION_LIFECYCLE_STATES.ACTIVE),
    ];
    this.logger.info("Revoking all sessions and waiting-room entries.", {
      event: "hub.revoke_all",
      reason,
      errorCode,
      waitingEntryCount: waitingEntries.length,
    });

    for (const entry of waitingEntries) {
      this.sendJoinDecision(entry.connectionId, {
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION,
        decision: HUB_JOIN_DECISIONS.REJECT,
        rejectReason: reason,
      });
    }

    this.waitingRoomStore.clear();
    for (const session of sessionsToRevoke) {
      const previousState = session.state;
      const revokeResult = this.sessionStore.revokeSession(session.sessionId, reason);
      if (!revokeResult.changed) {
        continue;
      }

      this.logSessionLifecycle("Session revoked during hub-wide teardown.", revokeResult.record, {
        fromState: previousState,
        toState: revokeResult.record.state,
        reason,
        removedFromWaitingRoom: previousState === SESSION_LIFECYCLE_STATES.PENDING,
      });
    }
    this.broadcastWaitingRoomSync();

    const failures = this.commandRouter.failAll(reason, errorCode);
    this.logger.info("Failing all pending MCP commands.", {
      event: "hub.revoke_all",
      reason,
      errorCode,
      failedCommandCount: failures.length,
    });
    for (const failure of failures) {
      this.sendMcpSessionResult(failure.mcpConnectionId, failure.response);
    }
  }

  private revokeSessionsForConnection(
    connectionId: string,
    reason: string,
    errorCode: HubErrorCode,
  ): void {
    const sessions = [
      ...this.sessionStore.getSessionsByState(SESSION_LIFECYCLE_STATES.PENDING),
      ...this.sessionStore.getSessionsByState(SESSION_LIFECYCLE_STATES.ACTIVE),
    ].filter((session) => session.connectionId === connectionId);

    let removedPendingCount = 0;
    let revokedPendingCount = 0;
    let revokedActiveCount = 0;
    let failedCommandCount = 0;

    for (const session of sessions) {
      const previousState = session.state;
      const waitingEntry = this.waitingRoomStore.remove(session.sessionId);
      if (waitingEntry) {
        removedPendingCount += 1;
      }

      const revokeResult = this.sessionStore.revokeSession(session.sessionId, reason);
      if (revokeResult.changed) {
        if (previousState === SESSION_LIFECYCLE_STATES.PENDING) {
          revokedPendingCount += 1;
        } else if (previousState === SESSION_LIFECYCLE_STATES.ACTIVE) {
          revokedActiveCount += 1;
        }

        this.logSessionLifecycle("Session revoked because MCP connection closed.", revokeResult.record, {
          fromState: previousState,
          toState: revokeResult.record.state,
          reason,
          removedFromWaitingRoom: Boolean(waitingEntry),
        });

        this.sendControlEvent({
          type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT,
          event: HUB_CONTROL_EVENTS.SESSION_REVOKED,
          payload: {
            sessionId: session.sessionId,
            reason,
          },
        });
      }

      const failures = this.commandRouter.failSession(session.sessionId, reason, errorCode);
      failedCommandCount += failures.length;
      for (const failure of failures) {
        this.sendMcpSessionResult(failure.mcpConnectionId, failure.response);
      }
    }

    if (sessions.length > 0) {
      this.broadcastWaitingRoomSync();
    }

    this.logger.info("Revoked sessions for disconnected MCP connection.", {
      event: "connection.close",
      connectionId,
      reason,
      affectedSessionCount: sessions.length,
      removedPendingCount,
      revokedPendingCount,
      revokedActiveCount,
      failedCommandCount,
    });
  }

  private sendToSocket(
    connection: ConnectionRecord,
    body: string,
    metadata: Record<string, unknown>,
  ): void {
    try {
      connection.socket.send(body);
    } catch (error) {
      const sendError = getErrorDetails(error);
      this.logger.error("Failed to send websocket message.", {
        event: "error.socket_send",
        connectionId: connection.id,
        role: connection.role,
        ...metadata,
        errorName: sendError.errorName,
        errorMessage: sendError.errorMessage,
        stack: sendError.stack,
      });
      throw error;
    }
  }

  private sendJoinDecision(connectionId: string, decision: JoinDecisionMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      this.logger.warn("Join decision target connection not found.", {
        event: "session.join_request",
        connectionId,
        decision: decision.decision,
      });
      return;
    }

    this.logger.info("Sending join decision.", {
      event: "session.join_request",
      connectionId,
      decision: decision.decision,
      sessionId: "sessionId" in decision ? decision.sessionId : undefined,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Join decision payload.", {
        event: "session.join_request",
        connectionId,
        payload: decision,
      });
    }

    this.sendToSocket(connection, JSON.stringify(decision), {
      channel: "join_decision",
      decision: decision.decision,
      sessionId: "sessionId" in decision ? decision.sessionId : undefined,
    });
  }

  private sendMcpSessionResult(connectionId: string, response: McpSessionResultEnvelope): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      this.logger.warn("MCP session result target connection not found.", {
        event: "session.result_resolved",
        connectionId,
        requestId: response.requestId,
        sessionId: response.sessionId,
        commandType: response.type,
      });
      return;
    }

    this.logger.info("Sending MCP session result.", {
      event: "session.result_resolved",
      connectionId,
      requestId: response.requestId,
      sessionId: response.sessionId,
      commandType: response.type,
      success: !response.error,
      errorCode: response.errorCode,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("MCP session result payload.", {
        event: "session.result_resolved",
        connectionId,
        payload: response,
      });
    }

    this.sendToSocket(connection, JSON.stringify(response), {
      channel: "session_result",
      requestId: response.requestId,
      sessionId: response.sessionId,
      commandType: response.type,
      success: !response.error,
      errorCode: response.errorCode,
    });
  }

  private sendControlResponse(
    connectionId: string,
    response: ExtensionControlResponseMessage,
  ): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      this.logger.warn("Control response target connection not found.", {
        event: "control.response",
        connectionId,
        requestId: response.requestId,
      });
      return;
    }

    this.logger.info("Sending extension control response.", {
      event: "control.response",
      connectionId,
      requestId: response.requestId,
      success: response.success,
      errorCode: response.errorCode,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Extension control response payload.", {
        event: "control.response",
        connectionId,
        payload: response,
      });
    }

    this.sendToSocket(connection, JSON.stringify(response), {
      channel: "control_response",
      requestId: response.requestId,
      success: response.success,
      errorCode: response.errorCode,
    });
  }

  private sendControlEvent(message: ExtensionControlEventMessage): void {
    const extensionConnection = this.getExtensionConnection();
    if (!extensionConnection) {
      this.logger.warn("Control event dropped because extension connection is unavailable.", {
        event: "control.event",
        controlEvent: message.event,
      });
      return;
    }

    this.logger.info("Sending extension control event.", {
      event: "control.event",
      connectionId: extensionConnection.id,
      controlEvent: message.event,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Extension control event payload.", {
        event: "control.event",
        connectionId: extensionConnection.id,
        payload: message,
      });
    }

    this.sendToSocket(extensionConnection, JSON.stringify(message), {
      channel: "control_event",
      controlEvent: message.event,
    });
  }

  private broadcastWaitingRoomSync(): void {
    const entries = this.waitingRoomStore.listSorted();
    this.logger.info("Broadcasting waiting-room sync.", {
      event: "control.waiting_room_sync",
      entryCount: entries.length,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Waiting-room sync payload.", {
        event: "control.waiting_room_sync",
        payload: entries,
      });
    }

    this.sendControlEvent({
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT,
      event: HUB_CONTROL_EVENTS.WAITING_ROOM_SYNC,
      payload: {
        entries,
      },
    });
  }

  private sendHubError(
    connection: ConnectionRecord,
    message: string,
    errorCode: HubErrorCode,
  ): void {
    const envelope = {
      type: HUB_EXTENSION_MESSAGE_TYPES.ERROR,
      success: false as const,
      error: message,
      errorCode,
    };

    this.logger.error("Sending hub protocol error.", {
      event: "error.protocol",
      connectionId: connection.id,
      role: connection.role,
      errorCode,
      errorMessage: message,
    });
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug("Hub protocol error payload.", {
        event: "error.protocol",
        connectionId: connection.id,
        payload: envelope,
      });
    }

    this.sendToSocket(connection, JSON.stringify(envelope), {
      channel: "hub_error",
      errorCode,
    });
  }

  private setExtensionConnection(connection: ConnectionRecord): void {
    connection.role = "extension";
    this.logger.info("Assigned connection role.", {
      event: "message.role_assigned",
      connectionId: connection.id,
      role: connection.role,
    });

    if (this.extensionConnectionId && this.extensionConnectionId !== connection.id) {
      const previous = this.connections.get(this.extensionConnectionId);
      this.logger.info("Replacing previous extension connection.", {
        event: "connection.close",
        connectionId: this.extensionConnectionId,
        role: previous?.role,
        reason: "extension_replaced",
      });
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
      this.logger.debug("Connection close received for missing connection.", {
        event: "connection.close",
        connectionId,
      });
      return;
    }

    this.logger.info("Connection closed.", {
      event: "connection.close",
      connectionId,
      role: connection.role,
    });

    this.connections.delete(connectionId);
    if (connection.role === "extension") {
      if (this.extensionConnectionId !== connectionId) {
        this.logger.info("Stale extension connection closed after replacement; current extension remains active.", {
          event: "connection.close",
          connectionId,
          role: connection.role,
          currentExtensionConnectionId: this.extensionConnectionId,
          reason: "extension_replaced",
        });
        return;
      }

      this.extensionConnectionId = undefined;
      this.logger.info("Extension disconnected; revoking all sessions.", {
        event: "connection.close",
        connectionId,
        role: connection.role,
        reason: "extension_disconnect",
      });
      this.revokeAll("extension_disconnect", HUB_ERROR_CODES.SESSION_REVOKED);
      return;
    }

    if (connection.role === "mcp") {
      this.revokeSessionsForConnection(
        connectionId,
        "mcp_disconnect",
        HUB_ERROR_CODES.SESSION_REVOKED,
      );
    }
  }

  private createConnectionId(): string {
    this.nextConnectionSequence += 1;
    return `conn_${Date.now()}_${this.nextConnectionSequence}`;
  }
}

async function run(): Promise<void> {
  const processLogger = createHubLogger("hub.process");
  const port = Number(process.env.PARTYBROWSER_HUB_PORT ?? DEFAULT_HUB_PORT);
  const host = process.env.PARTYBROWSER_HUB_HOST ?? DEFAULT_HUB_HOST;

  processLogger.info("Bootstrapping hub runtime.", {
    event: "hub.start",
    host,
    port,
    logLevel: getHubLogLevel(),
  });

  const [buildFingerprintLine1, buildFingerprintLine2] = getHubBuildFingerprintLines();
  processLogger.info(buildFingerprintLine1);
  processLogger.info(buildFingerprintLine2);

  const runtime = new HubRuntime({ port, host });
  let isStopping = false;

  const stop = async (source: string, exitCode: number): Promise<void> => {
    if (isStopping) {
      processLogger.warn("Stop requested while shutdown is already in progress.", {
        event: "hub.stop",
        source,
      });
      return;
    }

    isStopping = true;
    processLogger.info("Shutting down hub runtime.", {
      event: "hub.stop",
      source,
      exitCode,
    });

    try {
      await runtime.stop();
      process.exit(exitCode);
    } catch (error) {
      const stopError = getErrorDetails(error);
      processLogger.error("Hub runtime failed to stop cleanly.", {
        event: "error.routing",
        source,
        errorName: stopError.errorName,
        errorMessage: stopError.errorMessage,
        stack: stopError.stack,
      });
      process.exit(1);
    }
  };

  process.on("uncaughtException", (error) => {
    const details = getErrorDetails(error);
    processLogger.error("Uncaught exception.", {
      event: "error.routing",
      errorName: details.errorName,
      errorMessage: details.errorMessage,
      stack: details.stack,
    });
    void stop("uncaught_exception", 1);
  });

  process.on("unhandledRejection", (reason) => {
    const details = getErrorDetails(reason);
    processLogger.error("Unhandled promise rejection.", {
      event: "error.routing",
      errorName: details.errorName,
      errorMessage: details.errorMessage,
      stack: details.stack,
    });
    void stop("unhandled_rejection", 1);
  });

  await runtime.start();

  process.on("SIGINT", () => {
    void stop("sigint", 0);
  });
  process.on("SIGTERM", () => {
    void stop("sigterm", 0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void run();
}
