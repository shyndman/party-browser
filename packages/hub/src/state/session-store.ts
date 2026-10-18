import { randomBytes } from "node:crypto";

import { HUB_ERROR_CODES, HubError } from "@/errors";
import {
  SESSION_LEASE_KINDS,
  type SessionLeaseKind,
} from "@/protocol/messages";

const SESSION_ID_BYTES = 8;
const SESSION_ID_MAX_RETRIES = 8;

export const SESSION_LIFECYCLE_STATES = {
  PENDING: "pending",
  ACTIVE: "active",
  REVOKED: "revoked",
  ENDED: "ended",
} as const;

export type SessionLifecycleState =
  (typeof SESSION_LIFECYCLE_STATES)[keyof typeof SESSION_LIFECYCLE_STATES];

export type SessionRecord = {
  sessionId: string;
  connectionId: string;
  name: string;
  reason: string;
  leaseKind: SessionLeaseKind;
  url?: string;
  joinRequestTime: number;
  state: SessionLifecycleState;
  revokeReason?: string;
};

export type CreatePendingSessionInput = {
  connectionId: string;
  name: string;
  reason: string;
  leaseKind: SessionLeaseKind;
  url?: string;
  joinRequestTime: number;
};

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  createPendingSession(input: CreatePendingSessionInput): SessionRecord {
    const sessionId = this.mintUniqueSessionId();
    const record: SessionRecord = {
      sessionId,
      connectionId: input.connectionId,
      name: input.name,
      reason: input.reason,
      leaseKind: input.leaseKind,
      url: input.url,
      joinRequestTime: input.joinRequestTime,
      state: SESSION_LIFECYCLE_STATES.PENDING,
    };
    this.assertLeaseShape(record);
    this.sessions.set(sessionId, record);
    return record;
  }

  getSession(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  discardPendingSession(sessionId: string): void {
    const record = this.requireSession(sessionId);
    if (record.state !== SESSION_LIFECYCLE_STATES.PENDING) {
      throw new HubError("Only pending sessions can be discarded.", HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
    }
    this.sessions.delete(sessionId);
  }

  assertSessionConnection(sessionId: string, connectionId: string): SessionRecord {
    const record = this.requireSession(sessionId);
    if (record.connectionId !== connectionId) {
      throw new HubError(
        `Session ${sessionId} is not bound to this MCP connection.`,
        HUB_ERROR_CODES.SESSION_CONNECTION_MISMATCH,
      );
    }
    return record;
  }

  activateSession(sessionId: string): SessionRecord {
    const record = this.requireSession(sessionId);
    if (record.state === SESSION_LIFECYCLE_STATES.REVOKED) {
      throw new HubError(
        `Session ${sessionId} is revoked and cannot be activated.`,
        HUB_ERROR_CODES.SESSION_REVOKED,
      );
    }

    if (record.state === SESSION_LIFECYCLE_STATES.ENDED) {
      throw new HubError(
        `Session ${sessionId} is ended and cannot be activated.`,
        HUB_ERROR_CODES.SESSION_REVOKED,
      );
    }

    record.state = SESSION_LIFECYCLE_STATES.ACTIVE;
    return record;
  }

  revokeSession(sessionId: string, reason: string): { changed: boolean; record: SessionRecord } {
    const record = this.requireSession(sessionId);
    if (record.state === SESSION_LIFECYCLE_STATES.REVOKED) {
      return { changed: false, record };
    }

    record.state = SESSION_LIFECYCLE_STATES.REVOKED;
    record.revokeReason = reason;
    return { changed: true, record };
  }

  endSession(sessionId: string): SessionRecord {
    const record = this.requireSession(sessionId);
    record.state = SESSION_LIFECYCLE_STATES.ENDED;
    return record;
  }

  revokeAllSessions(reason: string): SessionRecord[] {
    const changed: SessionRecord[] = [];
    for (const record of this.sessions.values()) {
      const result = this.revokeSession(record.sessionId, reason);
      if (result.changed) {
        changed.push(result.record);
      }
    }
    return changed;
  }

  getSessionsByState(state: SessionLifecycleState): SessionRecord[] {
    return [...this.sessions.values()].filter((session) => session.state === state);
  }

  private requireSession(sessionId: string): SessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new HubError(
        `Session ${sessionId} was not found.`,
        HUB_ERROR_CODES.SESSION_NOT_FOUND,
      );
    }
    return record;
  }

  private assertLeaseShape(record: SessionRecord): void {
    if (record.leaseKind === SESSION_LEASE_KINDS.WORKSPACE && !record.url) {
      throw new HubError(
        "Workspace sessions require a URL.",
        HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }

    if (record.leaseKind === SESSION_LEASE_KINDS.TAKEOVER && record.url) {
      throw new HubError(
        "Takeover sessions must not carry a URL.",
        HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
      );
    }
  }

  private mintUniqueSessionId(): string {
    for (let attempt = 0; attempt < SESSION_ID_MAX_RETRIES; attempt += 1) {
      const sessionId = this.generateSessionId();
      if (!this.sessions.has(sessionId)) {
        return sessionId;
      }
    }

    throw new HubError(
      "Unable to mint unique session ID after collision retries.",
      HUB_ERROR_CODES.ROUTING_FAILED,
    );
  }

  private generateSessionId(): string {
    return randomBytes(SESSION_ID_BYTES).toString("hex");
  }
}
