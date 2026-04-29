import { strict as assert } from "node:assert";
import test from "node:test";

import { HUB_ERROR_CODES, HubError } from "@/errors";
import { SESSION_LEASE_KINDS } from "@/protocol/messages";
import { SessionStore, SESSION_LIFECYCLE_STATES } from "@/state/session-store";

test("mints 64-bit random session IDs", () => {
  const store = new SessionStore();
  const session = store.createPendingSession({
    connectionId: "conn_1",
    name: "agent-a",
    reason: "test",
    leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
    url: "https://example.com",
    joinRequestTime: Date.now(),
  });

  assert.equal(session.sessionId.length, 16);
  assert.match(session.sessionId, /^[a-f0-9]+$/u);
});

test("retries when generated session ID collides", () => {
  const store = new SessionStore();
  const mutableStore = store as any;
  const originalGenerator = mutableStore.generateSessionId;

  mutableStore.generateSessionId = () => "aaaaaaaaaaaaaaaa";
  const first = store.createPendingSession({
    connectionId: "conn_1",
    name: "agent-a",
    reason: "first",
    leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
    url: "https://a.example",
    joinRequestTime: Date.now(),
  });
  assert.equal(first.sessionId, "aaaaaaaaaaaaaaaa");

  let calls = 0;
  mutableStore.generateSessionId = () => {
    calls += 1;
    return calls === 1 ? "aaaaaaaaaaaaaaaa" : "bbbbbbbbbbbbbbbb";
  };

  const second = store.createPendingSession({
    connectionId: "conn_2",
    name: "agent-b",
    reason: "second",
    leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
    url: "https://b.example",
    joinRequestTime: Date.now(),
  });

  assert.equal(second.sessionId, "bbbbbbbbbbbbbbbb");
  mutableStore.generateSessionId = originalGenerator;
});

test("rejects session command routing from mismatched connection", () => {
  const store = new SessionStore();
  const session = store.createPendingSession({
    connectionId: "conn_1",
    name: "agent-a",
    reason: "test",
    leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
    url: "https://example.com",
    joinRequestTime: Date.now(),
  });

  assert.throws(
    () => store.assertSessionConnection(session.sessionId, "conn_2"),
    (error: unknown) => {
      assert.ok(error instanceof HubError);
      assert.equal(error.errorCode, HUB_ERROR_CODES.SESSION_CONNECTION_MISMATCH);
      return true;
    },
  );
});

test("revocation is idempotent and wins over activation", () => {
  const store = new SessionStore();
  const session = store.createPendingSession({
    connectionId: "conn_1",
    name: "agent-a",
    reason: "test",
    leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
    url: "https://example.com",
    joinRequestTime: Date.now(),
  });

  const firstRevoke = store.revokeSession(session.sessionId, "manual_revoke");
  assert.equal(firstRevoke.changed, true);
  assert.equal(firstRevoke.record.state, SESSION_LIFECYCLE_STATES.REVOKED);

  const secondRevoke = store.revokeSession(session.sessionId, "manual_revoke");
  assert.equal(secondRevoke.changed, false);

  assert.throws(
    () => store.activateSession(session.sessionId),
    (error: unknown) => {
      assert.ok(error instanceof HubError);
      assert.equal(error.errorCode, HUB_ERROR_CODES.SESSION_REVOKED);
      return true;
    },
  );
});

test("accepts takeover sessions without URL", () => {
  const store = new SessionStore();
  const session = store.createPendingSession({
    connectionId: "conn_1",
    name: "agent-a",
    reason: "help in current tab",
    leaseKind: SESSION_LEASE_KINDS.TAKEOVER,
    joinRequestTime: Date.now(),
  });

  assert.equal(session.leaseKind, SESSION_LEASE_KINDS.TAKEOVER);
  assert.equal(session.url, undefined);
});

test("rejects invalid lease kind/url combinations", () => {
  const store = new SessionStore();

  assert.throws(
    () =>
      store.createPendingSession({
        connectionId: "conn_1",
        name: "agent-a",
        reason: "missing URL",
        leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
        joinRequestTime: Date.now(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof HubError);
      assert.equal(error.errorCode, HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
      return true;
    },
  );

  assert.throws(
    () =>
      store.createPendingSession({
        connectionId: "conn_1",
        name: "agent-a",
        reason: "wrong URL",
        leaseKind: SESSION_LEASE_KINDS.TAKEOVER,
        url: "https://example.com",
        joinRequestTime: Date.now(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof HubError);
      assert.equal(error.errorCode, HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
      return true;
    },
  );
});
