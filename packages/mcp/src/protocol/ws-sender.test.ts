import { strict as assert } from "node:assert";
import net from "node:net";
import test from "node:test";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";

import { MCP_ERROR_CODES } from "./constants";
import { CodedError, WebSocketHubConnection } from "./ws-sender";

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve an ephemeral port."));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

test("hub probe fails with a coded hub-unavailable error when the hub is unreachable", async () => {
  const port = await getAvailablePort();
  const connection = new WebSocketHubConnection(`ws://127.0.0.1:${port}`);

  await assert.rejects(
    () => connection.probe(),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, MCP_ERROR_CODES.HUB_CONNECTION_UNAVAILABLE);
      return true;
    },
  );
});

test("hub probe succeeds when the hub accepts a websocket connection", async () => {
  const port = await getAvailablePort();
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  const connection = new WebSocketHubConnection(`ws://127.0.0.1:${port}`);

  await assert.doesNotReject(() => connection.probe());

  await connection.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

test("joinSession sends explicit workspace lease kind and url", async () => {
  const port = await getAvailablePort();
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  const connection = new WebSocketHubConnection(`ws://127.0.0.1:${port}`);

  const serverSocketPromise = new Promise<WebSocket>((resolve) => {
    server.once("connection", (socket) => resolve(socket));
  });

  try {
    const joinPromise = connection.joinSession(
      {
        name: "Agent Workspace",
        reason: "Search AliExpress",
        leaseKind: "workspace",
        url: "https://aliexpress.com",
      },
      { timeoutMs: 1000 },
    );
    const serverSocket = await serverSocketPromise;
    const message = await new Promise<Record<string, unknown>>((resolve) => {
      serverSocket.once("message", (raw) => {
        resolve(JSON.parse(String(raw)) as Record<string, unknown>);
      });
    });

    assert.equal(message.leaseKind, "workspace");
    assert.equal(message.url, "https://aliexpress.com");

    serverSocket.send(
      JSON.stringify({ type: "join_decision", decision: "join", sessionId: "session-1" }),
    );
    assert.equal(await joinPromise, "session-1");
  } finally {
    await connection.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("joinSession sends takeover lease kind without url", async () => {
  const port = await getAvailablePort();
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  const connection = new WebSocketHubConnection(`ws://127.0.0.1:${port}`);

  const serverSocketPromise = new Promise<WebSocket>((resolve) => {
    server.once("connection", (socket) => resolve(socket));
  });

  try {
    const joinPromise = connection.joinSession(
      {
        name: "Agent Takeover",
        reason: "Help in my current tab",
        leaseKind: "takeover",
      },
      { timeoutMs: 1000 },
    );
    const serverSocket = await serverSocketPromise;
    const message = await new Promise<Record<string, unknown>>((resolve) => {
      serverSocket.once("message", (raw) => {
        resolve(JSON.parse(String(raw)) as Record<string, unknown>);
      });
    });

    assert.equal(message.leaseKind, "takeover");
    assert.equal(Object.hasOwn(message, "url"), false);

    serverSocket.send(
      JSON.stringify({ type: "join_decision", decision: "join", sessionId: "session-2" }),
    );
    assert.equal(await joinPromise, "session-2");
  } finally {
    await connection.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("joinSession normalizes takeover compatibility url placeholders away", async () => {
  const port = await getAvailablePort();
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  const connection = new WebSocketHubConnection(`ws://127.0.0.1:${port}`);

  const serverSocketPromise = new Promise<WebSocket>((resolve) => {
    server.once("connection", (socket) => resolve(socket));
  });

  try {
    const joinPromise = connection.joinSession(
      {
        name: "Agent Takeover",
        reason: "Help in my current tab",
        leaseKind: "takeover",
        url: null,
      },
      { timeoutMs: 1000 },
    );
    const serverSocket = await serverSocketPromise;
    const message = await new Promise<Record<string, unknown>>((resolve) => {
      serverSocket.once("message", (raw) => {
        resolve(JSON.parse(String(raw)) as Record<string, unknown>);
      });
    });

    assert.equal(message.leaseKind, "takeover");
    assert.equal(Object.hasOwn(message, "url"), false);

    serverSocket.send(
      JSON.stringify({ type: "join_decision", decision: "join", sessionId: "session-compat" }),
    );
    assert.equal(await joinPromise, "session-compat");
  } finally {
    await connection.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("joinSession rejects missing workspace url and takeover url", async () => {
  const connection = new WebSocketHubConnection("ws://127.0.0.1:1");

  await assert.rejects(
    () =>
      connection.joinSession({
        name: "Agent Workspace",
        reason: "Missing URL",
        leaseKind: "workspace",
      }),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
      assert.match(error.message, /Workspace join requests require url/);
      return true;
    },
  );

  await assert.rejects(
    () =>
      connection.joinSession({
        name: "Agent Takeover",
        reason: "Wrong URL",
        leaseKind: "takeover",
        url: "https://example.com",
      }),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
      assert.match(error.message, /Takeover join requests must omit url/);
      return true;
    },
  );
});

test("session command rejects a duplicate pending request id without overwriting the first", async () => {
  const port = await getAvailablePort();
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  const connection = new WebSocketHubConnection(`ws://127.0.0.1:${port}`);
  let receivedCount = 0;

  const serverSocketPromise = new Promise<WebSocket>((resolve) => {
    server.once("connection", (socket) => resolve(socket));
  });

  try {
    const firstResultPromise = connection.sendSessionCommand(
      "session-1",
      "navigate",
      { url: "https://example.com/first" },
      { requestId: "duplicate-id", timeoutMs: 1000 },
    );

    const serverSocket = await serverSocketPromise;
    const firstMessage = await new Promise<Record<string, unknown>>((resolve) => {
      serverSocket.once("message", (raw) => {
        receivedCount += 1;
        resolve(JSON.parse(String(raw)) as Record<string, unknown>);
      });
    });

    assert.equal(firstMessage.requestId, "duplicate-id");

    await assert.rejects(
      () =>
        connection.sendSessionCommand(
          "session-1",
          "navigate",
          { url: "https://example.com/second" },
          { requestId: "duplicate-id", timeoutMs: 1000 },
        ),
      (error: unknown) => {
        assert.ok(error instanceof CodedError);
        assert.equal(error.errorCode, MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
        assert.match(error.message, /Duplicate pending request id/);
        return true;
      },
    );

    serverSocket.send(
      JSON.stringify({
        requestId: "duplicate-id",
        sessionId: "session-1",
        type: "navigate",
        payload: { ok: true },
      }),
    );

    assert.deepEqual(await firstResultPromise, { ok: true });
    assert.equal(receivedCount, 1);
  } finally {
    await connection.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("join setup failure preserves actual error and code rather than operator rejection", async () => {
  const port = await getAvailablePort();
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  const connection = new WebSocketHubConnection(`ws://127.0.0.1:${port}`);

  server.once("connection", (socket) => {
    socket.once("message", () => {
      socket.send(JSON.stringify({
        type: "join_decision", decision: "setup_failed",
        error: "Cannot take over about:addons", errorCode: "TAKEOVER_TAB_UNAVAILABLE",
      }));
    });
  });

  try {
    await assert.rejects(
      connection.joinSession({ name: "Agent", reason: "Help", leaseKind: "takeover" }, { timeoutMs: 1000 }),
      { message: "Cannot take over about:addons", errorCode: "TAKEOVER_TAB_UNAVAILABLE" },
    );
  } finally {
    await connection.close();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
