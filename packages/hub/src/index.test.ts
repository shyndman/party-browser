import { strict as assert } from "node:assert";
import { Writable } from "node:stream";
import test from "node:test";
import winston from "winston";
import { WebSocket } from "ws";

import { HUB_ERROR_CODES } from "@/errors";
import { addHubLogTransport, getHubLogLevel, removeHubLogTransport, setHubLogLevel } from "@/logger";
import {
  HUB_CONTROL_COMMANDS,
  HUB_CONTROL_EVENTS,
  HUB_CONTROL_MESSAGE_TYPES,
  HUB_EXTENSION_MESSAGE_TYPES,
  HUB_JOIN_DECISIONS,
  SESSION_LEASE_KINDS,
} from "@/protocol/messages";
import { HubRuntime } from "@/index";
import { CommandRouter } from "@/router/command-router";

type Harness = {
  runtime: HubRuntime;
  mcp: WebSocket;
  extension: WebSocket;
};

const TEST_TIMEOUT_MS = 1000;

class LogCaptureStream extends Writable {
  readonly lines: string[] = [];

  override _write(
    chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.lines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    callback();
  }
}

async function createHarness(): Promise<Harness> {
  const runtime = new HubRuntime({
    port: 0,
    host: "127.0.0.1",
    waitingRoomJoinSoundNotifier: {
      notifyJoinRequest: async () => undefined,
    },
  });
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
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent A", reason: "Investigate issue", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com" }),
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

test("takeover join request enters waiting room without URL and approval forwards lease kind", async () => {
  const harness = await createHarness();

  try {
    const joinDecisionPromise = waitForMessage(
      harness.mcp,
      (message) => message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION,
    );
    const approvalEventPromise = waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT &&
        message.event === HUB_CONTROL_EVENTS.SESSION_APPROVED,
    );

    harness.mcp.send(
      JSON.stringify({
        type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST,
        name: "Agent Takeover",
        reason: "Help in current tab",
        leaseKind: SESSION_LEASE_KINDS.TAKEOVER,
      }),
    );

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "list-takeover",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST,
        payload: {},
      }),
    );

    const waitingList = await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "list-takeover",
    );
    const entries = (
      waitingList.payload as { entries: Array<{ sessionId: string; leaseKind: string; url?: string }> }
    ).entries;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].leaseKind, SESSION_LEASE_KINDS.TAKEOVER);
    assert.equal(entries[0].url, undefined);

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "decide-takeover",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_DECIDE,
        payload: {
          sessionId: entries[0].sessionId,
          decision: HUB_JOIN_DECISIONS.JOIN,
        },
      }),
    );

    const decision = await joinDecisionPromise;
    const approvalEvent = await approvalEventPromise;

    assert.equal(decision.decision, HUB_JOIN_DECISIONS.JOIN);
    assert.deepEqual(approvalEvent.payload, {
      sessionId: entries[0].sessionId,
      leaseKind: SESSION_LEASE_KINDS.TAKEOVER,
    });
  } finally {
    await destroyHarness(harness);
  }
});

test("command router rejects duplicate pending request ids without overwriting the original", () => {
  const router = new CommandRouter();
  const sentMessages: string[] = [];
  const extensionSocket = {
    send(message: string) {
      sentMessages.push(message);
    },
  } as unknown as WebSocket;

  router.forwardToExtension(
    {
      requestId: "duplicate-request",
      sessionId: "session-1",
      type: "navigate",
      payload: { url: "https://example.com/one" },
    },
    "mcp-original",
    extensionSocket,
  );

  assert.throws(
    () =>
      router.forwardToExtension(
        {
          requestId: "duplicate-request",
          sessionId: "session-2",
          type: "navigate",
          payload: { url: "https://example.com/two" },
        },
        "mcp-overwrite",
        extensionSocket,
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Duplicate pending request id/);
      return true;
    },
  );

  assert.equal(sentMessages.length, 1);
  const resolution = router.resolveFromExtension({
    type: HUB_EXTENSION_MESSAGE_TYPES.SESSION_RESULT,
    requestId: "duplicate-request",
    sessionId: "session-1",
    success: true,
    result: { ok: true },
  });

  assert.equal(resolution?.mcpConnectionId, "mcp-original");
  assert.deepEqual(resolution?.response, {
    requestId: "duplicate-request",
    sessionId: "session-1",
    type: "navigate",
    payload: { ok: true },
    error: undefined,
    errorCode: undefined,
  });
});

