import { strict as assert } from 'node:assert';
import test from 'node:test';

import { NavigationCommands } from './navigation';
import type { NetworkCapture } from '../session/network-capture';
import type { SessionManager } from '../session/session-manager';
import type { GoBackParams } from '../types/commands';

type TabUpdateListener = (tabId: number, changeInfo: { status?: string }) => void;

function createTabUpdateEmitter() {
  const listeners = new Set<TabUpdateListener>();

  return {
    addListener(listener: TabUpdateListener) {
      listeners.add(listener);
    },
    removeListener(listener: TabUpdateListener) {
      listeners.delete(listener);
    },
    emit(tabId: number, changeInfo: { status?: string }) {
      for (const listener of listeners) {
        listener(tabId, changeInfo);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

test('goBack waits for the target tab to finish loading before resolving', async () => {
  const originalBrowser = (globalThis as any).browser;
  const targetTabId = 42;
  const tabOnUpdated = createTabUpdateEmitter();
  let goBackCalled = false;

  try {
    (globalThis as any).browser = {
      tabs: {
        goBack: async (tabId: number) => {
          assert.equal(tabId, targetTabId);
          goBackCalled = true;
        },
        executeScript: async () => ['loading'],
        onUpdated: tabOnUpdated,
      },
    };

    const sessionManagerStub = {
      resolveTargetTab: async () => targetTabId,
    } as unknown as SessionManager;

    const networkCaptureStub = {} as NetworkCapture;
    const navigation = new NavigationCommands(sessionManagerStub, networkCaptureStub);

    let resolved = false;
    const goBackPromise = navigation.goBack({ sessionId: 'session-1' } satisfies GoBackParams).then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(tabOnUpdated.listenerCount(), 1, 'should register a load listener while the page is still loading');
    assert.equal(resolved, false, 'should not resolve goBack before load completes');

    tabOnUpdated.emit(targetTabId, { status: 'complete' });

    await goBackPromise;
    assert.equal(resolved, true);
    assert.equal(goBackCalled, true);
  } finally {
    (globalThis as any).browser = originalBrowser;
  }
});

test('goBack returns immediately when the current document is already fully loaded', async () => {
  const originalBrowser = (globalThis as any).browser;
  const targetTabId = 42;
  const tabOnUpdated = createTabUpdateEmitter();
  let goBackCalled = false;

  try {
    (globalThis as any).browser = {
      tabs: {
        goBack: async (tabId: number) => {
          assert.equal(tabId, targetTabId);
          goBackCalled = true;
        },
        executeScript: async (tabId: number, details: { code?: string }) => {
          assert.equal(tabId, targetTabId);
          assert.equal(details.code, 'document.readyState');
          return ['complete'];
        },
        onUpdated: tabOnUpdated,
      },
    };

    const sessionManagerStub = {
      resolveTargetTab: async () => targetTabId,
    } as unknown as SessionManager;

    const navigation = new NavigationCommands(sessionManagerStub, {} as NetworkCapture);
    await navigation.goBack({ sessionId: 'session-ready' } satisfies GoBackParams);

    assert.equal(goBackCalled, true);
    assert.equal(tabOnUpdated.listenerCount(), 0, 'should not register a load listener when readyState is complete');
  } finally {
    (globalThis as any).browser = originalBrowser;
  }
});
