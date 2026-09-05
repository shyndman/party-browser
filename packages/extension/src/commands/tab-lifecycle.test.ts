import { strict as assert } from 'node:assert';
import test, { mock } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';

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
  const beforeNavigate = createEmitter<[details: { tabId: number; frameId: number; url?: string; documentId?: string }]>();
  const committed = createEmitter<[details: { tabId: number; frameId: number; url?: string; documentId?: string }]>();
  const domContentLoaded = createEmitter<[details: { tabId: number; frameId: number; url?: string; documentId?: string }]>();
  const completed = createEmitter<[details: { tabId: number; frameId: number; url?: string; documentId?: string }]>();
  const errored = createEmitter<[details: { tabId: number; frameId: number; url?: string; error?: string; documentId?: string }]>();
  const fragment = createEmitter<[details: { tabId: number; frameId: number; url?: string; documentId?: string }]>();
  const history = createEmitter<[details: { tabId: number; frameId: number; url?: string; documentId?: string }]>();
  const removed = createEmitter<[tabId: number]>();
  const requestStarted = createEmitter<[details: { tabId: number; requestId: string; type: string; url: string }]>();
  const requestCompleted = createEmitter<[details: { tabId: number; requestId: string; url: string }]>();
  const requestErrored = createEmitter<[details: { tabId: number; requestId: string; url: string; error: string }]>();
  const responseStarted = createEmitter<[details: { tabId: number; requestId: string; url: string }]>();
  let getCallIndex = 0;

  (globalThis as any).browser = {
    tabs: {
      onRemoved: removed,
      async get(tabId: number) {
        const state = tabStates[Math.min(getCallIndex, tabStates.length - 1)] ?? tabStates.at(-1) ?? {};
        getCallIndex += 1;
        return { id: tabId, title: state.url ?? 'title', ...state };
      },
    },
    webNavigation: {
      onBeforeNavigate: beforeNavigate,
      onCommitted: committed,
      onDOMContentLoaded: domContentLoaded,
      onCompleted: completed,
      onErrorOccurred: errored,
      onReferenceFragmentUpdated: fragment,
      onHistoryStateUpdated: history,
      async getFrame() {
        return { documentId: 'old-document' };
      },
    },
    webRequest: {
      onBeforeRequest: requestStarted,
      onCompleted: requestCompleted,
      onErrorOccurred: requestErrored,
      onResponseStarted: responseStarted,
    },
  };

  return {
    beforeNavigate, committed, domContentLoaded, completed, errored, fragment, history,
    removed, requestStarted, requestCompleted, requestErrored, responseStarted,
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
  const lifecycle = new TabLifecycle();


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
  } finally {
    browserMock.restore();
  }
});
test('click waits for matching request completion and ignores unrelated tabs', async () => {
  const browserMock = installBrowserMock([{ status: 'complete' }]);
  mock.timers.enable();
  try {
    const lifecycle = new TabLifecycle();
    let dispatchDone!: () => void;
    const dispatched = new Promise<void>((resolve) => { dispatchDone = resolve; });
    const pending = lifecycle.runCommand({
      command: 'click', sessionId: 'request-test', tabId: 71,
      requireStableBeforeDispatch: true,
      async dispatch() {
        browserMock.requestStarted.emit({ tabId: 71, requestId: 'req-1', type: 'xmlhttprequest', url: 'https://ok.example' });
        browserMock.requestStarted.emit({ tabId: 72, requestId: 'other', type: 'script', url: 'https://ignore.example' });
        dispatchDone();
        return { ok: true };
      },
      async readback() { return { tree: { ok: true } }; },
    });
    await dispatched;
    await Promise.resolve();
    mock.timers.tick(500);
    await Promise.resolve();
    browserMock.requestCompleted.emit({ tabId: 71, requestId: 'req-1', url: 'https://ok.example' });
    await Promise.resolve();
    mock.timers.tick(500);
    const result = await pending;
    assert.equal(result.workflow.waitRequired, true);
    assert.equal(result.workflow.postActionLoading, false);
  } finally {
    mock.timers.reset();
    browserMock.restore();
  }
});

