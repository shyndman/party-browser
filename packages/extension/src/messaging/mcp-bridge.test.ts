import { strict as assert } from 'node:assert';
import test from 'node:test';

import { McpBridge } from './mcp-bridge';
import { ControlEvents, WsMessageKinds } from '@/types/messages';
import type { SessionManager, SessionLease } from '@/session/session-manager';
import type { CommandHandler } from '@/commands/command-handler';

function createBridgeHarness() {
  const leases = new Map<string, SessionLease>();
  const createLeaseCalls: Array<{ sessionId: string; url: string }> = [];

  const sessionManagerMock = {
    hasLease(sessionId: string) {
      return leases.has(sessionId);
    },
    async createLease(sessionId: string, url: string) {
      createLeaseCalls.push({ sessionId, url });
      const lease = {
        windowId: 900 + createLeaseCalls.length,
        tabId: 1200 + createLeaseCalls.length,
      };
      leases.set(sessionId, lease);
      return lease;
    },
    getLease(sessionId: string) {
      return leases.get(sessionId) ?? null;
    },
    async revokeLease() {
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

  return {
    bridge,
    createLeaseCalls,
  };
}

test('approval flow creates one window-backed lease per session and preserves URL', async () => {
  const { bridge, createLeaseCalls } = createBridgeHarness();

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_EVENT,
    event: ControlEvents.SESSION_APPROVED,
    payload: {
      sessionId: 'session-abc',
      url: 'https://example.com/start',
    },
  });

  await (bridge as any).handleInboundMessage({
    type: WsMessageKinds.CONTROL_EVENT,
    event: ControlEvents.SESSION_APPROVED,
    payload: {
      sessionId: 'session-abc',
      url: 'https://example.com/start',
    },
  });

  assert.equal(createLeaseCalls.length, 1);
  assert.deepEqual(createLeaseCalls[0], {
    sessionId: 'session-abc',
    url: 'https://example.com/start',
  });
});
