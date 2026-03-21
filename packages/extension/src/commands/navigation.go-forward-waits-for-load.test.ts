import { strict as assert } from 'node:assert';
import test from 'node:test';

import { NavigationCommands } from './navigation';
import type { GoForwardParams } from '../types/commands';
import type { SessionManager } from '../session/session-manager';
import type { NetworkCapture } from '../session/network-capture';

type EventListener = (...args: unknown[]) => void;

type EventEmitter = {
  addListener: (listener: EventListener) => void;
  removeListener: (listener: EventListener) => void;
  emit: (...args: unknown[]) => void;
};

function createEventEmitter(): EventEmitter {
  const listeners = new Set<EventListener>();
  return {
    addListener(listener: EventListener) {
      listeners.add(listener);
    },
    removeListener(listener: EventListener) {
      listeners.delete(listener);
    },
    emit(...args: unknown[]) {
      for (const listener of Array.from(listeners)) {
        listener(...args);
      }
    },
  };
}

test('goForward waits for tab load before resolving', async () => {
  const originalBrowser = (globalThis as any).browser;
  const nativeSetTimeout = globalThis.setTimeout;
  const tabId = 101;
  const tabOnUpdated = createEventEmitter();
  let goForwardCallCount = 0;

  try {
    (globalThis as any).browser = {
      tabs: {
        onUpdated: tabOnUpdated,
        async goForward(targetTabId: number) {
          assert.equal(targetTabId, tabId);
          goForwardCallCount += 1;
        },
      },
    };
    (globalThis as any).setTimeout = ((callback: (...args: unknown[]) => void) => nativeSetTimeout(callback, 0)) as typeof setTimeout;

    const sessionManager = {
      resolveTargetTab: async () => tabId,
    } as unknown as SessionManager;
    const navigation = new NavigationCommands(sessionManager, {} as NetworkCapture);

    const goForwardPromise = navigation.goForward({ sessionId: 'session-forward' } as GoForwardParams);
    let resolved = false;
    goForwardPromise.then(() => {
      resolved = true;
    });

    await new Promise((resolve) => nativeSetTimeout(resolve, 0));
    assert.equal(resolved, false, 'goForward should not resolve before load completes');
    assert.equal(goForwardCallCount, 1, 'goForward tab API should be invoked exactly once');

    tabOnUpdated.emit(tabId, { status: 'complete' });
    await goForwardPromise;
    await new Promise((resolve) => nativeSetTimeout(resolve, 0));
    assert.equal(resolved, true, 'goForward should resolve after load completes');
  } finally {
    (globalThis as any).setTimeout = nativeSetTimeout;
    (globalThis as any).browser = originalBrowser;
  }
});
