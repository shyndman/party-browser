import {
  CodedError,
  createHubConnection,
  type HubConnection,
  type JoinRequestInput,
  type MessagePayload,
  type MessageType,
  type SocketMessageMap,
} from "@/messaging";
import { MCP_ERROR_CODES, PROTOCOL_DEFAULTS } from "@/protocol/constants";

const noSessionMessage =
  "No approved session route is available. Call join_session with required name/reason/url and wait for operator decision.";

export class Context {
  private sessionId: string | undefined;

  constructor(private readonly hubConnection: HubConnection = createHubConnection()) {}

  hasSessionRoute(): boolean {
    return typeof this.sessionId === "string" && this.sessionId.length > 0;
  }

  async joinSession(request: JoinRequestInput): Promise<string> {
    const sessionId = await this.hubConnection.joinSession(request, {
      timeoutMs: PROTOCOL_DEFAULTS.REQUEST_TIMEOUT_MS,
    });
    this.sessionId = sessionId;
    return sessionId;
  }

  async sendSocketMessage<T extends MessageType<SocketMessageMap>>(
    type: T,
    payload: MessagePayload<SocketMessageMap, T>,
    options: { timeoutMs?: number } = { timeoutMs: PROTOCOL_DEFAULTS.REQUEST_TIMEOUT_MS },
  ): Promise<any> {
    if (!this.sessionId) {
      throw new CodedError(noSessionMessage, MCP_ERROR_CODES.WAITING_ROOM_DECISION_REQUIRED);
    }

    return this.hubConnection.sendSessionCommand(this.sessionId, type, payload, options);
  }

  async close() {
    await this.hubConnection.close();
  }
}
