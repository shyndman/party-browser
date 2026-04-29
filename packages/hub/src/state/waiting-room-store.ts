import { HUB_ERROR_CODES, HubError } from "@/errors";
import {
  SESSION_LEASE_KINDS,
  type SessionLeaseKind,
} from "@/protocol/messages";

export type WaitingRoomEntry = {
  sessionId: string;
  connectionId: string;
  name: string;
  reason: string;
  leaseKind: SessionLeaseKind;
  url?: string;
  joinRequestTime: number;
};

export class WaitingRoomStore {
  private readonly entries = new Map<string, WaitingRoomEntry>();

  add(entry: WaitingRoomEntry): WaitingRoomEntry {
    this.assertRequiredFields(entry);
    this.entries.set(entry.sessionId, entry);
    return entry;
  }

  get(sessionId: string): WaitingRoomEntry | undefined {
    return this.entries.get(sessionId);
  }

  remove(sessionId: string): WaitingRoomEntry | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) {
      return undefined;
    }

    this.entries.delete(sessionId);
    return entry;
  }

  clear(): void {
    this.entries.clear();
  }

  listSorted(): WaitingRoomEntry[] {
    return [...this.entries.values()].sort((left, right) => {
      if (left.joinRequestTime !== right.joinRequestTime) {
        return left.joinRequestTime - right.joinRequestTime;
      }
      return left.sessionId.localeCompare(right.sessionId);
    });
  }

  private assertRequiredFields(entry: WaitingRoomEntry): void {
    if (!entry.sessionId || !entry.connectionId || !entry.name || !entry.reason || !entry.leaseKind) {
      throw new HubError(
        "Waiting-room entry is missing required fields.",
        HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }

    if (entry.leaseKind === SESSION_LEASE_KINDS.WORKSPACE && !entry.url) {
      throw new HubError(
        "Workspace waiting-room entry is missing required URL.",
        HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }

    if (entry.leaseKind === SESSION_LEASE_KINDS.TAKEOVER && entry.url) {
      throw new HubError(
        "Takeover waiting-room entry must not carry a URL.",
        HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }

    if (!Number.isFinite(entry.joinRequestTime)) {
      throw new HubError(
        "Waiting-room entry is missing valid join_request_time.",
        HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }
  }
}