test("duplicate pending MCP command returns session result envelope", async () => {
  const harness = await createHarness();

  try {
    const joinDecisionPromise = waitForMessage(
      harness.mcp,
      (message) =>
        message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION &&
        message.decision === HUB_JOIN_DECISIONS.JOIN,
    );

    harness.mcp.send(
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent Duplicate Request", reason: "Verify duplicate command routing", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com/duplicate-request" }),
    );

    const sessionId = await approveSinglePendingSession(harness);
    await joinDecisionPromise;

    harness.mcp.send(
      JSON.stringify({
        requestId: "cmd-duplicate",
        sessionId,
        type: "navigate",
        payload: {
          url: "https://partybrowser.io/one",
        },
      }),
    );

    await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.SESSION_COMMAND &&
        message.requestId === "cmd-duplicate",
    );

    harness.mcp.send(
      JSON.stringify({
        requestId: "cmd-duplicate",
        sessionId,
        type: "navigate",
        payload: {
          url: "https://partybrowser.io/two",
        },
      }),
    );

    const duplicateFailure = await waitForMessage(
      harness.mcp,
      (message) => message.requestId === "cmd-duplicate",
    );

    assert.equal(duplicateFailure.sessionId, sessionId);
    assert.equal(duplicateFailure.type, "navigate");
    assert.equal(duplicateFailure.payload, null);
    assert.equal(duplicateFailure.errorCode, HUB_ERROR_CODES.ROUTING_FAILED);
    assert.match(String(duplicateFailure.error), /Duplicate pending request id/);

    await expectNoMessage(harness.extension);
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
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent B", reason: "Read dashboard", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com/reject" }),
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

