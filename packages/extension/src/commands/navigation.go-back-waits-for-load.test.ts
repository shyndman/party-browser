import { strict as assert } from 'node:assert';
import test from 'node:test';

import { NavigationCommands } from './navigation';
import type { NetworkCapture } from '../session/network-capture';
import type { SessionManager } from '../session/session-manager';
import type { GoBackParams } from '../types/commands';
import type { PageStateReader } from './page-state-reader';
import type { TabLifecycle } from './tab-lifecycle';

test('goBack routes through the shared lifecycle and waits before readback', async () => {
  const events: string[] = [];
  const targetTabId = 42;

  const originalBrowser = (globalThis as any).browser;
  try {
    (globalThis as any).browser = {
      tabs: {
        async goBack(tabId: number) {
          assert.equal(tabId, targetTabId);
          events.push('dispatch');
        },
      },
    };

    const sessionManagerStub = {
      resolveTargetTab: async () => targetTabId,
    } as unknown as SessionManager;

    const pageStateReader = {
      async read(tabId: number) {
        assert.equal(tabId, targetTabId);
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

    const navigation = new NavigationCommands(
      sessionManagerStub,
      {} as NetworkCapture,
      pageStateReader,
      lifecycle,
    );

    const result = await navigation.goBack({ sessionId: 'session-1' } satisfies GoBackParams);

    assert.equal(result.success, true);
    assert.deepEqual(events, ['wait', 'dispatch', 'readback']);
    assert.equal(result.meta?.workflow?.waitRequired, true);
  } finally {
    (globalThis as any).browser = originalBrowser;
  }
});
