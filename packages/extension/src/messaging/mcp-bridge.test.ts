import { strict as assert } from 'node:assert';
import test from 'node:test';

import { McpBridge } from './mcp-bridge';
import { ControlEvents, WaitingRoomDecisions, WsMessageKinds } from '@/types/messages';
import { SessionLeaseKinds, SessionLeaseOwnerships } from '@/types/session';
import type { SessionManager, SessionLease } from '@/session/session-manager';
import type { CommandHandler } from '@/commands/command-handler';
import { CodedError, ErrorCodes } from '@/utils/errors';

function createBridgeHarness(setupError?: Error) {
  const leases = new Map<string, SessionLease>();
  const createWorkspaceLeaseCalls: Array<{ sessionId: string; url: string }> = [];
  const createTakeoverLeaseCalls: string[] = [];
  const revokeLeaseCalls: Array<{ sessionId: string; reason: string }> = [];
  const sentMessages: unknown[] = [];

  const sessionManagerMock = {
    hasLease(sessionId: string) {
      return leases.has(sessionId);
    },
    async createWorkspaceLease(sessionId: string, url: string) {
      createWorkspaceLeaseCalls.push({ sessionId, url });
      const lease = {
        windowId: 900 + createWorkspaceLeaseCalls.length,
        tabId: 1200 + createWorkspaceLeaseCalls.length,
        leaseKind: SessionLeaseKinds.WORKSPACE,
        ownership: SessionLeaseOwnerships.OWNED,
        closeOnRevoke: true,
      };
      leases.set(sessionId, lease);
      return lease;
    },
    async createTakeoverLease(sessionId: string) {
      createTakeoverLeaseCalls.push(sessionId);

      if (setupError) {
        throw setupError;
      }

      const lease = {
        windowId: 42,
        tabId: 84,
        leaseKind: SessionLeaseKinds.TAKEOVER,
        ownership: SessionLeaseOwnerships.BORROWED,
        closeOnRevoke: false,
      };
      leases.set(sessionId, lease);
      return lease;
    },
    getLease(sessionId: string) {
      return leases.get(sessionId) ?? null;
    },
    async revokeLease(sessionId: string, reason: string) {
      revokeLeaseCalls.push({ sessionId, reason });
      leases.delete(sessionId);
      return true;
    },
    async revokeAllLeases() {
      return undefined;
    },
  } as unknown as SessionManager;

  const commandHandlerMock = {
    async execute() {
      return { success: true };
    },
  } as unknown as CommandHandler;

  const bridge = new McpBridge(
    sessionManagerMock,
    commandHandlerMock,
    { reconnectInterval: 10 },
    () => true,
  );
  (bridge as any).send = (message: unknown) => {
    sentMessages.push(message);
  };
  (bridge as any).isConnected = () => true;

  return {
    bridge,
    createWorkspaceLeaseCalls,
    createTakeoverLeaseCalls,
    revokeLeaseCalls,
    sentMessages,
  };
}

async function flushBridgeApproval(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('session approved is idempotent and does not create the lease anymore', async () => {
  const { bridge, createWorkspaceLeaseCalls } = createBridgeHarness();

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_EVENT,
    event: ControlEvents.WAITING_ROOM_SYNC,
    payload: {
      entries: [
        {
          sessionId: 'session-abc',
          name: 'Agent',
          reason: 'Need workspace',
          leaseKind: SessionLeaseKinds.WORKSPACE,
          url: 'https://example.com/start',
          joinRequestTime: Date.now(),
        },
      ],
    },
  });

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_EVENT,
    event: ControlEvents.SESSION_APPROVED,
    payload: {
      sessionId: 'session-abc',
      leaseKind: SessionLeaseKinds.WORKSPACE,
    },
  });

  assert.equal(createWorkspaceLeaseCalls.length, 0);
});

test('approving workspace creates local lease before hub decision command', async () => {
  const { bridge, createWorkspaceLeaseCalls, sentMessages } = createBridgeHarness();

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_EVENT,
    event: ControlEvents.WAITING_ROOM_SYNC,
    payload: {
      entries: [
        {
          sessionId: 'session-abc',
          name: 'Agent',
          reason: 'Need workspace',
          leaseKind: SessionLeaseKinds.WORKSPACE,
          url: 'https://example.com/start',
          joinRequestTime: Date.now(),
        },
      ],
    },
  });

  const responsePromise = bridge.submitWaitingRoomDecision(
    'session-abc',
    WaitingRoomDecisions.JOIN,
  );
  await flushBridgeApproval();
  const sentCommand = sentMessages[0] as { requestId: string };

  assert.deepEqual(createWorkspaceLeaseCalls[0], {
    sessionId: 'session-abc',
    url: 'https://example.com/start',
  });

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_RESPONSE,
    requestId: sentCommand.requestId,
    success: true,
    payload: { sessionId: 'session-abc', decision: WaitingRoomDecisions.JOIN },
  });

  assert.equal((await responsePromise).success, true);
});

