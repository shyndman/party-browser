import type WebSocket from "ws";

import { HUB_ERROR_CODES, HubError, type HubErrorCode } from "@/errors";
import {
  HUB_EXTENSION_MESSAGE_TYPES,
  type ExtensionSessionCommandMessage,
  type ExtensionSessionResultMessage,
  type McpSessionCommandEnvelope,
  type McpSessionResultEnvelope,
} from "@/protocol/messages";

type PendingCommand = {
  requestId: string;
  sessionId: string;
  commandType: string;
  mcpConnectionId: string;
};

export class CommandRouter {
  private readonly pendingByRequestId = new Map<string, PendingCommand>();

  forwardToExtension(
    command: McpSessionCommandEnvelope,
    mcpConnectionId: string,
    extensionSocket: WebSocket,
  ): void {
    const envelope: ExtensionSessionCommandMessage = {
      type: HUB_EXTENSION_MESSAGE_TYPES.SESSION_COMMAND,
      requestId: command.requestId,
      sessionId: command.sessionId,
      command: command.type,
      payload: command.payload,
    };

    this.pendingByRequestId.set(command.requestId, {
      requestId: command.requestId,
      sessionId: command.sessionId,
      commandType: command.type,
      mcpConnectionId,
    });

    extensionSocket.send(JSON.stringify(envelope));
  }

  resolveFromExtension(
    result: ExtensionSessionResultMessage,
  ): { mcpConnectionId: string; response: McpSessionResultEnvelope } | undefined {
    const pending = this.pendingByRequestId.get(result.requestId);
    if (!pending) {
      return undefined;
    }

    this.pendingByRequestId.delete(result.requestId);

    const response: McpSessionResultEnvelope = {
      requestId: pending.requestId,
      sessionId: pending.sessionId,
      type: pending.commandType,
      payload: result.result ?? null,
      error: result.success ? undefined : result.error ?? "Extension command failed.",
      errorCode: result.success
        ? undefined
        : ((result.errorCode as HubErrorCode | undefined) ?? HUB_ERROR_CODES.ROUTING_FAILED),
    };

    return {
      mcpConnectionId: pending.mcpConnectionId,
      response,
    };
  }

  failSession(
    sessionId: string,
    reason: string,
    errorCode: HubErrorCode,
  ): Array<{ mcpConnectionId: string; response: McpSessionResultEnvelope }> {
    const failures: Array<{ mcpConnectionId: string; response: McpSessionResultEnvelope }> = [];

    for (const [requestId, pending] of this.pendingByRequestId.entries()) {
      if (pending.sessionId !== sessionId) {
        continue;
      }

      this.pendingByRequestId.delete(requestId);
      failures.push({
        mcpConnectionId: pending.mcpConnectionId,
        response: {
          requestId: pending.requestId,
          sessionId: pending.sessionId,
          type: pending.commandType,
          payload: null,
          error: reason,
          errorCode,
        },
      });
    }

    return failures;
  }

  failAll(
    reason: string,
    errorCode: HubErrorCode,
  ): Array<{ mcpConnectionId: string; response: McpSessionResultEnvelope }> {
    const failures: Array<{ mcpConnectionId: string; response: McpSessionResultEnvelope }> = [];

    for (const pending of this.pendingByRequestId.values()) {
      failures.push({
        mcpConnectionId: pending.mcpConnectionId,
        response: {
          requestId: pending.requestId,
          sessionId: pending.sessionId,
          type: pending.commandType,
          payload: null,
          error: reason,
          errorCode,
        },
      });
    }

    this.pendingByRequestId.clear();
    return failures;
  }

  assertNotPendingForSession(sessionId: string): void {
    for (const pending of this.pendingByRequestId.values()) {
      if (pending.sessionId === sessionId) {
        throw new HubError(
          `Session ${sessionId} has pending commands and cannot transition safely.`,
          HUB_ERROR_CODES.ROUTING_FAILED,
        );
      }
    }
  }
}
