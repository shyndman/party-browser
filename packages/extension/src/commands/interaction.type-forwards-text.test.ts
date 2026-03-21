import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { ContentBridge } from '../messaging/content-bridge';
import type { SessionManager } from '../session/session-manager';
import { InteractionCommands } from './interaction';

test('type command forwards text payload to content script', async () => {
  const captured: Array<{ tabId: number; command: string; params: Record<string, unknown> }> = [];
  const stubSessionManager = {
    resolveTargetTab: async () => 42,
  } as unknown as SessionManager;
  const stubContentBridge = {
    sendCommand: async (tabId: number, command: string, params: unknown) => {
      captured.push({ tabId, command, params: params as Record<string, unknown> });
      return { success: true };
    },
  } as unknown as ContentBridge;

  const commands = new InteractionCommands(stubSessionManager, stubContentBridge);
  const payload = { sessionId: 'session-10', element: 'css:.input', text: 'typed text payload' };

  const result = await commands.type(payload);

  assert.equal(result.success, true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].command, 'type');
  assert.deepEqual(captured[0].params, { element: payload.element, text: payload.text });
});
