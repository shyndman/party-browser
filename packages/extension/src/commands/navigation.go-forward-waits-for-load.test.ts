import { strict as assert } from 'node:assert';
import test from 'node:test';

import { NavigationCommands } from './navigation';
import type { GoForwardParams } from '../types/commands';
import type { SessionManager } from '../session/session-manager';
import type { NetworkCapture } from '../session/network-capture';
import type { PageStateReader } from './page-state-reader';
import type { TabLifecycle } from './tab-lifecycle';

test('goForward routes through the shared lifecycle and waits before readback', async () => {
  const events: string[] = [];
  const tabId = 101;
  const originalBrowser = (globalThis as any).browser;

  try {
    (globalThis as any).browser = {
      tabs: {
        async goForward(targetTabId: number) {
          assert.equal(targetTabId, tabId);
          events.push('dispatch');
        },
      },
    };

    const sessionManager = {
      resolveTargetTab: async () => tabId,
    } as unknown as SessionManager;
    const pageStateReader = {
      async read(targetTabId: number) {
        assert.equal(targetTabId, tabId);
        events.push('readback');
        return { url: 'https://after.example', title: 'After', tree: { ok: true } };
      },
    } as unknown as PageStateReader;
    const lifecycle = {
      async runCommand({ dispatch, readback }: { dispatch: () => Promise<unknown>; readback: () => Promise<unknown> }) {
        events.push('wait');
        const actionResult = await dispatch();
        const readbackResult = await readback();
        return {
          actionResult,
          readbackResult,
          workflow: { waitRequired: true, postActionLoading: true },
        };
      },
    } as unknown as TabLifecycle;
    const navigation = new NavigationCommands(sessionManager, {} as NetworkCapture, pageStateReader, lifecycle);

    const result = await navigation.goForward({ sessionId: 'session-forward' } as GoForwardParams);

    assert.equal(result.success, true);
    assert.equal(result.meta?.workflow?.waitRequired, true);
    assert.deepEqual(events, ['wait', 'dispatch', 'readback']);
  } finally {
    (globalThis as any).browser = originalBrowser;
  }
});