test("setup failure delivers actual cause and discards waiting session", async () => {
  const harness = await createHarness();

  try {
    const registered = waitForMessage(harness.extension, (message) => message.requestId === "register-failure-test");

    harness.extension.send(JSON.stringify({
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND, requestId: "register-failure-test",
      command: HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST, payload: {},
    }));
    await registered;

    const waitingPromise = waitForMessage(harness.extension, (message) =>
      message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT &&
      message.event === HUB_CONTROL_EVENTS.WAITING_ROOM_SYNC &&
      typeof message.payload === "object" && message.payload !== null &&
      "entries" in message.payload && Array.isArray(message.payload.entries) &&
      message.payload.entries.length === 1);
    const decisionPromise = waitForMessage(harness.mcp, (message) =>
      message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION);

    harness.mcp.send(JSON.stringify({
      type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST,
      name: "Agent", reason: "Help here", leaseKind: SESSION_LEASE_KINDS.TAKEOVER,
    }));

    const waiting = await waitingPromise;
    const payload = waiting.payload;

    if (typeof payload !== "object" || payload === null || !("entries" in payload) ||
        !Array.isArray(payload.entries)) {
      throw new Error("Expected waiting-room entries");
    }

    const entry: unknown = payload.entries[0];

    if (typeof entry !== "object" || entry === null || !("sessionId" in entry) ||
        typeof entry.sessionId !== "string") {
      throw new Error("Expected waiting session ID");
    }

    const sessionId = entry.sessionId;
    const clearedPromise = waitForMessage(harness.extension, (message) =>
      message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT &&
      message.event === HUB_CONTROL_EVENTS.WAITING_ROOM_SYNC &&
      typeof message.payload === "object" && message.payload !== null &&
      "entries" in message.payload && Array.isArray(message.payload.entries) &&
      message.payload.entries.length === 0);

    harness.extension.send(JSON.stringify({
      type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
      requestId: "failed-setup", command: HUB_CONTROL_COMMANDS.WAITING_ROOM_DECIDE,
      payload: { sessionId, decision: HUB_JOIN_DECISIONS.SETUP_FAILED,
        error: "Cannot take over about:addons", errorCode: "TAKEOVER_TAB_UNAVAILABLE" },
    }));

    assert.deepEqual(await decisionPromise, {
      type: HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION, decision: HUB_JOIN_DECISIONS.SETUP_FAILED,
      error: "Cannot take over about:addons", errorCode: "TAKEOVER_TAB_UNAVAILABLE",
    });
    await clearedPromise;

    const commandResult = waitForMessage(harness.mcp, (message) => message.requestId === "after-failure");
    harness.mcp.send(JSON.stringify({
      requestId: "after-failure", sessionId, type: "navigate", payload: { url: "https://example.com" },
    }));

    assert.equal((await commandResult).errorCode, HUB_ERROR_CODES.SESSION_NOT_FOUND);
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
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent C", reason: "Run command", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com/active" }),
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

test("approval lifecycle log explains missing lease race after approval", async () => {
  const harness = await createHarness();
  const captureStream = new LogCaptureStream();
  const captureTransport = new winston.transports.Stream({
    stream: captureStream,
    level: "info",
  });
  addHubLogTransport(captureTransport);

  try {
    const joinDecisionPromise = waitForMessage(
      harness.mcp,
      (message) =>
        message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION &&
        message.decision === HUB_JOIN_DECISIONS.JOIN,
    );

    harness.mcp.send(
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent Lease Race", reason: "Race first command after approval", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com/lease-race" }),
    );

    const sessionId = await approveSinglePendingSession(harness);
    await joinDecisionPromise;

    harness.mcp.send(
      JSON.stringify({
        requestId: "cmd-lease-race",
        sessionId,
        type: "navigate",
        payload: {
          url: "https://partybrowser.io/lease-race",
        },
      }),
    );

    await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.SESSION_COMMAND &&
        message.requestId === "cmd-lease-race",
    );

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.SESSION_RESULT,
        requestId: "cmd-lease-race",
        sessionId,
        success: false,
        error: "No active lease for session.",
        errorCode: "SESSION_LEASE_NOT_FOUND",
      }),
    );

    const failedCommand = await waitForMessage(
      harness.mcp,
      (message) => message.requestId === "cmd-lease-race",
    );

    assert.equal(failedCommand.errorCode, "SESSION_LEASE_NOT_FOUND");

    const approvalLifecycleLine = captureStream.lines.find(
      (line) =>
        line.includes("Session approved in hub after extension requested activation.") &&
        line.includes("session.lifecycle") &&
        line.includes(`sessionId=${sessionId}`) &&
        line.includes("fromState=pending") &&
        line.includes("toState=active") &&
        line.includes("leaseReadyAcknowledged=true"),
    );
    assert.ok(approvalLifecycleLine, "expected approval lifecycle log line");

    const leaseRaceWarningLine = captureStream.lines.find(
      (line) =>
        line.includes(
          "Extension reported missing session lease; likely approval-before-lease-ready race after hub approval.",
        ) &&
        line.includes(`sessionId=${sessionId}`) &&
        line.includes("requestId=cmd-lease-race") &&
        line.includes("commandType=navigate") &&
        line.includes("errorCode=SESSION_LEASE_NOT_FOUND") &&
        line.includes("sessionState=active") &&
        line.includes("likelyCause=approval_before_extension_lease_ready"),
    );
    assert.ok(leaseRaceWarningLine, "expected missing-lease race warning log line");
  } finally {
    removeHubLogTransport(captureTransport);
    await destroyHarness(harness);
  }
});

