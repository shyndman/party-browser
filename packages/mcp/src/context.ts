import { WebSocket } from "ws";

import { mcpConfig } from "@/config/mcp.config";
import {
  CodedError,
  createSocketMessageSender,
} from "@/protocol/ws-sender";
import type { MessagePayload, MessageType } from "@/protocol/ws-messages";
import type { SocketMessageMap } from "@/protocol/ws-messages";

const noConnectionMessage = `No connection to browser extension. In order to proceed, click the Browser MCP extension icon in the browser toolbar to enable communications, then retry.`;

export class Context {
  private _ws: WebSocket | undefined;

  get ws(): WebSocket {
    if (!this._ws) {
      throw new Error(noConnectionMessage);
    }
    return this._ws;
  }

  set ws(ws: WebSocket | undefined) {
    this._ws = ws;
  }

  hasWs(): boolean {
    return !!this._ws;
  }

  async sendSocketMessage<T extends MessageType<SocketMessageMap>>(
    type: T,
    payload: MessagePayload<SocketMessageMap, T>,
    options: { timeoutMs?: number } = { timeoutMs: 30000 },
  ) {
    const { sendSocketMessage } = createSocketMessageSender<SocketMessageMap>(
      this.ws,
    );
    try {
      return await sendSocketMessage(type, payload, options);
    } catch (e) {
      if (e instanceof Error && e.message === mcpConfig.errors.noConnectedTab) {
        throw new Error(noConnectionMessage);
      }
      throw e;
    }
  }

  async close() {
    if (!this._ws) {
      return;
    }
    await this._ws.close();
  }
}
