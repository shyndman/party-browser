import { strict as assert } from "node:assert";
import test from "node:test";

import { Context } from "./context";
import { MCP_ERROR_CODES } from "./protocol/constants";
import {
  CodedError,
  isSessionResultEnvelope,
  type HubConnection,
} from "./protocol/ws-sender";

function createMockHubConnection(): HubConnection {
  return {
    async probe() {
      return;
    },
    async joinSession() {
      return "session-123";
    },
    async sendSessionCommand(sessionId, type, payload) {
      return { sessionId, type, payload };
    },
    async close() {
      return;
    },
  };
}

test("browser command hard-fails when no session route exists", async () => {
  const context = new Context(createMockHubConnection());

  await assert.rejects(
    () => context.sendSocketMessage("navigate", { url: "https://example.com" }),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, MCP_ERROR_CODES.WAITING_ROOM_DECISION_REQUIRED);
      return true;
    },
  );
});

test("browser command uses approved session envelope route", async () => {
  const context = new Context(createMockHubConnection());
  await context.joinSession({
    name: "Test Agent",
    reason: "Contract test",
    url: "https://example.com",
  });

  const result = await context.sendSocketMessage("navigate", {
    url: "https://partybrowser.com",
  });

  assert.deepEqual(result, {
    sessionId: "session-123",
    type: "navigate",
    payload: { url: "https://partybrowser.com" },
  });
});

test("legacy id/result response shape is not accepted", () => {
  assert.equal(isSessionResultEnvelope({ id: "old-1", result: {} }), false);
});
