import { strict as assert } from 'node:assert';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ErrorCodes } from '../utils/errors';
import { CommandWorkflowError, TabLifecycle, createLoadWaiter } from './tab-lifecycle';

type Listener<TArgs extends unknown[]> = (...args: TArgs) => void;

function createEmitter<TArgs extends unknown[]>() {
  const listeners = new Set<Listener<TArgs>>();
  return {
    addListener(listener: Listener<TArgs>) {
      listeners.add(listener);
    },
    removeListener(listener: Listener<TArgs>) {
      listeners.delete(listener);
    },
    emit(...args: TArgs) {
      for (const listener of listeners) {
        listener(...args);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function installBrowserMock(tabStates: Array<{ status?: 'loading' | 'complete'; url?: string; pendingUrl?: string }>) {
  const originalBrowser = (globalThis as any).browser;
  const completed = createEmitter<[details: { tabId: number; frameId: number; url?: string }]>();
  const errored = createEmitter<[
    details: { tabId: number; frameId: number; url?: string; error?: string },
  ]>();
  const removed = createEmitter<[tabId: number]>();
  let getCallIndex = 0;

  (globalThis as any).browser = {
    tabs: {
      onRemoved: removed,
      async get(tabId: number) {
        const state = tabStates[Math.min(getCallIndex, tabStates.length - 1)] ?? tabStates.at(-1) ?? {};
        getCallIndex += 1;
        return {
          id: tabId,
          title: state.url ?? 'title',
          ...state,
        };
      },
    },
    webNavigation: {
      onCompleted: completed,
      onErrorOccurred: errored,
    },
  };

  return {
    completed,
    errored,
    removed,
    restore() {
      (globalThis as any).browser = originalBrowser;
    },
  };
}

test('tab lifecycle skips waiting when the tab stays stable after dispatch', async () => {
  const browserMock = installBrowserMock([
    { status: 'complete', url: 'https://before.example' },
    { status: 'complete', url: 'https://after.example' },
  ]);
  const waitedPhases: string[] = [];
  const lifecycle = new TabLifecycle(() => ({
    async wait() {
      waitedPhases.push('wait');
    },
    dispose() {
      waitedPhases.push('dispose');
    },
  }));

  try {
    const result = await lifecycle.runCommand({
      command: 'click',
      commandId: 'AB12',
      sessionId: 'session-1',
      tabId: 41,
      requireStableBeforeDispatch: true,
      async dispatch() {
        return { ok: true };
      },
      async readback() {
        return { tree: { ok: true } };
      },
    });

    assert.deepEqual(result.workflow, {
      waitRequired: false,
      postActionLoading: false,
    });
    assert.deepEqual(waitedPhases, ['dispose']);
  } finally {
    browserMock.restore();
  }
});

test('tab lifecycle waits when the tab enters loading after dispatch', async () => {
  const browserMock = installBrowserMock([
    { status: 'complete', url: 'https://before.example' },
    { status: 'loading', url: 'https://before.example', pendingUrl: 'https://after.example' },
  ]);
  const waitedPhases: string[] = [];
  const lifecycle = new TabLifecycle(() => ({
    async wait() {
      waitedPhases.push('wait');
    },
    dispose() {
      waitedPhases.push('dispose');
    },
  }));

  try {
    const result = await lifecycle.runCommand({
      command: 'click',
      commandId: 'CD34',
      sessionId: 'session-2',
      tabId: 42,
      requireStableBeforeDispatch: true,
      async dispatch() {
        return { ok: true };
      },
      async readback() {
        return { tree: { ok: true } };
      },
    });

    assert.deepEqual(result.workflow, {
      waitRequired: true,
      postActionLoading: true,
    });
    assert.deepEqual(waitedPhases, ['wait', 'dispose']);
  } finally {
    browserMock.restore();
  }
});

test('tab lifecycle fails fast when the pre-action tab is already loading', async () => {
  const browserMock = installBrowserMock([
    { status: 'loading', url: 'https://before.example', pendingUrl: 'https://pending.example' },
  ]);
  let dispatched = false;
  const lifecycle = new TabLifecycle(() => ({
    async wait() {
      throw new Error('wait should not run');
    },
    dispose() {
      return;
    },
  }));

  try {
    await assert.rejects(
      () =>
        lifecycle.runCommand({
          command: 'click',
          commandId: 'EF56',
          sessionId: 'session-3',
          tabId: 43,
          requireStableBeforeDispatch: true,
          async dispatch() {
            dispatched = true;
            return { ok: true };
          },
          async readback() {
            return { tree: {} };
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof CommandWorkflowError);
        assert.equal(error.phase, 'precondition');
        return true;
      },
    );
    assert.equal(dispatched, false);
  } finally {
    browserMock.restore();
  }
});

test('load waiter resolves on matching main-frame completion and cleans up listeners', async () => {
  const browserMock = installBrowserMock([{ status: 'loading', url: 'https://before.example' }]);

  try {
    const waiter = createLoadWaiter({ command: 'click', commandId: 'GH78', sessionId: 'session-4', tabId: 51 }, 50);
    const pending = waiter.wait();

    assert.equal(browserMock.completed.listenerCount(), 1);
    assert.equal(browserMock.errored.listenerCount(), 1);
    assert.equal(browserMock.removed.listenerCount(), 1);

    browserMock.completed.emit({ tabId: 999, frameId: 0, url: 'https://ignore.example' });
    browserMock.completed.emit({ tabId: 51, frameId: 1, url: 'https://ignore-subframe.example' });
    browserMock.completed.emit({ tabId: 51, frameId: 0, url: 'https://done.example' });

    await pending;
    assert.equal(browserMock.completed.listenerCount(), 0);
    assert.equal(browserMock.errored.listenerCount(), 0);
    assert.equal(browserMock.removed.listenerCount(), 0);
  } finally {
    browserMock.restore();
  }
});

test('load waiter rejects on navigation error and cleans up listeners', async () => {
  const browserMock = installBrowserMock([{ status: 'loading', url: 'https://before.example' }]);

  try {
    const waiter = createLoadWaiter({ command: 'click', commandId: 'JK90', sessionId: 'session-5', tabId: 52 }, 50);
    const pending = waiter.wait();
    browserMock.errored.emit({ tabId: 52, frameId: 0, error: 'NS_BINDING_ABORTED' });

    await assert.rejects(
      () => pending,
      (error: unknown) => {
        assert.equal((error as { errorCode?: string }).errorCode, ErrorCodes.COMMAND_FAILED);
        return true;
      },
    );
    assert.equal(browserMock.completed.listenerCount(), 0);
    assert.equal(browserMock.errored.listenerCount(), 0);
    assert.equal(browserMock.removed.listenerCount(), 0);
  } finally {
    browserMock.restore();
  }
});

test('load waiter rejects on timeout and cleans up listeners', async () => {
  const browserMock = installBrowserMock([{ status: 'loading', url: 'https://before.example' }]);

  try {
    const waiter = createLoadWaiter({ command: 'click', commandId: 'LM12', sessionId: 'session-6', tabId: 53 }, 5);
    await assert.rejects(
      () => waiter.wait(),
      (error: unknown) => {
        assert.equal((error as { errorCode?: string }).errorCode, ErrorCodes.COMMAND_FAILED);
        return true;
      },
    );
    assert.equal(browserMock.completed.listenerCount(), 0);
    assert.equal(browserMock.errored.listenerCount(), 0);
    assert.equal(browserMock.removed.listenerCount(), 0);
  } finally {
    browserMock.restore();
  }
});

test('extension manifest requests webNavigation permission', () => {
  const manifestSource = readFileSync(
    path.resolve(import.meta.dirname, '../../wxt.config.ts'),
    'utf8',
  );

  assert.match(manifestSource, /'webNavigation'/);
});
