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

    await Promise.resolve();
    assert.equal(resolved, false, 'should not resolve goBack before load completes');

    tabOnUpdated.emit(targetTabId, { status: 'complete' });

    await goBackPromise;
    assert.equal(resolved, true);
    assert.equal(goBackCalled, true);
  } finally {
    (globalThis as any).browser = originalBrowser;
  }
});
