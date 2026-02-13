import { strict as assert } from "node:assert";
import test from "node:test";
import { WebSocket } from "ws";

import { HUB_ERROR_CODES } from "@/errors";
import {
  HUB_CONTROL_COMMANDS,
  HUB_CONTROL_MESSAGE_TYPES,
  HUB_EXTENSION_MESSAGE_TYPES,
  HUB_JOIN_DECISIONS,
} from "@/protocol/messages";
import { HubRuntime } from "@/index";

type Harness = {
  runtime: HubRuntime;
  mcp: WebSocket;
  extension: WebSocket;
};

const TEST_TIMEOUT_MS = 1000;

async function createHarness(): Promise<Harness> {
  const runtime = new HubRuntime({ port: 0, host: "127.0.0.1" });
  await runtime.start();
  const port = runtime.getBoundPort();
  const url = `ws://127.0.0.1:${port}`;

  const extension = await openSocket(url);
  const mcp = await openSocket(url);
  return { runtime, mcp, extension };
}

async function destroyHarness(harness: Harness): Promise<void> {
  harness.mcp.close();
  harness.extension.close();
  await harness.runtime.stop();
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

async function waitForMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for matching message"));
    }, TEST_TIMEOUT_MS);

    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(String(raw)) as Record<string, unknown>;
      if (!predicate(message)) {
        return;
      }

      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    };

    socket.on("message", onMessage);
  });
}

async function expectNoMessage(socket: WebSocket, waitMs = 75): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      resolve();
    }, waitMs);

    const onMessage = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      reject(new Error("Unexpected message received"));
    };

    socket.on("message", onMessage);
  });
}

async function approveSinglePendingSession(harness: Harness): Promise<string> {
  harness.extension.send(
    JSON.stringify({
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
      requestId: "list-1",
      command: HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST,
      payload: {},
    }),
  );

  const waitingList = await waitForMessage(
    harness.extension,
    (message) =>
      message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
      message.requestId === "list-1",
  );

  const entries = (waitingList.payload as { entries: Array<{ sessionId: string }> })
    .entries;
  assert.equal(entries.length, 1);

  const sessionId = entries[0].sessionId;
  harness.extension.send(
    JSON.stringify({
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
      requestId: "decide-1",
      command: HUB_CONTROL_COMMANDS.WAITING_ROOM_DECIDE,
      payload: {
        sessionId,
        decision: HUB_JOIN_DECISIONS.JOIN,
      },
    }),
  );

  await waitForMessage(
    harness.extension,
    (message) =>
      message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
      message.requestId === "decide-1",
  );

  return sessionId;
}

test("join request blocks until operator decision", async () => {
  const harness = await createHarness();

  try {
    const joinDecisionPromise = waitForMessage(
      harness.mcp,
      (message) => message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION,
    );

    harness.mcp.send(
      JSON.stringify({
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST,
        name: "Agent A",
        reason: "Investigate issue",
        url: "https://example.com",
      }),
    );

    await expectNoMessage(harness.mcp);

    const sessionId = await approveSinglePendingSession(harness);
    const decision = await joinDecisionPromise;

    assert.equal(decision.decision, HUB_JOIN_DECISIONS.JOIN);
    assert.equal(decision.sessionId, sessionId);
  } finally {
    await destroyHarness(harness);
  }
});

test("operator reject returns explicit reject decision", async () => {
  const harness = await createHarness();

  try {
    const joinDecisionPromise = waitForMessage(
      harness.mcp,
      (message) => message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION,
    );

    harness.mcp.send(
      JSON.stringify({
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST,
        name: "Agent B",
        reason: "Read dashboard",
        url: "https://example.com/reject",
      }),
    );

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "list-2",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST,
        payload: {},
      }),
    );

    const waitingList = await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "list-2",
    );
    const sessionId = (
      waitingList.payload as { entries: Array<{ sessionId: string }> }
    ).entries[0].sessionId;

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "decide-2",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_DECIDE,
        payload: {
          sessionId,
          decision: HUB_JOIN_DECISIONS.REJECT,
        },
      }),
    );

    const decision = await joinDecisionPromise;
    assert.equal(decision.decision, HUB_JOIN_DECISIONS.REJECT);
  } finally {
    await destroyHarness(harness);
  }
});

test("kill switch revoke wins over in-flight command", async () => {
  const harness = await createHarness();

  try {
    const joinDecisionPromise = waitForMessage(
      harness.mcp,
      (message) =>
        message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION &&
        message.decision === HUB_JOIN_DECISIONS.JOIN,
    );

    harness.mcp.send(
      JSON.stringify({
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST,
        name: "Agent C",
        reason: "Run command",
        url: "https://example.com/active",
      }),
    );

    const sessionId = await approveSinglePendingSession(harness);
    await joinDecisionPromise;

    harness.mcp.send(
      JSON.stringify({
        requestId: "cmd-1",
        sessionId,
        type: "navigate",
        payload: {
          url: "https://partybrowser.io",
        },
      }),
    );

    await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.SESSION_COMMAND &&
        message.requestId === "cmd-1",
    );

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "kill-1",
        command: HUB_CONTROL_COMMANDS.KILL_SWITCH_SET,
        payload: {
          enabled: false,
        },
      }),
    );

    await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "kill-1",
    );

    const failedCommand = await waitForMessage(
      harness.mcp,
      (message) => message.requestId === "cmd-1",
    );

    assert.equal(failedCommand.errorCode, HUB_ERROR_CODES.KILL_SWITCH_DISABLED);
    assert.equal(failedCommand.payload, null);
  } finally {
    await destroyHarness(harness);
  }
});

test("malformed/unknown envelopes hard-fail", async () => {
  const harness = await createHarness();

  try {
    harness.mcp.send(JSON.stringify({ bad: "message" }));

    const errorMessage = await waitForMessage(
      harness.mcp,
      (message) => message.type === HUB_EXTENSION_MESSAGE_TYPES.ERROR,
    );

    assert.equal(errorMessage.success, false);
    const allowedCodes = [
      HUB_ERROR_CODES.PROTOCOL_UNKNOWN_MESSAGE_TYPE,
      HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE,
    ] as string[];
    assert.ok(allowedCodes.includes(errorMessage.errorCode as string));
  } finally {
    await destroyHarness(harness);
  }
});