test("mcp disconnect cleans up pending and active sessions for that connection", async () => {
  const harness = await createHarness();
  const captureStream = new LogCaptureStream();
  const captureTransport = new winston.transports.Stream({
    stream: captureStream,
    level: "info",
  });
  addHubLogTransport(captureTransport);

  try {
    const joinDecisionPromise = waitForMessage(
      harness.mcp,
      (message) =>
        message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION &&
        message.decision === HUB_JOIN_DECISIONS.JOIN,
    );

    harness.mcp.send(
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent D", reason: "Run active command", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com/active-disconnect" }),
    );

    harness.mcp.send(
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent E", reason: "Remain pending", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com/pending-disconnect" }),
    );

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "list-mcp-disconnect-initial",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST,
        payload: {},
      }),
    );

    const initialWaitingList = await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "list-mcp-disconnect-initial",
    );

    const initialEntries = (
      initialWaitingList.payload as { entries: Array<{ sessionId: string; url: string }> }
    ).entries;
    assert.equal(initialEntries.length, 2);

    const activeEntry = initialEntries.find(
      (entry) => entry.url === "https://example.com/active-disconnect",
    );
    const pendingEntry = initialEntries.find(
      (entry) => entry.url === "https://example.com/pending-disconnect",
    );
    assert.ok(activeEntry, "expected active session waiting-room entry");
    assert.ok(pendingEntry, "expected pending session waiting-room entry");

    const activeSessionId = activeEntry.sessionId;
    const pendingSessionId = pendingEntry.sessionId;

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "decide-mcp-disconnect-active",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_DECIDE,
        payload: {
          sessionId: activeSessionId,
          decision: HUB_JOIN_DECISIONS.JOIN,
        },
      }),
    );

    await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "decide-mcp-disconnect-active",
    );
    await joinDecisionPromise;

    harness.mcp.send(
      JSON.stringify({
        requestId: "cmd-mcp-disconnect",
        sessionId: activeSessionId,
        type: "navigate",
        payload: {
          url: "https://partybrowser.io/disconnect",
        },
      }),
    );

    await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.SESSION_COMMAND &&
        message.requestId === "cmd-mcp-disconnect",
    );

    const pendingSessionRevokedPromise = waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT &&
        message.event === HUB_CONTROL_EVENTS.SESSION_REVOKED &&
        (message.payload as { sessionId?: string }).sessionId === pendingSessionId,
    );
    const activeSessionRevokedPromise = waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT &&
        message.event === HUB_CONTROL_EVENTS.SESSION_REVOKED &&
        (message.payload as { sessionId?: string }).sessionId === activeSessionId,
    );
    const waitingRoomSyncPromise = waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_EVENT &&
        message.event === HUB_CONTROL_EVENTS.WAITING_ROOM_SYNC &&
        Array.isArray((message.payload as { entries?: unknown[] }).entries) &&
        ((message.payload as { entries?: unknown[] }).entries?.length ?? -1) === 0,
    );

    const mcpClosePromise = new Promise<void>((resolve) => {
      harness.mcp.once("close", () => resolve());
    });
    harness.mcp.close();
    await mcpClosePromise;

    const pendingSessionRevoked = await pendingSessionRevokedPromise;
    const activeSessionRevoked = await activeSessionRevokedPromise;
    await waitingRoomSyncPromise;

    assert.equal(
      (pendingSessionRevoked.payload as { reason?: string }).reason,
      "mcp_disconnect",
    );
    assert.equal((activeSessionRevoked.payload as { reason?: string }).reason, "mcp_disconnect");

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "list-mcp-disconnect-final",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST,
        payload: {},
      }),
    );

    const finalWaitingList = await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "list-mcp-disconnect-final",
    );

    const finalEntries = (
      finalWaitingList.payload as { entries: Array<{ sessionId: string }> }
    ).entries;
    assert.equal(finalEntries.length, 0);

    const disconnectSummaryLine = captureStream.lines.find(
      (line) =>
        line.includes("Revoked sessions for disconnected MCP connection.") &&
        line.includes("affectedSessionCount=2") &&
        line.includes("removedPendingCount=1") &&
        line.includes("revokedPendingCount=1") &&
        line.includes("revokedActiveCount=1") &&
        line.includes("failedCommandCount=1"),
    );
    assert.ok(disconnectSummaryLine, "expected MCP disconnect cleanup summary log line");

    const activeLifecycleLine = captureStream.lines.find(
      (line) =>
        line.includes("Session revoked because MCP connection closed.") &&
        line.includes(`sessionId=${activeSessionId}`) &&
        line.includes("fromState=active") &&
        line.includes("toState=revoked") &&
        line.includes("reason=mcp_disconnect"),
    );
    assert.ok(activeLifecycleLine, "expected active session lifecycle revoke log line");

    const pendingLifecycleLine = captureStream.lines.find(
      (line) =>
        line.includes("Session revoked because MCP connection closed.") &&
        line.includes(`sessionId=${pendingSessionId}`) &&
        line.includes("fromState=pending") &&
        line.includes("toState=revoked") &&
        line.includes("removedFromWaitingRoom=true") &&
        line.includes("reason=mcp_disconnect"),
    );
    assert.ok(pendingLifecycleLine, "expected pending session lifecycle revoke log line");
  } finally {
    removeHubLogTransport(captureTransport);
    await destroyHarness(harness);
  }
});

