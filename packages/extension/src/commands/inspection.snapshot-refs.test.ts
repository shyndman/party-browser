import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InspectionCommands } from './inspection';

test('snapshot tracks nextRefStart per tab and clears it on lease revocation', async () => {
  let revokeCallback: ((sessionId: string, lease: { windowId: number; tabId: number }, reason: string) => void) | null = null;
  const sentParams: unknown[] = [];

  const sessionManager = {
    async resolveTargetTab(): Promise<number> {
      return 7;
    },
    onLeaseRevoked(callback: (sessionId: string, lease: { windowId: number; tabId: number }, reason: string) => void): void {
      revokeCallback = callback;
    },
  } as never;

  const contentBridge = {
    async sendCommand(_tabId: number, command: string, params: unknown) {
      assert.equal(command, 'snapshot');
      sentParams.push(params);

      const nextRefStart = (params as { nextRefStart: number }).nextRefStart;
      return {
        success: true,
        data: {
          tree: [],
          nextRefStart: nextRefStart + 2,
        },
      };
    },
  } as never;

  const commands = new InspectionCommands(sessionManager, {} as never, contentBridge);

  const first = await commands.snapshot({ sessionId: 'session-1' });
  const second = await commands.snapshot({ sessionId: 'session-1' });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.deepEqual(sentParams, [{ nextRefStart: 0 }, { nextRefStart: 2 }]);

  assert.ok(revokeCallback);
  if (!revokeCallback) {
    throw new Error('Expected revoke callback to be registered');
  }
  const callback = revokeCallback as (sessionId: string, lease: { windowId: number; tabId: number }, reason: string) => void;
  callback('session-1', { windowId: 1, tabId: 7 }, 'test');

  await commands.snapshot({ sessionId: 'session-2' });
  assert.deepEqual(sentParams[2], { nextRefStart: 0 });
});
