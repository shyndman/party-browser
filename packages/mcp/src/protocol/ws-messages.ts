/**
 * WebSocket message type definitions
 * Defines the message protocol between MCP server and browser extension
 */

/**
 * Map of message types to their payload types
 * This defines all possible messages that can be sent/received
 */
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
  select_option: { element: string; option: string };
  wait: { time: number };

  // Snapshot and inspection messages
  snapshot: Record<string, never>; // Returns: Full page HTML snapshot
  screenshot: Record<string, never>; // Returns: base64-encoded PNG string (not Data URL)
  get_console_logs: Record<string, never>; // Returns: Array of console log entries
  evaluate: { script: string }; // Returns: JSON-serializable result

  // Deterministic wait messages
  wait_for:
    | { mode: "time"; value: number; timeout?: number }
    | { mode: "text"; value: string; timeout: number }
    | { mode: "text_gone"; value: string; timeout: number };

  // Session management messages
  close: Record<string, never>;

  // Network and console inspection messages (Phase 03.1)
  get_network_requests: {
    filter?: { types?: string[]; urlPattern?: string };
  };
  get_console_messages: {
    level?: "all" | "log" | "warn" | "error";
    since?: number;
  };

  // Page state messages
  getUrl: undefined;
  getTitle: undefined;
}

/**
 * Extract message type keys from a message map
 */
export type MessageType<T> = keyof T;

/**
 * Extract payload type for a specific message type from a message map
 */
export type MessagePayload<T, K extends keyof T> = T[K];
