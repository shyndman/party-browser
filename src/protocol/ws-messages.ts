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
  browser_navigate: { url: string };
  browser_go_back: Record<string, never>;
  browser_go_forward: Record<string, never>;

  // Interaction messages
  browser_click: { element: string };
  browser_drag: { startElement: string; endElement: string };
  browser_hover: { element: string };
  browser_type: { element: string; text: string };
  browser_press_key: { key: string };
  browser_select_option: { element: string; option: string };
  browser_wait: { time: number };

  // Snapshot and inspection messages
  browser_snapshot: Record<string, never>;
  browser_screenshot: Record<string, never>;
  browser_get_console_logs: Record<string, never>;
  browser_evaluate: { script: string };

  // Deterministic wait messages
  browser_wait_for:
    | { mode: "time"; value: number; timeout?: number }
    | { mode: "text"; value: string; timeout: number }
    | { mode: "text_gone"; value: string; timeout: number };

  // Session management messages
  browser_close: Record<string, never>;

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
