import {
  HUB_ERROR_CODES,
  HubError,
} from "@/errors";
import {
  isJoinRequestMessage,
  isMcpSessionCommandEnvelope,
  type JoinRequestMessage,
  type McpSessionCommandEnvelope,
} from "@/protocol/messages";

export type McpRouterDependencies = {
  onJoinRequest: (message: JoinRequestMessage) => void;
  onSessionCommand: (message: McpSessionCommandEnvelope) => void;
};

export function routeMcpIngressMessage(
  message: unknown,
  deps: McpRouterDependencies,
): void {
  if (isJoinRequestMessage(message)) {
    deps.onJoinRequest(message);
    return;
  }

  if (isMcpSessionCommandEnvelope(message)) {
    deps.onSessionCommand(message);
    return;
  }

  throw new HubError(
    "MCP message is malformed or has unknown type.",
    HUB_ERROR_CODES.PROTOCOL_UNKNOWN_MESSAGE_TYPE,
  );
}
