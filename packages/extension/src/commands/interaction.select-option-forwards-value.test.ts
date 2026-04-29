import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InteractionCommands } from './interaction';
import type { ContentBridge } from '../messaging/content-bridge';
import type { SessionManager } from '../session/session-manager';

test('selectOption forwards the requested value to the content script', async () => {
  const targetTabId = 87;

  const resolveCalls: Array<{ sessionId: string }> = [];
  const sessionManagerMock = {
    async resolveTargetTab(params: { sessionId: string }) {
      resolveCalls.push({ sessionId: params.sessionId });
      return targetTabId;
    },
  } as unknown as SessionManager;

  const sendCommandCalls: Array<{ tabId: number; command: string; params: Record<string, unknown> }> = [];
  const contentBridgeMock = {
    async sendCommand(tabId: number, command: string, params: Record<string, unknown>) {
      sendCommandCalls.push({ tabId, command, params });
      return { success: true };
    },
  } as unknown as ContentBridge;

  const pageStateReader = {
    async read() {
      return { url: 'https://after.example', title: 'After', tree: {} };
    },
  } as any;
  const lifecycle = {
    async runCommand({ dispatch, readback }: { dispatch: () => Promise<unknown>; readback: () => Promise<unknown> }) {
      return {
        actionResult: await dispatch(),
        readbackResult: await readback(),
        workflow: { waitRequired: false, postActionLoading: false },
      };
    },
  } as any;

  const commands = new InteractionCommands(sessionManagerMock, contentBridgeMock, pageStateReader, lifecycle);
  const params = { sessionId: 'session-11', element: 'css:#dropdown', value: 'desired-value' };

  const result = await commands.selectOption(params);

  assert.equal(result.success, true);
  assert.equal((result.data as { pageState: { url: string } }).pageState.url, 'https://after.example');
  assert.deepEqual(resolveCalls, [{ sessionId: 'session-11' }]);
  assert.deepEqual(sendCommandCalls, [
    {
      tabId: targetTabId,
      command: 'select_option',
      params: { element: 'css:#dropdown', value: 'desired-value' },
    },
  ]);
});