test("replaced extension close does not clear current extension or revoke sessions", async () => {
  const harness = await createHarness();
  let replacementExtension: WebSocket | undefined;

  try {
    const joinDecisionPromise = waitForMessage(
      harness.mcp,
      (message) =>
        message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION &&
        message.decision === HUB_JOIN_DECISIONS.JOIN,
    );

    harness.mcp.send(
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent Replacement", reason: "Keep session through extension replacement", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com/replacement" }),
    );

    const sessionId = await approveSinglePendingSession(harness);
    await joinDecisionPromise;

    const originalExtensionClosed = new Promise<void>((resolve) => {
      harness.extension.once("close", () => resolve());
    });
    replacementExtension = await openSocket(`ws://127.0.0.1:${harness.runtime.getBoundPort()}`);
    replacementExtension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "replacement-list",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST,
        payload: {},
      }),
    );

    await waitForMessage(
      replacementExtension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "replacement-list",
    );
    await originalExtensionClosed;

    harness.mcp.send(
      JSON.stringify({
        requestId: "cmd-after-replacement",
        sessionId,
        type: "navigate",
        payload: {
          url: "https://partybrowser.io/after-replacement",
        },
      }),
    );

    const forwardedCommand = await waitForMessage(
      replacementExtension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.SESSION_COMMAND &&
        message.requestId === "cmd-after-replacement",
    );

    assert.equal(forwardedCommand.sessionId, sessionId);
    assert.equal(forwardedCommand.command, "navigate");
  } finally {
    replacementExtension?.close();
    await destroyHarness(harness);
  }
});

test("current extension close still revokes active sessions", async () => {
  const harness = await createHarness();

  try {
    const joinDecisionPromise = waitForMessage(
      harness.mcp,
      (message) =>
        message.type === HUB_CONTROL_MESSAGE_TYPES.JOIN_DECISION &&
        message.decision === HUB_JOIN_DECISIONS.JOIN,
    );

    harness.mcp.send(
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent Extension Close", reason: "Verify current extension close revokes", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com/current-extension-close" }),
    );

    const sessionId = await approveSinglePendingSession(harness);
    await joinDecisionPromise;

    const extensionClosed = new Promise<void>((resolve) => {
      harness.extension.once("close", () => resolve());
    });
    harness.extension.close();
    await extensionClosed;

    harness.mcp.send(
      JSON.stringify({
        requestId: "cmd-after-current-extension-close",
        sessionId,
        type: "navigate",
        payload: {
          url: "https://partybrowser.io/current-extension-close",
        },
      }),
    );

    const failedCommand = await waitForMessage(
      harness.mcp,
      (message) => message.requestId === "cmd-after-current-extension-close",
    );

    assert.equal(failedCommand.sessionId, sessionId);
    assert.equal(failedCommand.type, "navigate");
    assert.equal(failedCommand.payload, null);
    assert.equal(failedCommand.errorCode, HUB_ERROR_CODES.SESSION_REVOKED);
  } finally {
    await destroyHarness(harness);
  }
});