test('tab lifecycle waits when the tab enters loading after dispatch', async () => {
  const browserMock = installBrowserMock([
    { status: 'complete', url: 'https://before.example' },
    { status: 'loading', url: 'https://before.example', pendingUrl: 'https://after.example' },
  ]);
  const lifecycle = new TabLifecycle();

  try {
    const result = await lifecycle.runCommand({
      command: 'click',
      commandId: 'CD34',
      sessionId: 'session-2',
      tabId: 42,
      requireStableBeforeDispatch: true,
      async dispatch() {
        browserMock.beforeNavigate.emit({ tabId: 42, frameId: 0, url: 'https://after.example' });
        browserMock.completed.emit({ tabId: 42, frameId: 0, url: 'https://after.example' });
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
  } finally {
    browserMock.restore();
  }
});

test('tab lifecycle waits when post-action loading starts during the watch window', async () => {
  const browserMock = installBrowserMock([
    { status: 'complete', url: 'https://before.example' },
    { status: 'complete', url: 'https://before.example' },
    { status: 'loading', url: 'https://before.example', pendingUrl: 'https://after.example' },
  ]);
  const lifecycle = new TabLifecycle();

  try {
    const result = await lifecycle.runCommand({
      command: 'click',
      commandId: 'CD56',
      sessionId: 'session-2b',
      tabId: 44,
      requireStableBeforeDispatch: true,
      async dispatch() {
        queueMicrotask(() => {
          browserMock.beforeNavigate.emit({ tabId: 44, frameId: 0, url: 'https://after.example' });
          browserMock.completed.emit({ tabId: 44, frameId: 0, url: 'https://after.example' });
        });
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

test('navigation lifecycle ignores load events from pre-existing loads before dispatch completes', async () => {
  const browserMock = installBrowserMock([
    { status: 'loading', url: 'https://before.example', pendingUrl: 'https://old.example' },
    { status: 'loading', url: 'https://before.example', pendingUrl: 'https://after.example' },
  ]);
  const lifecycle = new TabLifecycle((context) => createLoadWaiter(context, 50));
  let readbackRan = false;

  try {
    const result = await lifecycle.runCommand({
      command: 'navigate',
      commandId: 'NO34',
      sessionId: 'session-7',
      tabId: 54,
      requireStableBeforeDispatch: false,
      async dispatch() {
        browserMock.beforeNavigate.emit({ tabId: 54, frameId: 0, url: 'https://after.example' });
        browserMock.beforeNavigate.emit({ tabId: 54, frameId: 0, url: 'https://after.example' });
        browserMock.errored.emit({
          tabId: 54,
          frameId: 0,
          url: 'https://after.example',
          error: 'NS_BINDING_ABORTED',
          documentId: 'old-document',
        });
        browserMock.committed.emit({ tabId: 54, frameId: 0, url: 'https://after.example', documentId: 'new-document' });
        browserMock.domContentLoaded.emit({ tabId: 54, frameId: 0, url: 'https://after.example', documentId: 'new-document' });
        queueMicrotask(() => {
          browserMock.completed.emit({ tabId: 54, frameId: 0, url: 'https://after.example', documentId: 'new-document' });
        });
        return { ok: true };
      },
      async readback() {
        readbackRan = true;
        return { tree: { ok: true } };
      },
    });

    assert.equal(readbackRan, true);
    assert.deepEqual(result.workflow, {
      waitRequired: true,
      postActionLoading: true,
    });
  } finally {
    browserMock.restore();
  }
});

test('navigation waits for DOMContentLoaded then tolerates a five-second load timeout', async () => {
  const browserMock = installBrowserMock([{ status: 'complete' }]);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const lifecycle = new TabLifecycle();
    let dispatched!: () => void;
    const dispatchReady = new Promise<void>((resolve) => { dispatched = resolve; });
    let readbackCalls = 0;
    const pending = lifecycle.runCommand({
      command: 'navigate', tabId: 61, sessionId: 'dcl-timeout', requireStableBeforeDispatch: false,
      async dispatch() {
        browserMock.beforeNavigate.emit({ tabId: 61, frameId: 0, url: 'https://target.example' });
        browserMock.committed.emit({ tabId: 61, frameId: 0, url: 'https://target.example', documentId: 'new-document' });
        dispatched();
        return {};
      },
      async readback() { readbackCalls++; return { tree: { loaded: true } }; },
    });
    await dispatchReady;
    await setImmediate();
    mock.timers.tick(5_000);
    await setImmediate();
    assert.equal(readbackCalls, 0);
    browserMock.domContentLoaded.emit({ tabId: 61, frameId: 0, url: 'https://target.example', documentId: 'new-document' });
    await setImmediate();
    mock.timers.tick(4_999);
    await setImmediate();
    assert.equal(readbackCalls, 0);
    mock.timers.tick(1);
    const result = await pending;
    assert.equal(readbackCalls, 1);
    assert.equal(result.workflow.waitRequired, true);
  } finally {
    mock.timers.reset();
    browserMock.restore();
  }
});

test('current-document navigation errors reject before readback', async () => {
  const browserMock = installBrowserMock([{ status: 'complete' }]);
  try {
    const lifecycle = new TabLifecycle();
    await assert.rejects(
      () => lifecycle.runCommand({
        command: 'navigate', tabId: 62, sessionId: 'navigation-error', requireStableBeforeDispatch: false,
        async dispatch() {
          browserMock.beforeNavigate.emit({ tabId: 62, frameId: 0, url: 'https://target.example' });
          browserMock.committed.emit({ tabId: 62, frameId: 0, url: 'https://target.example', documentId: 'new-document' });
          browserMock.errored.emit({ tabId: 62, frameId: 0, url: 'https://target.example', error: 'CONNECTION_FAILED', documentId: 'new-document' });
          return {};
        },
        async readback() { return { tree: {} }; },
      }),
      (error: unknown) => (error as { phase?: string }).phase === 'wait',
    );
  } finally {
    browserMock.restore();
  }
});

test('click tolerates pending request timeout then applies trailing settle window', async () => {
  const browserMock = installBrowserMock([{ status: 'complete' }]);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const lifecycle = new TabLifecycle();
    let dispatched!: () => void;
    const dispatchReady = new Promise<void>((resolve) => { dispatched = resolve; });
    const pending = lifecycle.runCommand({
      command: 'click', tabId: 63, sessionId: 'request-timeout', requireStableBeforeDispatch: false,
      async dispatch() {
        browserMock.requestStarted.emit({ tabId: 63, requestId: 'pending', type: 'xmlhttprequest', url: 'https://slow.example' });
        dispatched();
        return {};
      },
      async readback() { return { tree: {} }; },
    });
    await dispatchReady;
    await setImmediate();
    mock.timers.tick(500);
    await setImmediate();
    mock.timers.tick(5_000);
    await setImmediate();
    mock.timers.tick(500);
    const result = await pending;
    assert.equal(result.workflow.waitRequired, true);
    assert.equal(result.workflow.postActionLoading, false);
  } finally {
    mock.timers.reset();
    browserMock.restore();
  }
});

test('failed request removes its request id and allows click completion', async () => {
  const browserMock = installBrowserMock([{ status: 'complete' }]);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const lifecycle = new TabLifecycle();
    let dispatched!: () => void;
    const dispatchReady = new Promise<void>((resolve) => { dispatched = resolve; });
    const pending = lifecycle.runCommand({
      command: 'click', tabId: 64, sessionId: 'request-error', requireStableBeforeDispatch: false,
      async dispatch() {
        browserMock.requestStarted.emit({ tabId: 64, requestId: 'failed', type: 'xmlhttprequest', url: 'https://failed.example' });
        dispatched();
        return {};
      },
      async readback() { return { tree: {} }; },
    });
    await dispatchReady;
    await setImmediate();
    mock.timers.tick(500);
    await setImmediate();
    browserMock.requestErrored.emit({ tabId: 64, requestId: 'failed', url: 'https://failed.example', error: 'NS_ERROR' });
    await setImmediate();
    mock.timers.tick(500);
    const result = await pending;
    assert.equal(result.workflow.waitRequired, true);
  } finally {
    mock.timers.reset();
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
