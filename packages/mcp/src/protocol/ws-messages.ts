import {
  HUB_CONTROL_MESSAGE_TYPES,
  HUB_JOIN_DECISIONS,
} from "./constants";

export const SESSION_LEASE_KINDS = {
  WORKSPACE: "workspace",
  TAKEOVER: "takeover",
} as const;

export type SessionLeaseKind =
  (typeof SESSION_LEASE_KINDS)[keyof typeof SESSION_LEASE_KINDS];

export interface SocketMessageMap {
  // Navigation messages
  navigate: { url: string };
  go_back: Record<string, never>;
  go_forward: Record<string, never>;

  // Interaction messages
  click: { element: string };
  drag: { startElement: string; endElement: string };
  hover: { element: string };
  type: { element: string; text: string };
  press_key: { key: string };
  select_option: { element: string; value: string };
  wait: { time: number };

  // Snapshot and inspection messages
  snapshot: Record<string, never>; // Returns: Full page HTML snapshot
  screenshot: Record<string, never>; // Returns: base64-encoded PNG string (not Data URL)
  evaluate: { script: string }; // Returns: JSON-serializable result

  // Deterministic wait messages
  wait_for:
    | { mode: "time"; value: number; timeout?: number }
    | { mode: "text"; value: string; timeout: number }
    | { mode: "text_gone"; value: string; timeout: number };

  // Session management messages
  close: Record<string, never>;

  // Network and console inspection messages (Phase 03.1)
  getNetworkRequests: {
    filter?: { types?: string[]; urlPattern?: string };
  };
  get_console_messages: {
    level?: "all" | "log" | "warn" | "error";
    since?: number;
  };

  // Page state messages
  getUrl: Record<string, never>;
  getTitle: Record<string, never>;
}

export type MessageType<T> = keyof T;

export type MessagePayload<T, K extends keyof T> = T[K];

export type JoinRequestMessage = {
  type: typeof HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST;
  name: string;
  reason: string;
  leaseKind: SessionLeaseKind;
  url?: string;
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

export type SessionCommandEnvelope<K extends keyof SocketMessageMap = keyof SocketMessageMap> = {
  requestId: string;
  sessionId: string;
  type: K;
  payload: SocketMessageMap[K];
};

export type SessionCommandResultEnvelope = {
  requestId: string;
  sessionId: string;
  type: string;
  payload?: unknown;
  error?: string;
  errorCode?: string;
};
