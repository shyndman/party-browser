/**
 * Messaging module for MCP server
 * Re-exports WebSocket messaging types and utilities
 */

// Protocol exports
export {
  CodedError,
  createHubConnection,
  WebSocketHubConnection,
} from "../protocol/ws-sender";

export type { HubConnection, JoinRequestInput } from "../protocol/ws-sender";

export type {
  MessageType,
  MessagePayload,
  SocketMessageMap,
} from "../protocol/ws-messages";
