/**
 * Messaging module for MCP server
 * Re-exports WebSocket messaging types and utilities
 */

// Protocol exports
export {
  CodedError,
  createSocketMessageSender,
} from "../protocol/ws-sender";

export type {
  MessageType,
  MessagePayload,
  SocketMessageMap,
} from "../protocol/ws-messages";

// WebSocket server creation
export { createWebSocketServer } from "../ws";
