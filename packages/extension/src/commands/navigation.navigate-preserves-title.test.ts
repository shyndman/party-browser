import { strict as assert } from 'node:assert';
import test from 'node:test';

import { NavigationCommands } from './navigation';
import type { SessionManager } from '@/session/session-manager';
import type { NetworkCapture } from '@/session/network-capture';

test('navigate command does not mutate document title', async () => {
  const originalBrowser = (globalThis as any).browser;

  try {
    const targetTabId = 101;
    const navigateUrl = 'https://example.com';
    let captureStarted = false;

    (globalThis as any).browser = {
      tabs: {
        update: async (tabId: number, updateInfo: { url?: string }) => {
          assert.equal(tabId, targetTabId);
          assert.equal(updateInfo.url, navigateUrl);
          return { id: tabId };
        },
        executeScript: async () => {
          throw new Error('navigate must not execute script');
        },
        onUpdated: {
          addListener: () => {},
          removeListener: () => {},
        },
      },
    };

    const sessionManager = {
      resolveTargetTab: async () => targetTabId,
    } as Pick<SessionManager, 'resolveTargetTab'>;

    const networkCapture = {
      getCapturingTabId: () => null,
      startCapture: (tabId: number) => {
        assert.equal(tabId, targetTabId);
        captureStarted = true;
      },
    } as Pick<NetworkCapture, 'getCapturingTabId' | 'startCapture'>;

    const commands = new NavigationCommands(
      sessionManager as SessionManager,
      networkCapture as NetworkCapture,
    );
    (commands as any).waitForTabLoad = async () => undefined;

    const result = await commands.navigate({ sessionId: 'session-1', url: navigateUrl });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, { url: navigateUrl, tabId: targetTabId });
    assert.equal(captureStarted, true);
  } finally {
    (globalThis as any).browser = originalBrowser;
  }
});
