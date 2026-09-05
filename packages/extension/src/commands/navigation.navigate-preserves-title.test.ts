import { strict as assert } from 'node:assert';
import test from 'node:test';

import { NavigationCommands } from './navigation';
import type { SessionManager } from '@/session/session-manager';
import type { NetworkCapture } from '@/session/network-capture';
import { CodedError, ErrorCodes } from '../utils/errors';
import type { PageStateReader } from './page-state-reader';
import type { TabLifecycle } from './tab-lifecycle';

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

    const pageStateReader = {
      async read(tabId: number) {
        assert.equal(tabId, targetTabId);
        return { url: navigateUrl, title: 'After', tree: { ok: true } };
      },
    } as unknown as PageStateReader;
    const lifecycle = {
      async runCommand({ dispatch, readback }: { dispatch: () => Promise<unknown>; readback: () => Promise<unknown> }) {
        const actionResult = await dispatch();
        const readbackResult = await readback();
        return {
          actionResult,
          readbackResult,
          workflow: { waitRequired: true, postActionLoading: true },
        };
      },
    } as unknown as TabLifecycle;

    const commands = new NavigationCommands(
      sessionManager as SessionManager,
      networkCapture as NetworkCapture,
      pageStateReader,
      lifecycle,
    );

    const result = await commands.navigate({ sessionId: 'session-1', url: navigateUrl });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      url: navigateUrl,
      tabId: targetTabId,
      pageState: { url: navigateUrl, title: 'After', tree: { ok: true } },
    });
    assert.equal(captureStarted, true);
  } finally {
    (globalThis as any).browser = originalBrowser;
  }
});

test('navigate propagates snapshot readback failures', async () => {
  const originalBrowser = (globalThis as any).browser;

  try {
    const targetTabId = 102;
    const navigateUrl = 'https://fallback.example';

    (globalThis as any).browser = {
      tabs: {
        update: async (tabId: number, updateInfo: { url?: string }) => {
          assert.equal(tabId, targetTabId);
          assert.equal(updateInfo.url, navigateUrl);
          return { id: tabId };
        },
        get: async (tabId: number) => {
          assert.equal(tabId, targetTabId);
          return { id: tabId, url: navigateUrl, title: 'Fallback title' };
        },
      },
    };

    const sessionManager = {
      resolveTargetTab: async () => targetTabId,
    } as Pick<SessionManager, 'resolveTargetTab'>;

    const networkCapture = {
      getCapturingTabId: () => targetTabId,
      startCapture: () => {
        throw new Error('capture should already be active');
      },
    } as Pick<NetworkCapture, 'getCapturingTabId' | 'startCapture'>;

    const pageStateReader = {
      async read(tabId: number) {
        assert.equal(tabId, targetTabId);
        throw new CodedError('Content script unavailable.', ErrorCodes.COMMAND_FAILED);
      },
    } as unknown as PageStateReader;

    const lifecycle = {
      async runCommand({ dispatch, readback }: { dispatch: () => Promise<unknown>; readback: () => Promise<unknown> }) {
        const actionResult = await dispatch();
        const readbackResult = await readback();
        return {
          actionResult,
          readbackResult,
          workflow: { waitRequired: false, postActionLoading: false },
        };
      },
    } as unknown as TabLifecycle;

    const commands = new NavigationCommands(
      sessionManager as SessionManager,
      networkCapture as NetworkCapture,
      pageStateReader,
      lifecycle,
    );

    await assert.rejects(
      () => commands.navigate({ sessionId: 'session-2', url: navigateUrl }),
      (error: unknown) => {
        assert.equal((error as { errorCode?: string }).errorCode, ErrorCodes.COMMAND_FAILED);
        assert.equal((error as Error).message, 'Content script unavailable.');
        return true;
      },
    );
  } finally {
    (globalThis as any).browser = originalBrowser;
  }
});
