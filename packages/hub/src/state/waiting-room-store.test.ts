import { strict as assert } from "node:assert";
import test from "node:test";

import { HUB_ERROR_CODES, HubError } from "@/errors";
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
    url: "https://b.example",
    joinRequestTime: sharedTime,
  });

  store.add({
    sessionId: "aaaa",
    connectionId: "conn_2",
    name: "Agent A",
    reason: "first",
    url: "https://a.example",
    joinRequestTime: sharedTime,
  });

  store.add({
    sessionId: "zzzz",
    connectionId: "conn_3",
    name: "Agent C",
    reason: "third",
    url: "https://c.example",
    joinRequestTime: sharedTime + 10,
  });

  const sorted = store.listSorted();
  assert.deepEqual(
    sorted.map((entry) => entry.sessionId),
    ["aaaa", "bbbb", "zzzz"],
  );
});
