import { strict as assert } from "node:assert";
import test from "node:test";

import { HUB_ERROR_CODES, HubError } from "@/errors";
import { SESSION_LEASE_KINDS } from "@/protocol/messages";
import { WaitingRoomStore } from "@/state/waiting-room-store";

test("requires mandatory waiting-room fields", () => {
  const store = new WaitingRoomStore();

  assert.throws(
    () =>
      store.add({
        sessionId: "session_1",
        connectionId: "",
        name: "Agent",
        reason: "Needs access",
        leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
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

test("stamps and sorts waiting-room entries deterministically", () => {
  const store = new WaitingRoomStore();
  const sharedTime = Date.now();

  store.add({
    sessionId: "bbbb",
    connectionId: "conn_1",
    name: "Agent B",
    reason: "second",
    leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
    url: "https://b.example",
    joinRequestTime: sharedTime,
  });

  store.add({
    sessionId: "aaaa",
    connectionId: "conn_2",
    name: "Agent A",
    reason: "first",
    leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
    url: "https://a.example",
    joinRequestTime: sharedTime,
  });

  store.add({
    sessionId: "zzzz",
    connectionId: "conn_3",
    name: "Agent C",
    reason: "third",
    leaseKind: SESSION_LEASE_KINDS.WORKSPACE,
    url: "https://c.example",
    joinRequestTime: sharedTime + 10,
  });

  const sorted = store.listSorted();
  assert.deepEqual(
    sorted.map((entry) => entry.sessionId),
    ["aaaa", "bbbb", "zzzz"],
  );
});

test("accepts takeover entries without URL", () => {
  const store = new WaitingRoomStore();
  const entry = store.add({
    sessionId: "session_takeover",
    connectionId: "conn_1",
    name: "Agent",
    reason: "Help in current tab",
    leaseKind: SESSION_LEASE_KINDS.TAKEOVER,
    joinRequestTime: Date.now(),
  });

  assert.equal(entry.leaseKind, SESSION_LEASE_KINDS.TAKEOVER);
  assert.equal(entry.url, undefined);
});

test("rejects invalid waiting-room lease kind/url combinations", () => {
  const store = new WaitingRoomStore();

  assert.throws(
    () =>
      store.add({
        sessionId: "session_workspace",
        connectionId: "conn_1",
        name: "Agent",
        reason: "Missing URL",
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
      store.add({
        sessionId: "session_takeover",
        connectionId: "conn_1",
        name: "Agent",
        reason: "Wrong URL",
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
