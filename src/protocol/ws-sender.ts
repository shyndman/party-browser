import { WebSocket } from "ws";

import type { MessagePayload, MessageType, SocketMessageMap } from "./ws-messages";

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

/**
 * Options for sending socket messages
 */
interface SendOptions {
  timeoutMs?: number;
}

/**
 * Creates a socket message sender for the given WebSocket connection
 * @param ws - The WebSocket connection to send messages through
 * @returns Object containing sendSocketMessage function
 */
export function createSocketMessageSender<T extends SocketMessageMap>(ws: WebSocket) {
  /**
   * Sends a message and waits for a response
   * @param type - The message type
   * @param payload - The message payload
   * @param options - Send options including timeout
   * @returns Promise resolving to the response
   */
  async function sendSocketMessage<K extends MessageType<T>>(
    type: K,
    payload: MessagePayload<T, K>,
    options: SendOptions = { timeoutMs: 30000 },
  ): Promise<any> {
    const { timeoutMs = 30000 } = options;

    return new Promise((resolve, reject) => {
      const messageId = generateMessageId();
      
      // Set up timeout
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Set up one-time response handler
      const responseHandler = (data: Buffer | string) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === messageId) {
            cleanup();
            if (response.error) {
              reject(new CodedError(response.error, response.errorCode || "UNKNOWN_ERROR"));
            } else {
              resolve(response.result);
            }
          }
        } catch {
          // Not our response, ignore
        }
      };

      // Clean up listeners and timeout
      const cleanup = () => {
        clearTimeout(timeout);
        ws.off("message", responseHandler);
      };

      // Listen for response
      ws.on("message", responseHandler);

      // Send the message
      const message = {
        id: messageId,
        type,
        payload,
      };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      } else {
        cleanup();
        reject(new Error("WebSocket is not open"));
      }
    });
  }

  return { sendSocketMessage };
}

/**
 * Generates a unique message ID
 */
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
