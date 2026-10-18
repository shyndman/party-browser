import { randomUUID } from "node:crypto";

import { WebSocket } from "ws";

import { debugLog } from "@/utils/log";
import { mcpConfig } from "@/config/mcp.config";
import {
  HUB_CONTROL_MESSAGE_TYPES,
  HUB_JOIN_DECISIONS,
  MCP_ERROR_CODES,
  PROTOCOL_DEFAULTS,
} from "./constants";
import type {
  JoinDecisionMessage,
  MessagePayload,
  MessageType,
  SessionCommandEnvelope,
  SessionCommandResultEnvelope,
  SessionLeaseKind,
  SocketMessageMap,
} from "./ws-messages";
import { SESSION_LEASE_KINDS } from "./ws-messages";

/**
 * Error with machine-readable code for MCP tool failures
 */
export class CodedError extends Error {
  errorCode: string;

  constructor(message: string, errorCode: string) {
    super(message);
    this.errorCode = errorCode;
    this.name = "CodedError";
  }
}

type SendOptions = {
  timeoutMs?: number;
  requestId?: string;
};

export type JoinRequestInput = {
  name: string;
  reason: string;
  leaseKind: SessionLeaseKind;
  url?: string | null;
};

export interface HubConnection {
  probe(): Promise<void>;
  joinSession(request: JoinRequestInput, options?: SendOptions): Promise<string>;
  sendSessionCommand<K extends MessageType<SocketMessageMap>>(
    sessionId: string,
    type: K,
    payload: MessagePayload<SocketMessageMap, K>,
    options?: SendOptions,
  ): Promise<any>;
  close(): Promise<void>;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type PendingJoinRequest = {
  resolve: (sessionId: string) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

/**
 * Hub-backed WebSocket transport for MCP command traffic.
 * This abstraction hides connection lifecycle and strict envelope handling.
 */
export class WebSocketHubConnection implements HubConnection {
  private ws: WebSocket | undefined;
  private connectingPromise: Promise<WebSocket> | undefined;
  private readonly pendingSessionRequests = new Map<string, PendingRequest>();
  private pendingJoinRequest: PendingJoinRequest | undefined;

  constructor(private readonly hubUrl: string = mcpConfig.hubWebSocketUrl) {}

  async probe(): Promise<void> {
    await this.ensureConnected();
  }

  async joinSession(
    request: JoinRequestInput,
    options: SendOptions = { timeoutMs: PROTOCOL_DEFAULTS.REQUEST_TIMEOUT_MS },
  ): Promise<string> {
    const { name, reason, leaseKind, url } = request;
    const normalizedUrl = typeof url === "string" && url.length > 0 ? url : undefined;
    if (!name || !reason || !isSessionLeaseKind(leaseKind)) {
      throw new CodedError(
        "Join request requires name, reason, and leaseKind.",
        MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }

    if (leaseKind === SESSION_LEASE_KINDS.WORKSPACE && !normalizedUrl) {
      throw new CodedError(
        "Workspace join requests require url.",
        MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }

    if (leaseKind === SESSION_LEASE_KINDS.TAKEOVER && normalizedUrl) {
      throw new CodedError(
        "Takeover join requests must omit url.",
        MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }

    if (this.pendingJoinRequest) {
      throw new CodedError(
        "Another join request is already pending.",
        MCP_ERROR_CODES.WAITING_ROOM_DECISION_REQUIRED,
      );
    }

    const socket = await this.ensureConnected();
    const timeoutMs = options.timeoutMs ?? PROTOCOL_DEFAULTS.REQUEST_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingJoinRequest = undefined;
        reject(
          new CodedError(
            `Join request timed out after ${timeoutMs}ms waiting for operator decision.`,
            MCP_ERROR_CODES.HUB_REQUEST_TIMEOUT,
          ),
        );
      }, timeoutMs);

      this.pendingJoinRequest = { resolve, reject, timeout };
      const message = {
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST,
        name,
        reason,
        leaseKind,
        ...(normalizedUrl ? { url: normalizedUrl } : {}),
      };

      socket.send(
        JSON.stringify(message),
      );
    });
  }

  async sendSessionCommand<K extends MessageType<SocketMessageMap>>(
    sessionId: string,
    type: K,
    payload: MessagePayload<SocketMessageMap, K>,
    options: SendOptions = { timeoutMs: PROTOCOL_DEFAULTS.REQUEST_TIMEOUT_MS },
  ): Promise<any> {
    if (!sessionId) {
      throw new CodedError(
        "Session command requires a valid sessionId.",
        MCP_ERROR_CODES.SESSION_NOT_FOUND,
      );
    }

    const socket = await this.ensureConnected();
    const timeoutMs = options.timeoutMs ?? PROTOCOL_DEFAULTS.REQUEST_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const requestId = this.createPendingRequestId(options.requestId);

      const timeout = setTimeout(() => {
        this.pendingSessionRequests.delete(requestId);
        reject(
          new CodedError(
            `Request timed out after ${timeoutMs}ms`,
            MCP_ERROR_CODES.HUB_REQUEST_TIMEOUT,
          ),
        );
      }, timeoutMs);

      this.pendingSessionRequests.set(requestId, { resolve, reject, timeout });
      const message: SessionCommandEnvelope<K> = {
        requestId,
        sessionId,
        type,
        payload,
      };
      debugLog("[HUB] → Sending session envelope:", message);
      socket.send(JSON.stringify(message));
    });
  }

  async close(): Promise<void> {
    if (!this.ws) {
      return;
    }

    const socket = this.ws;
    this.ws = undefined;

    await new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }

      socket.once("close", () => resolve());
      socket.close();
    });
  }

  private async ensureConnected(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(this.hubUrl);

      socket.once("open", () => {
        this.ws = socket;
        this.connectingPromise = undefined;
        this.attachHandlers(socket);
        resolve(socket);
      });

      socket.once("error", (error) => {
        this.connectingPromise = undefined;
        reject(
          new CodedError(
            `Unable to connect to PartyBrowser hub at ${this.hubUrl}: ${error.message}`,
            MCP_ERROR_CODES.HUB_CONNECTION_UNAVAILABLE,
          ),
        );
      });
    });

    return this.connectingPromise;
  }

  private attachHandlers(socket: WebSocket): void {
    socket.on("message", (data: Buffer | string) => {
      this.handleMessage(data.toString());
    });

    socket.on("close", () => {
      this.ws = undefined;
      this.rejectAllPending(
        new CodedError(
          "Hub connection closed while requests were in flight.",
          MCP_ERROR_CODES.HUB_CONNECTION_CLOSED,
        ),
      );
    });

    socket.on("error", (error) => {
      debugLog("[HUB] WebSocket error:", error);
    });
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    if (isJoinDecisionMessage(parsed)) {
      this.resolveJoinDecision(parsed);
      return;
    }

    if (!isSessionResultEnvelope(parsed)) {
      return;
    }

    const pending = this.pendingSessionRequests.get(parsed.requestId);
    if (!pending) {
      return;
    }

    this.pendingSessionRequests.delete(parsed.requestId);
    clearTimeout(pending.timeout);
    debugLog("[HUB] ← Received session envelope:", parsed);

    if (parsed.error) {
      pending.reject(
        new CodedError(parsed.error, parsed.errorCode ?? MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE),
      );
      return;
    }

    pending.resolve(parsed.payload);
  }

  private resolveJoinDecision(message: JoinDecisionMessage): void {
    if (!this.pendingJoinRequest) {
      return;
    }

    const pending = this.pendingJoinRequest;
    this.pendingJoinRequest = undefined;
    clearTimeout(pending.timeout);

    if (message.decision === HUB_JOIN_DECISIONS.JOIN) {
      pending.resolve(message.sessionId);
      return;
    }
    if (message.decision === HUB_JOIN_DECISIONS.SETUP_FAILED) {
      pending.reject(new CodedError(message.error, message.errorCode));
      return;
    }


    pending.reject(
      new CodedError(
        message.rejectReason ?? "Join request rejected by operator.",
        MCP_ERROR_CODES.WAITING_ROOM_DECISION_REQUIRED,
      ),
    );
  }

  private createPendingRequestId(requestId?: string): string {
    if (requestId) {
      this.assertRequestIdAvailable(requestId);
      return requestId;
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const generatedRequestId = generateRequestId();
      if (!this.pendingSessionRequests.has(generatedRequestId)) {
        return generatedRequestId;
      }
    }

    throw new CodedError(
      "Unable to generate a unique request id.",
      MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
    );
  }

  private assertRequestIdAvailable(requestId: string): void {
    if (this.pendingSessionRequests.has(requestId)) {
      throw new CodedError(
        `Duplicate pending request id: ${requestId}`,
        MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }
  }

  private rejectAllPending(error: CodedError): void {
    for (const [, pending] of this.pendingSessionRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingSessionRequests.clear();

    if (this.pendingJoinRequest) {
      clearTimeout(this.pendingJoinRequest.timeout);
      this.pendingJoinRequest.reject(error);
      this.pendingJoinRequest = undefined;
    }
  }
}

/**
 * Generates a collision-resistant correlation ID safe for logs and protocol JSON.
 */
export function generateRequestId(): string {
  return randomUUID();
}

function isJoinDecisionMessage(value: unknown): value is JoinDecisionMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<JoinDecisionMessage>;
  if (message.type !== HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION) {
    return false;
  }

  if (message.decision === HUB_JOIN_DECISIONS.JOIN) {
    return typeof (message as { sessionId?: unknown }).sessionId === "string";
  }

  if (message.decision === HUB_JOIN_DECISIONS.SETUP_FAILED) {
    return typeof message.error === "string" && typeof message.errorCode === "string";
  }

  return message.decision === HUB_JOIN_DECISIONS.REJECT;
}

export function isSessionResultEnvelope(value: unknown): value is SessionCommandResultEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const envelope = value as Partial<SessionCommandResultEnvelope>;
  return (
    typeof envelope.requestId === "string" &&
    typeof envelope.sessionId === "string" &&
    typeof envelope.type === "string" &&
    Object.prototype.hasOwnProperty.call(envelope, "payload")
  );
}

export function createHubConnection(hubUrl?: string): HubConnection {
  return new WebSocketHubConnection(hubUrl);
}

function isSessionLeaseKind(value: unknown): value is SessionLeaseKind {
  return value === SESSION_LEASE_KINDS.WORKSPACE || value === SESSION_LEASE_KINDS.TAKEOVER;
}
