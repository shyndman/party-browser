import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { SessionManager } from '../session/session-manager';
import type { WaitForParams } from '../types/commands';
import { InteractionCommands } from './interaction';

interface SentCommand {
  tabId: number;
  command: string;
  params: unknown;
}

function createInteractionHarness() {
  const commandsSent: SentCommand[] = [];
  const contentBridge = {
    async sendCommand(tabId: number, command: string, params: unknown) {
      commandsSent.push({ tabId, command, params });
      return { success: true };
    },
  };

  const sessionManager = {
    async resolveTargetTab() {
      return 123;
    },
  } as unknown as SessionManager;

  const commands = new InteractionCommands(sessionManager, contentBridge as any);
  return { commands, commandsSent };
}

test('wait_for time forwards a numeric value', async () => {
  const { commands, commandsSent } = createInteractionHarness();
  const params: WaitForParams = { sessionId: 'session-time', mode: 'time', value: 5 };
  await commands.waitFor(params);

  assert.equal(commandsSent.length, 1);
  const [first] = commandsSent;
  assert.equal(first.command, 'wait_for');
  assert.equal(first.tabId, 123);

  const payload = first.params as { mode: 'time'; value: number; timeout?: number };
  assert.equal(payload.mode, 'time');
  assert.equal(payload.value, 5);
  assert.equal(typeof payload.value, 'number');
  assert.equal(payload.timeout, undefined);
});

test('wait_for text preserves string value and timeout', async () => {
  const { commands, commandsSent } = createInteractionHarness();
  const params: WaitForParams = { sessionId: 'session-text', mode: 'text', value: 'ready', timeout: 12 };
  await commands.waitFor(params);

  assert.equal(commandsSent.length, 1);
  const [first] = commandsSent;
  assert.equal(first.command, 'wait_for');

  const payload = first.params as { mode: 'text'; value: string; timeout: number };
  assert.equal(payload.mode, 'text');
  assert.equal(payload.value, 'ready');
  assert.equal(payload.timeout, 12);
});