test('approving takeover creates focused-tab lease before hub decision command', async () => {
  const { bridge, createTakeoverLeaseCalls, sentMessages } = createBridgeHarness();

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_EVENT,
    event: ControlEvents.WAITING_ROOM_SYNC,
    payload: {
      entries: [
        {
          sessionId: 'session-takeover',
          name: 'Agent',
          reason: 'Help here',
          leaseKind: SessionLeaseKinds.TAKEOVER,
          joinRequestTime: Date.now(),
        },
      ],
    },
  });

  const responsePromise = bridge.submitWaitingRoomDecision(
    'session-takeover',
    WaitingRoomDecisions.JOIN,
  );
  await flushBridgeApproval();
  const sentCommand = sentMessages[0] as { requestId: string };

  assert.deepEqual(createTakeoverLeaseCalls, ['session-takeover']);

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_RESPONSE,
    requestId: sentCommand.requestId,
    success: true,
    payload: { sessionId: 'session-takeover', decision: WaitingRoomDecisions.JOIN },
  });

  assert.equal((await responsePromise).success, true);
});

test('hub decision failure revokes locally created lease', async () => {
  const { bridge, revokeLeaseCalls, sentMessages } = createBridgeHarness();

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_EVENT,
    event: ControlEvents.WAITING_ROOM_SYNC,
    payload: {
      entries: [
        {
          sessionId: 'session-abc',
          name: 'Agent',
          reason: 'Need workspace',
          leaseKind: SessionLeaseKinds.WORKSPACE,
          url: 'https://example.com/start',
          joinRequestTime: Date.now(),
        },
      ],
    },
  });

  const responsePromise = bridge.submitWaitingRoomDecision(
    'session-abc',
    WaitingRoomDecisions.JOIN,
  );
  await flushBridgeApproval();
  const sentCommand = sentMessages[0] as { requestId: string };

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_RESPONSE,
    requestId: sentCommand.requestId,
    success: false,
    error: 'hub rejected decision',
    errorCode: 'WAITING_ROOM_ENTRY_NOT_FOUND',
  });

  assert.equal((await responsePromise).success, false);
  assert.deepEqual(revokeLeaseCalls, [
    { sessionId: 'session-abc', reason: 'hub_decision_failed' },
  ]);
});

test('setup failure terminates waiting request and preserves actual error for operator and agent', async () => {
  const setupError = new CodedError('Cannot take over about:addons', ErrorCodes.TAKEOVER_TAB_UNAVAILABLE);
  const { bridge, sentMessages } = createBridgeHarness(setupError);

  // Exercise the established inbound-message seam without opening a transport.
  const inbound = bridge as unknown as { handleInboundMessage(message: unknown): Promise<void> };

  await inbound.handleInboundMessage({
    type: WsMessageKinds.CONTROL_EVENT,
    event: ControlEvents.WAITING_ROOM_SYNC,
    payload: { entries: [{
      sessionId: 'failed-takeover', name: 'Agent', reason: 'Help here',
      leaseKind: SessionLeaseKinds.TAKEOVER, joinRequestTime: Date.now(),
    }] },
  });

  const responsePromise = bridge.submitWaitingRoomDecision('failed-takeover', WaitingRoomDecisions.JOIN);
  await flushBridgeApproval();

  assert.deepEqual(bridge.getWaitingRoomEntries(), []);

  const command = sentMessages[0] as { requestId: string; payload: unknown };

  assert.deepEqual(command.payload, {
    sessionId: 'failed-takeover', decision: 'setup_failed',
    error: setupError.message, errorCode: setupError.errorCode,
  });

  await inbound.handleInboundMessage({
    type: WsMessageKinds.CONTROL_RESPONSE, requestId: command.requestId, success: true,
  });

  const response = await responsePromise;

  assert.equal(response.success, false);
  assert.equal(response.error, setupError.message);
  assert.equal(response.errorCode, setupError.errorCode);
});
