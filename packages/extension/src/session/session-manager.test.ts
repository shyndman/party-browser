import { strict as assert } from 'node:assert';
import test from 'node:test';

import { SessionManager } from './session-manager';
import { ErrorCodes, CodedError } from '@/utils/errors';

type Listener = (...args: any[]) => void;

function createEventEmitter() {
  const listeners = new Set<Listener>();
  return {
    addListener(listener: Listener) {
      listeners.add(listener);
    },
    removeListener(listener: Listener) {
      listeners.delete(listener);
    },
    emit(...args: any[]) {
      for (const listener of listeners) {
        listener(...args);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

type BrowserMockState = {
  navigationOnCompleted: ReturnType<typeof createEventEmitter>;
  navigationOnErrorOccurred: ReturnType<typeof createEventEmitter>;
  tabOnRemoved: ReturnType<typeof createEventEmitter>;
  windowOnRemoved: ReturnType<typeof createEventEmitter>;
  createdWindowArgs: Array<{
    url: string;
    type?: string;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  }>;
  createdLeaseWindows: Array<{
    id: number;
    tabs: Array<{ id: number; url?: string; windowId: number }>;
  }>;
  removedWindowIds: number[];
  failWindowRemove: boolean;
  createWindowWithoutTab: boolean;
};

function installBrowserMock(): BrowserMockState {
  const navigationOnCompleted = createEventEmitter();
  const navigationOnErrorOccurred = createEventEmitter();
  const tabOnRemoved = createEventEmitter();
  const windowOnRemoved = createEventEmitter();

  let nextTabId = 100;
  let nextWindowId = 500;

  const existingTabs = new Map<number, { id: number; url?: string; windowId: number }>();
  const existingWindows = new Map<number, { id: number; tabIds: number[] }>();

  const createdWindowArgs: BrowserMockState['createdWindowArgs'] = [];
  const createdLeaseWindows: BrowserMockState['createdLeaseWindows'] = [];
  const browserState: BrowserMockState = {
    navigationOnCompleted,
    navigationOnErrorOccurred,
    tabOnRemoved,
    windowOnRemoved,
    createdWindowArgs,
    createdLeaseWindows,
    removedWindowIds: [],
    failWindowRemove: false,
    createWindowWithoutTab: false,
  };

  (globalThis as any).browser = {
    tabs: {
      onRemoved: tabOnRemoved,
      async create({ url }: { url: string }) {
        nextTabId += 1;
        const tab = { id: nextTabId, url, windowId: nextWindowId + 1 };
        existingTabs.set(tab.id, tab);
        return tab;
      },
      async executeScript() {
        return [];
      },
      async get(tabId: number) {
        const tab = existingTabs.get(tabId);
        if (!tab) {
          throw new Error('tab not found');
        }
        return tab;
      },
      async remove(tabId: number) {
        const tab = existingTabs.get(tabId);
        existingTabs.delete(tabId);
        if (!tab) {
          return;
        }

        const win = existingWindows.get(tab.windowId);
        if (!win) {
          return;
        }

        win.tabIds = win.tabIds.filter((id) => id !== tabId);
      },
      async query(query: { windowId?: number }) {
        if (typeof query.windowId !== 'number') {
          return Array.from(existingTabs.values());
        }

        return Array.from(existingTabs.values()).filter((tab) => tab.windowId === query.windowId);
      },
    },
    webNavigation: {
      onCompleted: navigationOnCompleted,
      onErrorOccurred: navigationOnErrorOccurred,
    },
    windows: {
      onRemoved: windowOnRemoved,
      async getLastFocused() {
        return { id: 1, type: 'normal', left: 0, top: 0, width: 1920, height: 1080 };
      },
      async getAll() {
        return [{ id: 1, type: 'normal', left: 0, top: 0, width: 1920, height: 1080 }];
      },
      async create(options: {
        url: string;
        type?: string;
        left?: number;
        top?: number;
        width?: number;
        height?: number;
      }) {
        createdWindowArgs.push({ ...options });

        nextWindowId += 1;
        nextTabId += 1;

        const tab = { id: nextTabId, url: options.url, windowId: nextWindowId };
        if (browserState.createWindowWithoutTab) {
          existingWindows.set(nextWindowId, { id: nextWindowId, tabIds: [] });
        } else {
          existingTabs.set(tab.id, tab);
          existingWindows.set(nextWindowId, { id: nextWindowId, tabIds: [tab.id] });
        }

        const createdWindow = {
          id: nextWindowId,
          tabs: browserState.createWindowWithoutTab
            ? []
            : [{ id: tab.id, url: tab.url, windowId: tab.windowId }],
        };

        createdLeaseWindows.push(createdWindow);
        return createdWindow;
      },
      async remove(windowId: number) {
        browserState.removedWindowIds.push(windowId);
        if (browserState.failWindowRemove) {
          throw new Error('window remove failed');
        }

        const window = existingWindows.get(windowId);
        if (!window) {
          return;
        }

        for (const tabId of window.tabIds) {
          existingTabs.delete(tabId);
        }
        existingWindows.delete(windowId);
      },
    },
  };

  return browserState;
}

test('window-backed lease lifecycle create/get/revoke/revokeAll', async () => {
  installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  const leaseOne = await manager.createLease('session-1', 'https://example.com');
  assert.equal(typeof leaseOne.windowId, 'number');
  assert.equal(typeof leaseOne.tabId, 'number');
  assert.deepEqual(manager.getLease('session-1'), leaseOne);

  const leaseTwo = await manager.createLease('session-2', 'https://partybrowser.io');
  assert.deepEqual(manager.getLease('session-2'), leaseTwo);
  assert.equal(manager.getLeaseCount(), 2);

  const revokedOne = await manager.revokeLease('session-1', 'test', true);
  assert.equal(revokedOne, true);
  assert.equal(manager.getLease('session-1'), null);

  await manager.revokeAllLeases('test-all', true);
  assert.equal(manager.getLeaseCount(), 0);
});

test('lease creation applies deterministic geometry and stores snapshot shape', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  const lease = await manager.createLease('session-geometry', 'https://geometry.example');

  assert.deepEqual(browserState.createdWindowArgs[0], {
    url: 'https://geometry.example',
    type: 'normal',
    left: 200,
    top: 400,
    width: 1520,
    height: 480,
  });

  const createdWindow = browserState.createdLeaseWindows[0];
  assert.deepEqual(lease, {
    windowId: createdWindow.id,
    tabId: createdWindow.tabs[0].id,
  });

  assert.deepEqual(manager.getLeaseSnapshot(), {
    'session-geometry': {
      windowId: createdWindow.id,
      tabId: createdWindow.tabs[0].id,
    },
  });
});

test('lease creation returns immediately when the initial tab is already fully loaded', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();

  let settleCalls = 0;
  (manager as any).tabLifecycle.waitForTabToSettle = async () => {
    settleCalls += 1;
  };

  const lease = await manager.createLease('session-ready', 'https://ready.example');

  assert.equal(typeof lease.windowId, 'number');
  assert.equal(typeof lease.tabId, 'number');
  assert.equal(settleCalls, 1);
  assert.equal(browserState.navigationOnCompleted.listenerCount(), 0);
  assert.equal(browserState.navigationOnErrorOccurred.listenerCount(), 0);
});

test('lease setup removes the created window when the lease tab cannot be resolved', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  browserState.createWindowWithoutTab = true;

  await assert.rejects(
    () => manager.createLease('session-missing-tab', 'https://missing-tab.example'),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, ErrorCodes.COMMAND_FAILED);
      assert.match(error.message, /Could not resolve lease tab/);
      return true;
    },
  );

  const createdWindow = browserState.createdLeaseWindows[0];
  assert.deepEqual(browserState.removedWindowIds, [createdWindow.id]);
  assert.equal(manager.getLease('session-missing-tab'), null);
  assert.equal(manager.getLeaseCount(), 0);
});

