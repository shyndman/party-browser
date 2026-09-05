import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { ContentBridge } from '../messaging/content-bridge';
import type { SessionManager } from '../session/session-manager';
import { InteractionCommands } from './interaction';
import { PageStateReader } from './page-state-reader';
import { TabLifecycle } from './tab-lifecycle';

function createInteractionHarness(waitRequired: boolean) {
  const events: string[] = [];
  const contentBridge = {
    async sendCommand(tabId: number, command: string, params: Record<string, unknown>) {
      events.push(`dispatch:${command}:${tabId}:${JSON.stringify(params)}`);
      return { success: true, data: { command } };
    },
  } as unknown as ContentBridge;
  const sessionManager = {
    async resolveTargetTab() {
      return 77;
    },
  } as unknown as SessionManager;
  const pageStateReader = {
    async read(tabId: number) {
      events.push(`readback:${tabId}`);
      return { url: 'https://after.example', title: 'After', tree: { ok: true } };
    },
  } as unknown as PageStateReader;
  const lifecycle = {
    async runCommand({ dispatch, readback, requireStableBeforeDispatch }: { dispatch: () => Promise<unknown>; readback: () => Promise<unknown>; requireStableBeforeDispatch: boolean }) {
      events.push('lifecycle:start');
      events.push(`lifecycle:stable:${requireStableBeforeDispatch}`);
      const actionResult = await dispatch();
      events.push(waitRequired ? 'lifecycle:wait' : 'lifecycle:no-wait');
      const readbackResult = await readback();
      events.push('lifecycle:done');
      return {
        actionResult,
        readbackResult,
        workflow: { waitRequired, postActionLoading: waitRequired },
      };
    },
  } as unknown as TabLifecycle;

  return {
    events,
    commands: new InteractionCommands(sessionManager, contentBridge, pageStateReader, lifecycle),
  };
}

test('non-navigating interaction reads back immediately after dispatch', async () => {
  const { events, commands } = createInteractionHarness(false);

  const result = await commands.click({ sessionId: 'session-1', element: 'css:#button' });

  assert.equal(result.success, true);
  assert.equal(events.filter((event) => event.startsWith('dispatch:')).length, 1);
  assert.deepEqual(events, [
    'lifecycle:start',
    'lifecycle:stable:false',
    'dispatch:click:77:{"element":"css:#button"}',
    'lifecycle:no-wait',
    'readback:77',
    'lifecycle:done',
  ]);
});

test('navigation-triggering interaction delays readback until after the wait path', async () => {
  const { events, commands } = createInteractionHarness(true);

  const result = await commands.click({ sessionId: 'session-2', element: 'css:a' });

  assert.equal(result.success, true);
  assert.equal(events.filter((event) => event.startsWith('dispatch:')).length, 1);
  assert.deepEqual(events, [
    'lifecycle:start',
    'lifecycle:stable:false',
    'dispatch:click:77:{"element":"css:a"}',
    'lifecycle:wait',
    'readback:77',
    'lifecycle:done',
  ]);
});
