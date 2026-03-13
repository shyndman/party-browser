import { strict as assert } from "node:assert";
import test from "node:test";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { Context } from "./context";
import { startServer } from "./index";
import { MCP_ERROR_CODES } from "./protocol/constants";
import { CodedError, type HubConnection } from "./protocol/ws-sender";

function createMockHubConnection(overrides: Partial<HubConnection> = {}): HubConnection {
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
    ...overrides,
  };
}

test("startServer fails before server creation when the startup hub probe fails", async () => {
  const hubError = new CodedError("Hub unavailable", MCP_ERROR_CODES.HUB_CONNECTION_UNAVAILABLE);
  let serverCreated = false;
  let transportCreated = false;

  await assert.rejects(
    () =>
      startServer({
        createHubConnection: () =>
          createMockHubConnection({
            async probe() {
              throw hubError;
            },
          }),
        createServer: async () => {
          serverCreated = true;
          return { connect: async () => {}, close: async () => {} } as unknown as Server;
        },
        createTransport: () => {
          transportCreated = true;
          return {} as StdioServerTransport;
        },
      }),
    (error: unknown) => {
      assert.equal(error, hubError);
      return true;
    },
  );

  assert.equal(serverCreated, false);
  assert.equal(transportCreated, false);
});

test("startServer probes first and only connects stdio after the hub is reachable", async () => {
  const events: string[] = [];
  let capturedContext: Context | undefined;
  let capturedTransport: StdioServerTransport | undefined;
  const mockTransport = {} as StdioServerTransport;
  const mockServer = {
    async connect(transport: StdioServerTransport) {
      events.push("connect");
      capturedTransport = transport;
    },
    async close() {
      return;
    },
  } as Server;

  const result = await startServer({
    createHubConnection: () =>
      createMockHubConnection({
        async probe() {
          events.push("probe");
        },
      }),
    createServer: async (context) => {
      capturedContext = context;
      events.push("createServer");
      return mockServer;
    },
    createTransport: () => {
      events.push("createTransport");
      return mockTransport;
    },
  });

  assert.equal(result, mockServer);
  assert.ok(capturedContext instanceof Context);
  assert.equal(capturedTransport, mockTransport);
  assert.deepEqual(events, ["probe", "createServer", "createTransport", "connect"]);
});
