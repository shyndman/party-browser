import { strict as assert } from 'node:assert';
import test, { mock } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import type { CommandResult, SnapshotData } from '../types/commands';

import { PageStateReader } from './page-state-reader';
import { InspectionCommands } from './inspection';

function createReader(responses: CommandResult<SnapshotData>[], sentParams: unknown[] = []): { reader: PageStateReader; sentParams: unknown[] } {
  const contentBridge = {
    async sendCommand(_tabId: number, _command: string, params: unknown) {
      sentParams.push(params);
      return responses.shift();
    },
  } as never;
  return { reader: new PageStateReader(contentBridge), sentParams };
}


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
          tree: [{ role: 'document' }],
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

test('snapshot returns immediately when title and array tree are ready', async () => {
  const { reader, sentParams } = createReader([{ success: true, data: { url: 'https://ready', title: 'Ready', tree: [{ role: 'main' }], nextRefStart: 2 } }]);
  const result = await reader.snapshot(1);
  assert.equal(result.success, true);
  assert.deepEqual(sentParams, [{ nextRefStart: 0 }]);
});

test('snapshot retries until both title and array tree are ready', async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  try {
    const { reader, sentParams } = createReader([
      { success: true, data: { url: 'https://ready', title: '', tree: [{ role: 'main' }], nextRefStart: 1 } },
      { success: true, data: { url: 'https://ready', title: 'Ready', tree: [], nextRefStart: 2 } },
      { success: true, data: { url: 'https://ready', title: 'Ready', tree: [{ role: 'main' }], nextRefStart: 3 } },
    ]);
    const pending = reader.snapshot(1);
    await setImmediate();
    mock.timers.tick(100);
    await setImmediate();
    mock.timers.tick(100);
    const result = await pending;
    assert.equal(result.data?.title, 'Ready');
    assert.deepEqual(result.data?.tree, [{ role: 'main' }]);
    assert.deepEqual(sentParams, [{ nextRefStart: 0 }, { nextRefStart: 1 }, { nextRefStart: 2 }]);
  } finally {
    mock.timers.reset();
  }
});

test('readback returns the latest blank snapshot after one five-second deadline', async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  try {
    const latest: SnapshotData = { url: 'https://blank/latest', title: '', tree: [], nextRefStart: 2 };
    const { reader, sentParams } = createReader([
      { success: true, data: { url: 'https://blank/initial', title: '', tree: [], nextRefStart: 1 } },
      { success: true, data: latest },
    ]);
    let settled = false;
    const pending = reader.read(1).then((result) => { settled = true; return result; });
    await setImmediate();
    mock.timers.tick(4_999);
    assert.equal(settled, false);
    mock.timers.tick(1);
    const result = await pending;
    assert.equal(Date.now(), 5_000);
    assert.deepEqual(result, { url: latest.url, title: latest.title, tree: latest.tree });
    assert.deepEqual(sentParams, [{ nextRefStart: 0 }, { nextRefStart: 1 }]);
  } finally {
    mock.timers.reset();
  }
});

test('snapshot does not retry command failures', async () => {
  const { reader, sentParams } = createReader([{ success: false, error: 'Content unavailable.' }]);
  const result = await reader.snapshot(1);
  assert.equal(result.success, false);
  assert.deepEqual(sentParams, [{ nextRefStart: 0 }]);
});
