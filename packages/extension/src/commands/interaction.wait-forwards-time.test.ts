import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { ContentBridge } from '../messaging/content-bridge';
import type { SessionManager } from '../session/session-manager';
import { InteractionCommands } from './interaction';

test('wait honors the requested duration', async () => {
  const tabId = 42;
  const waitSeconds = 0.1;
  let sendCommandCalled = false;

  const sessionManagerMock = {
    resolveTargetTab: async () => tabId,
  } as unknown as SessionManager;

  const contentBridgeMock = {
    sendCommand: async (targetTabId: number, command: string, params: { time: number }) => {
      assert.equal(targetTabId, tabId);
      assert.equal(command, 'wait');
      assert.equal(params.time, waitSeconds);
      sendCommandCalled = true;

      const start = Date.now();
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      const waited = Date.now() - start;

      return { success: true, data: { waited } };
    },
  } as unknown as ContentBridge;

  const commands = new InteractionCommands(sessionManagerMock, contentBridgeMock);

  const before = Date.now();
  const result = await commands.wait({ sessionId: 'session-xyz', time: waitSeconds });
  const elapsed = Date.now() - before;

  assert.equal(result.success, true);
  assert.ok(sendCommandCalled);
  assert.ok(
    elapsed >= waitSeconds * 1000,
    `wait resolved too early: elapsed ${elapsed}ms < expected ${waitSeconds * 1000}ms`,
  );
});