test('failed lease setup removes the created window and records no lease', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  const setupError = new Error('initial load failed');
  (manager as any).tabLifecycle.waitForTabToSettle = async () => {
    throw setupError;
  };

  let rejectedError: unknown;
  try {
    await manager.createLease('session-failed-setup', 'https://fail.example');
  } catch (error) {
    rejectedError = error;
  }

  const createdWindow = browserState.createdLeaseWindows[0];
  assert.equal(rejectedError, setupError);
  assert.deepEqual(browserState.removedWindowIds, [createdWindow.id]);
  assert.equal(manager.getLease('session-failed-setup'), null);
  assert.equal(manager.getLeaseCount(), 0);
});

test('failed lease setup keeps original error when created window cleanup fails', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  const setupError = new Error('initial load failed');
  const warn = console.warn;
  const warnings: unknown[][] = [];
  browserState.failWindowRemove = true;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  (manager as any).tabLifecycle.waitForTabToSettle = async () => {
    throw setupError;
  };

  let rejectedError: unknown;
  try {
    await manager.createLease('session-cleanup-fails', 'https://cleanup-fails.example');
  } catch (error) {
    rejectedError = error;
  } finally {
    console.warn = warn;
  }

  const createdWindow = browserState.createdLeaseWindows[0];
  assert.equal(rejectedError, setupError);
  assert.deepEqual(browserState.removedWindowIds, [createdWindow.id]);
  assert.equal(manager.getLease('session-cleanup-fails'), null);
  assert.equal(manager.getLeaseCount(), 0);
  assert.equal(warnings.length, 1);
});

test('window close revokes lease and blocks future routing', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  const lease = await manager.createLease('session-window-close', 'https://example.com');
  browserState.windowOnRemoved.emit(lease.windowId);

  assert.equal(manager.getLease('session-window-close'), null);

  await assert.rejects(
    () => manager.resolveTargetTab({ sessionId: 'session-window-close' }),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, ErrorCodes.SESSION_LEASE_NOT_FOUND);
      return true;
    },
  );
});

test('tab close revokes lease and blocks future routing', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  const lease = await manager.createLease('session-tab-close', 'https://example.com');
  browserState.tabOnRemoved.emit(lease.tabId, { windowId: lease.windowId, isWindowClosing: false });

  assert.equal(manager.getLease('session-tab-close'), null);

  await assert.rejects(
    () => manager.resolveTargetTab({ sessionId: 'session-tab-close' }),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, ErrorCodes.SESSION_LEASE_NOT_FOUND);
      return true;
    },
  );
});

test('hard-denies missing and unknown session routing', async () => {
  installBrowserMock();
  const manager = new SessionManager();

  await assert.rejects(
    () => manager.resolveTargetTab({}),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, ErrorCodes.SESSION_ID_REQUIRED);
      return true;
    },
  );

  await assert.rejects(
    () => manager.resolveTargetTab({ sessionId: 'unknown-session' }),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, ErrorCodes.SESSION_LEASE_NOT_FOUND);
      return true;
    },
  );
});

test('revokeLease is idempotent under repeated calls', async () => {
  installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  await manager.createLease('session-idempotent', 'https://example.com');

  const [first, second] = await Promise.all([
    manager.revokeLease('session-idempotent', 'first', false),
    manager.revokeLease('session-idempotent', 'second', false),
  ]);

  assert.equal(first, true);
  assert.equal(second, false);
});
