import {
  HUB_ERROR_CODES,
  HubError,
  type HubErrorCode,
} from "@/errors";

export const HUB_CONTROL_MESSAGE_TYPES = {
  JOIN_REQUEST: "join_request",
  JOIN_DECISION: "join_decision",
} as const;

export const HUB_JOIN_DECISIONS = {
  JOIN: "join",
  REJECT: "reject",
} as const;

export const HUB_EXTENSION_MESSAGE_TYPES = {
  SESSION_COMMAND: "session_command",
  SESSION_RESULT: "session_result",
  CONTROL_COMMAND: "control_command",
  CONTROL_RESPONSE: "control_response",
  CONTROL_EVENT: "control_event",
  ERROR: "error",
} as const;

export const HUB_CONTROL_COMMANDS = {
  WAITING_ROOM_LIST: "waiting_room.list",
  WAITING_ROOM_DECIDE: "waiting_room.decide",
  KILL_SWITCH_SET: "kill_switch.set",
} as const;

export const HUB_CONTROL_EVENTS = {
  SESSION_APPROVED: "session.approved",
  SESSION_REVOKED: "session.revoked",
  SESSIONS_REVOKED_ALL: "session.revoke_all",
  WAITING_ROOM_SYNC: "waiting_room.sync",
} as const;

export type JoinRequestMessage = {
  type: typeof HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST;
  name: string;
  reason: string;
  url: string;
};

export type JoinDecisionMessage =
  | {
      type: typeof HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION;
      decision: typeof HUB_JOIN_DECISIONS.JOIN;
      sessionId: string;
    }
  | {
      type: typeof HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION;
      decision: typeof HUB_JOIN_DECISIONS.REJECT;
      rejectReason?: string;
    };

export type McpSessionCommandEnvelope = {
  requestId: string;
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
};

export type McpSessionResultEnvelope = {
  requestId: string;
  sessionId: string;
  type: string;
  payload: unknown;
  error?: string;
  errorCode?: HubErrorCode;
};

export type ExtensionSessionCommandMessage = {
  type: typeof HUB_EXTENSION_MESSAGE_TYPES.SESSION_COMMAND;
  requestId: string;
  sessionId: string;
  command: string;
  payload: Record<string, unknown>;
};

export type ExtensionSessionResultMessage = {
  type: typeof HUB_EXTENSION_MESSAGE_TYPES.SESSION_RESULT;
  requestId: string;
  sessionId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  errorCode?: string;
};

export type ExtensionControlCommandMessage = {
  type: typeof HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND;
  requestId: string;
  command: string;
  payload: Record<string, unknown>;
};

export type ExtensionControlResponseMessage = {
  type: typeof HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE;
  requestId: string;
  success: boolean;
  payload?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
};

export type ExtensionControlEventMessage = {
  type: typeof HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT;
  event: string;
  payload: Record<string, unknown>;
};

export type ExtensionErrorMessage = {
  type: typeof HUB_EXTENSION_MESSAGE_TYPES.ERROR;
  requestId?: string;
  success: false;
  error: string;
  errorCode: HubErrorCode | string;
};

type RecordValue = Record<string, unknown>;

function isRecordValue(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function parseJsonMessage(raw: string): unknown {
  return JSON.parse(raw);
}

export function isJoinRequestMessage(value: unknown): value is JoinRequestMessage {
  if (!isRecordValue(value)) {
    return false;
  }

  return (
    value.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.reason) &&
    isNonEmptyString(value.url)
  );
}

export function isMcpSessionCommandEnvelope(
  value: unknown,
): value is McpSessionCommandEnvelope {
  if (!isRecordValue(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.type) &&
    isRecordValue(value.payload)
  );
}

export function isExtensionControlCommandMessage(
  value: unknown,
): value is ExtensionControlCommandMessage {
  if (!isRecordValue(value)) {
    return false;
  }

  return (
    value.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND &&
    isNonEmptyString(value.requestId) &&
    isNonEmptyString(value.command) &&
    isRecordValue(value.payload)
  );
}

export function isExtensionSessionResultMessage(
  value: unknown,
): value is ExtensionSessionResultMessage {
  if (!isRecordValue(value)) {
    return false;
  }

  return (
    value.type === HUB_EXTENSION_MESSAGE_TYPES.SESSION_RESULT &&
    isNonEmptyString(value.requestId) &&
    isNonEmptyString(value.sessionId) &&
    typeof value.success === "boolean"
  );
}

export function toProtocolError(
  message: string,
  errorCode: HubErrorCode = HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
): HubError {
  return new HubError(message, errorCode);
}

export function assertRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (isNonEmptyString(value)) {
    return value;
  }

  throw toProtocolError(
    `Missing required field: ${fieldName}`,
    HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
  );
}

export function assertRequiredObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (isRecordValue(value)) {
    return value;
  }

  throw toProtocolError(
    `Missing required object field: ${fieldName}`,
    HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
  );
}
