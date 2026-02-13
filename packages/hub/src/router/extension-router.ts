import {
  HUB_ERROR_CODES,
  HubError,
} from "@/errors";
import {
  isExtensionControlCommandMessage,
  isExtensionSessionResultMessage,
  type ExtensionControlCommandMessage,
  type ExtensionSessionResultMessage,
} from "@/protocol/messages";

export type ExtensionRouterDependencies = {
  onControlCommand: (message: ExtensionControlCommandMessage) => void;
  onSessionResult: (message: ExtensionSessionResultMessage) => void;
};

export function routeExtensionIngressMessage(
  message: unknown,
  deps: ExtensionRouterDependencies,
): void {
  if (isExtensionControlCommandMessage(message)) {
    deps.onControlCommand(message);
    return;
  }

  if (isExtensionSessionResultMessage(message)) {
    deps.onSessionResult(message);
    return;
  }

  throw new HubError(
    "Extension message is malformed or has unknown type.",
    HUB_ERROR_CODES.PROTOCOL_UNKNOWN_MESSAGE_TYPE,
  );
}