test("mcp session routing failures return session result envelope", async () => {
  const harness = await createHarness();

  try {
    harness.mcp.send(
      JSON.stringify({
        requestId: "cmd-missing-session",
        sessionId: "missing-session",
        type: "navigate",
        payload: {
          url: "https://partybrowser.io/missing-session",
        },
      }),
    );

    const failedCommand = await waitForMessage(
      harness.mcp,
      (message) => message.requestId === "cmd-missing-session",
    );

    assert.equal(failedCommand.sessionId, "missing-session");
    assert.equal(failedCommand.type, "navigate");
    assert.equal(failedCommand.payload, null);
    assert.equal(failedCommand.errorCode, HUB_ERROR_CODES.SESSION_NOT_FOUND);
  } finally {
    await destroyHarness(harness);
  }
});

test("invalid waiting-room decisions are rejected without removing entry", async () => {
  const harness = await createHarness();

  try {
    harness.mcp.send(
      JSON.stringify({ type: HUB_CONTROL_MESSAGE_TYPES.JOIN_REQUEST, name: "Agent Invalid Decision", reason: "Stay in waiting room after invalid decision", leaseKind: SESSION_LEASE_KINDS.WORKSPACE, url: "https://example.com/invalid-decision" }),
    );

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "invalid-decision-list-initial",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST,
        payload: {},
      }),
    );

    const initialWaitingList = await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "invalid-decision-list-initial",
    );
    const sessionId = (
      initialWaitingList.payload as { entries: Array<{ sessionId: string }> }
    ).entries[0].sessionId;

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "invalid-decision-decide",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_DECIDE,
        payload: {
          sessionId,
          decision: "maybe",
        },
      }),
    );

    const rejectedDecision = await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "invalid-decision-decide",
    );

    assert.equal(rejectedDecision.success, false);
    assert.equal(rejectedDecision.errorCode, HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
    await expectNoMessage(harness.mcp);

    harness.extension.send(
      JSON.stringify({
        type: HUB_EXTENSION_MESSAGE_TYPES.CONTROL_COMMAND,
        requestId: "invalid-decision-list-final",
        command: HUB_CONTROL_COMMANDS.WAITING_ROOM_LIST,
        payload: {},
      }),
    );

    const finalWaitingList = await waitForMessage(
      harness.extension,
      (message) =>
        message.type === HUB_EXTENSION_MESSAGE_TYPES.CONTROL_RESPONSE &&
        message.requestId === "invalid-decision-list-final",
    );
    const finalEntries = (
      finalWaitingList.payload as { entries: Array<{ sessionId: string }> }
    ).entries;

    assert.equal(finalEntries.length, 1);
    assert.equal(finalEntries[0].sessionId, sessionId);
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

test("malformed JSON logs protocol metadata and debug payloads", async () => {
  const harness = await createHarness();
  const captureStream = new LogCaptureStream();
  const captureTransport = new winston.transports.Stream({
    stream: captureStream,
    level: "debug",
  });
  const previousLogLevel = getHubLogLevel();
  addHubLogTransport(captureTransport);

  try {
    setHubLogLevel("debug");

    harness.mcp.send("{");

    const errorMessage = await waitForMessage(
      harness.mcp,
      (message) => message.type === HUB_EXTENSION_MESSAGE_TYPES.ERROR,
    );

    assert.equal(errorMessage.success, false);
    assert.equal(errorMessage.errorCode, HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);

    const errorProtocolLine = captureStream.lines.find(
      (line) =>
        line.includes("error.protocol") &&
        line.includes(HUB_ERROR_CODES.PROTOCOL_INVALID_MESSAGE) &&
        line.includes("Sending hub protocol error."),
    );
    assert.ok(errorProtocolLine, "expected protocol error log line");

    const debugPayloadLine = captureStream.lines.find(
      (line) =>
        line.includes("message.inbound") &&
        line.includes("Inbound message payload.") &&
        line.includes("payload={"),
    );
    assert.ok(debugPayloadLine, "expected debug payload log line");
  } finally {
    removeHubLogTransport(captureTransport);
    setHubLogLevel(previousLogLevel);
    await destroyHarness(harness);
  }
});
