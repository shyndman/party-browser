import { strict as assert } from 'node:assert';
import test from 'node:test';

import { SessionManager } from './session-manager';
import { SessionLeaseKinds, SessionLeaseOwnerships } from '@/types/session';
import { ErrorCodes, CodedError } from '@/utils/errors';
import type { TabGroups } from 'webextension-polyfill';

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

type MockTab = {
  id: number;
  url?: string;
  windowId: number;
  index: number;
  groupId: number;
  pinned: boolean;
};

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
  focusedWindowId: number;
  focusedTabId: number;
  focusedTabUrl: string;
  tabs: Map<number, MockTab>;
  groups: Map<number, TabGroups.TabGroup>;
  beforeGroupUpdate?: () => Promise<void>;
  beforeUngroup?: () => Promise<void>;
  beforeInjection?: () => Promise<void>;
  beforePing?: () => Promise<void>;
  injectedTabIds: number[];
  stoppedTabIds: number[];
};

function installBrowserMock(): BrowserMockState {
  const navigationOnCompleted = createEventEmitter();
  const navigationOnErrorOccurred = createEventEmitter();
  const tabOnRemoved = createEventEmitter();
  const windowOnRemoved = createEventEmitter();

  let nextTabId = 100;
  let nextWindowId = 500;

  const existingTabs = new Map<number, MockTab>();
  const groups = new Map<number, TabGroups.TabGroup>();
  let nextGroupId = 1000;
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
    focusedWindowId: 1,
    focusedTabId: 42,
    focusedTabUrl: 'https://focused.example',
    tabs: existingTabs,
    groups,
    injectedTabIds: [],
    stoppedTabIds: [],
  };

  existingTabs.set(browserState.focusedTabId, {
    id: browserState.focusedTabId,
    url: browserState.focusedTabUrl,
    windowId: browserState.focusedWindowId,
    index: 0,
    groupId: -1,
    pinned: false,
  });
  existingWindows.set(browserState.focusedWindowId, {
    id: browserState.focusedWindowId,
    tabIds: [browserState.focusedTabId],
  });

  function moveTab(tabId: number, windowId: number, index: number): MockTab {
    const tab = existingTabs.get(tabId);
    if (!tab) throw new Error('tab not found');
    const destination = [...existingTabs.values()]
      .filter((candidate) => candidate.id !== tabId && candidate.windowId === windowId)
      .sort((a, b) => a.index - b.index);
    destination.splice(index < 0 ? destination.length : index, 0, tab);
    tab.windowId = windowId;
    destination.forEach((member, position) => { member.index = position; });
    return tab;
  }

  function setGroup(tab: MockTab, groupId: number): void {
    const oldGroupId = tab.groupId;
    tab.groupId = groupId;
    if (![...existingTabs.values()].some((member) => member.groupId === oldGroupId)) {
      groups.delete(oldGroupId);
    }
  }

  (globalThis as any).browser = {
    tabs: {
      async executeScript(tabId: number, options: { allFrames?: boolean; file?: string }) {
        if (options.file) {
          assert.equal(options.allFrames, false);
          browserState.injectedTabIds.push(tabId);
          await browserState.beforeInjection?.();
        }
        return [];
      },
      async sendMessage(tabId: number, message: { type: string }, options: { frameId: number }) {
        assert.equal(options.frameId, 0);
        if (message.type === 'stopTelemetry') {
          browserState.stoppedTabIds.push(tabId);
        } else if (message.type === 'ping') {
          await browserState.beforePing?.();
        }
        return { success: true };
      },
      onRemoved: tabOnRemoved,
      async create({ url }: { url: string }) {
        nextTabId += 1;
        const tab = { id: nextTabId, url, windowId: nextWindowId + 1, index: 0, groupId: -1, pinned: false };
        existingTabs.set(tab.id, tab);
        return tab;
      },
      async get(tabId: number) {
        const tab = existingTabs.get(tabId);
        if (!tab) {
          throw new Error('tab not found');
        }
        return { ...tab };
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
      async query(query: { windowId?: number; active?: boolean; groupId?: number }) {
        if (query.groupId !== undefined) {
          return [...existingTabs.values()].filter((tab) => tab.groupId === query.groupId).map((tab) => ({ ...tab }));
        }
        const focusedTab = existingTabs.get(browserState.focusedTabId);
        if (
          query.active &&
          typeof query.windowId === 'number' &&
          query.windowId === browserState.focusedWindowId &&
          focusedTab
        ) {
          return [{ ...focusedTab, url: browserState.focusedTabUrl }];
        }

        if (typeof query.windowId !== 'number') {
          return Array.from(existingTabs.values());
        }

        return Array.from(existingTabs.values()).filter((tab) => tab.windowId === query.windowId);
      },
      async group(options: { tabIds: number; groupId?: number; createProperties?: { windowId?: number } }) {
        const tab = existingTabs.get(options.tabIds);
        if (!tab) throw new Error('tab not found');
        const groupId = options.groupId ?? ++nextGroupId;
        if (options.groupId !== undefined && !groups.has(groupId)) throw new Error('group not found');
        if (options.groupId === undefined) {
          groups.set(groupId, { id: groupId, windowId: tab.windowId, color: 'grey', collapsed: false });
        }
        const members = [...existingTabs.values()].filter((member) => member.groupId === groupId);
        setGroup(tab, groupId);
        tab.pinned = false;
        if (members.length) {
          moveTab(tab.id, groups.get(groupId)!.windowId, Math.max(...members.map((member) => member.index)) + 1);
        }
        return groupId;
      },
      async ungroup(tabId: number) {
        await browserState.beforeUngroup?.();
        const tab = existingTabs.get(tabId);
        if (!tab) throw new Error('tab not found');
        setGroup(tab, -1);
      },
      async move(tabId: number, options: { windowId?: number; index: number }) {
        const tab = existingTabs.get(tabId);
        if (!tab) throw new Error('tab not found');
        return { ...moveTab(tabId, options.windowId ?? tab.windowId, options.index) };
      },
      async update(tabId: number, options: { pinned?: boolean }) {
        const tab = existingTabs.get(tabId);
        if (!tab) throw new Error('tab not found');
        Object.assign(tab, options);
        return { ...tab };
      },
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      async get(groupId: number) {
        const group = groups.get(groupId);
        if (!group) throw new Error('group not found');
        return { ...group };
      },
      async query() {
        return [...groups.values()].map((group) => ({ ...group }));
      },
      async update(groupId: number, properties: TabGroups.UpdateUpdatePropertiesType) {
        await browserState.beforeGroupUpdate?.();
        const group = groups.get(groupId);
        if (!group) throw new Error('group not found');
        Object.assign(group, properties);
        return { ...group };
      },
    },
    webNavigation: {
      onCompleted: navigationOnCompleted,
      onErrorOccurred: navigationOnErrorOccurred,
    },
    windows: {
      onRemoved: windowOnRemoved,
      async getLastFocused() {
        return { id: browserState.focusedWindowId, type: 'normal', left: 0, top: 0, width: 1920, height: 1080 };
      },
      async getAll() {
        return [{ id: browserState.focusedWindowId, type: 'normal', left: 0, top: 0, width: 1920, height: 1080 }];
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

        const tab = { id: nextTabId, url: options.url, windowId: nextWindowId, index: 0, groupId: -1, pinned: false };
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

  const leaseOne = await manager.createWorkspaceLease('session-1', 'https://example.com');
  assert.equal(typeof leaseOne.windowId, 'number');
  assert.equal(typeof leaseOne.tabId, 'number');
  assert.deepEqual(manager.getLease('session-1'), leaseOne);

  const leaseTwo = await manager.createWorkspaceLease('session-2', 'https://partybrowser.io');
  assert.deepEqual(manager.getLease('session-2'), leaseTwo);
  assert.equal(manager.getLeaseCount(), 2);

  const revokedOne = await manager.revokeLease('session-1', 'test');
  assert.equal(revokedOne, true);
  assert.equal(manager.getLease('session-1'), null);

  await manager.revokeAllLeases('test-all');
  assert.equal(manager.getLeaseCount(), 0);
});

test('lease creation applies deterministic geometry and stores snapshot shape', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  const lease = await manager.createWorkspaceLease('session-geometry', 'https://geometry.example');

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
    leaseKind: SessionLeaseKinds.WORKSPACE,
    ownership: SessionLeaseOwnerships.OWNED,
    closeOnRevoke: true,
  });

  assert.deepEqual(manager.getLeaseSnapshot(), {
    'session-geometry': {
      windowId: createdWindow.id,
      tabId: createdWindow.tabs[0].id,
      leaseKind: SessionLeaseKinds.WORKSPACE,
      ownership: SessionLeaseOwnerships.OWNED,
      closeOnRevoke: true,
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

  const lease = await manager.createWorkspaceLease('session-ready', 'https://ready.example');

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
    () => manager.createWorkspaceLease('session-missing-tab', 'https://missing-tab.example'),
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
    await manager.createWorkspaceLease('session-failed-setup', 'https://fail.example');
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
    await manager.createWorkspaceLease('session-cleanup-fails', 'https://cleanup-fails.example');
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

  const lease = await manager.createWorkspaceLease('session-window-close', 'https://example.com');
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

  const lease = await manager.createWorkspaceLease('session-tab-close', 'https://example.com');
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

test('takeover lease binds focused active tab without creating a window', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  const lease = await manager.createTakeoverLease('session-takeover');

  assert.deepEqual(lease, {
    windowId: browserState.focusedWindowId,
    tabId: browserState.focusedTabId,
    leaseKind: SessionLeaseKinds.TAKEOVER,
    ownership: SessionLeaseOwnerships.BORROWED,
    closeOnRevoke: false,
  });
  assert.equal(browserState.createdLeaseWindows.length, 0);
  assert.equal(await manager.resolveTargetTab({ sessionId: 'session-takeover' }), browserState.focusedTabId);
});

test('takeover revoke preserves the borrowed tab and window', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  await manager.createTakeoverLease('session-takeover');
  const revoked = await manager.revokeLease('session-takeover', 'test');

  assert.equal(revoked, true);
  assert.deepEqual(browserState.removedWindowIds, []);
  assert.equal(manager.getLease('session-takeover'), null);
});

test('takeover rejects restricted focused tab URLs', async () => {
  const browserState = installBrowserMock();
  browserState.focusedTabUrl = 'about:config';
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  await assert.rejects(
    () => manager.createTakeoverLease('session-takeover'),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, ErrorCodes.TAKEOVER_TAB_UNAVAILABLE);
      return true;
    },
  );
});

test('takeover prevents two sessions from leasing the same focused tab', async () => {
  installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  await manager.createTakeoverLease('session-one');

  await assert.rejects(
    () => manager.createTakeoverLease('session-two'),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, ErrorCodes.COMMAND_FAILED);
      assert.match(error.message, /already leased/);
      return true;
    },
  );
});
test('concurrent takeover cannot claim a tab during another setup', async () => {
  installBrowserMock();
  const manager = new SessionManager();
  let releaseSettling!: () => void;
  let entered!: () => void;
  const settlingEntered = new Promise<void>((resolve) => { entered = resolve; });
  const settlingReleased = new Promise<void>((resolve) => { releaseSettling = resolve; });
  const managerInternals = manager as unknown as { tabLifecycle: { waitForTabToSettle: () => Promise<void> } };
  managerInternals.tabLifecycle.waitForTabToSettle = async () => {
    entered();
    await settlingReleased;
  };
  const first = manager.createTakeoverLease('session-one');
  await settlingEntered;
  await assert.rejects(manager.createTakeoverLease('session-two'), { errorCode: ErrorCodes.COMMAND_FAILED });
  releaseSettling();
  await first;
  assert.equal(manager.hasLease('session-one'), true);
  assert.equal(manager.hasLease('session-two'), false);
});

test('takeover tab close revokes lease and preserves browser window', async () => {
  const browserState = installBrowserMock();
  const manager = new SessionManager();
  (manager as any).tabLifecycle.waitForTabToSettle = async () => undefined;

  const lease = await manager.createTakeoverLease('session-takeover-tab-close');
  browserState.tabOnRemoved.emit(lease.tabId, { windowId: lease.windowId, isWindowClosing: false });

  assert.equal(manager.getLease('session-takeover-tab-close'), null);
  assert.deepEqual(browserState.removedWindowIds, []);
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

  await manager.createWorkspaceLease('session-idempotent', 'https://example.com');

  const [first, second] = await Promise.all([
    manager.revokeLease('session-idempotent', 'first'),
    manager.revokeLease('session-idempotent', 'second'),
  ]);

  assert.equal(first, true);
  assert.equal(second, false);
});

function installGroupedTakeover(singleton: boolean) {
  const state = installBrowserMock();
  const originalGroup: TabGroups.TabGroup = {
    id: 7, windowId: 1, title: 'Research', color: 'cyan', collapsed: true,
  };
  state.groups.set(originalGroup.id, { ...originalGroup });
  Object.assign(state.tabs.get(42)!, { index: 1, groupId: 7 });
  state.tabs.set(41, { id: 41, windowId: 1, index: 0, groupId: -1, pinned: false });
  state.tabs.set(43, { id: 43, windowId: 1, index: 2, groupId: singleton ? -1 : 7, pinned: false });
  const manager = new SessionManager();
  const internals = manager as unknown as { tabLifecycle: { waitForTabToSettle: () => Promise<void> } };
  internals.tabLifecycle.waitForTabToSettle = async () => undefined;
  return { state, manager, originalGroup };
}

test('takeover recreates only its removed singleton with saved appearance and position', async () => {
  const { state, manager, originalGroup } = installGroupedTakeover(true);
  await manager.createTakeoverLease('singleton');
  const controlledGroup = state.tabs.get(42)!.groupId;
  assert.notEqual(controlledGroup, originalGroup.id);
  assert.equal(state.groups.has(originalGroup.id), false);
  await browser.tabs.move(42, { index: 2 });
  await manager.revokeLease('singleton', 'test');
  const restoredTab = state.tabs.get(42)!;
  assert.equal(restoredTab.index, 1);
  assert.deepEqual(state.groups.get(restoredTab.groupId), {
    ...originalGroup, id: restoredTab.groupId,
  });
  assert.equal(state.groups.has(controlledGroup), false);
});

test('takeover rejoins surviving group without overwriting user appearance changes', async () => {
  const { state, manager } = installGroupedTakeover(false);
  await manager.createTakeoverLease('surviving');
  state.groups.get(7)!.title = 'Renamed by user';
  state.groups.get(7)!.collapsed = false;
  await manager.revokeLease('surviving', 'test');
  assert.equal(state.tabs.get(42)!.groupId, 7);
  assert.equal(state.tabs.get(42)!.index, 1);
  assert.equal(state.groups.get(7)!.title, 'Renamed by user');
  assert.equal(state.groups.get(7)!.collapsed, false);
});

test('takeover does not recreate a multi-tab group deleted later', async () => {
  const { state, manager } = installGroupedTakeover(false);
  await manager.createTakeoverLease('deleted-later');
  await browser.tabs.ungroup(43);
  await manager.revokeLease('deleted-later', 'test');
  assert.equal(state.tabs.get(42)!.groupId, -1);
  assert.equal(state.tabs.get(42)!.index, 1);
  assert.equal(state.groups.size, 0);
});

test('initially ungrouped pinned target regains pinning and position', async () => {
  const { state, manager } = installGroupedTakeover(true);
  state.tabs.get(42)!.groupId = -1;
  state.tabs.get(42)!.pinned = true;
  state.groups.clear();
  await manager.createTakeoverLease('pinned');
  assert.equal(state.tabs.get(42)!.pinned, false);
  await browser.tabs.move(42, { index: 2 });
  await manager.revokeLease('pinned', 'test');
  assert.equal(state.tabs.get(42)!.groupId, -1);
  assert.equal(state.tabs.get(42)!.pinned, true);
  assert.equal(state.tabs.get(42)!.index, 1);
});

test('failed group setup rolls back placement and frees the tab claim', async () => {
  const { state, manager } = installGroupedTakeover(true);
  const failure = new Error('group update failed');
  state.beforeGroupUpdate = async () => {
    state.beforeGroupUpdate = undefined;
    throw failure;
  };
  await assert.rejects(manager.createTakeoverLease('failed'), (error) => error === failure);
  assert.equal(manager.hasLease('failed'), false);
  assert.equal(state.groups.get(state.tabs.get(42)!.groupId)!.title, 'Research');
  await manager.createTakeoverLease('retry');
  assert.equal(manager.hasLease('retry'), true);
});

test('release during group setup rolls back before freeing the target', async () => {
  const { state, manager } = installGroupedTakeover(true);
  let enter!: () => void;
  let resume!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const resumed = new Promise<void>((resolve) => { resume = resolve; });
  state.beforeGroupUpdate = async () => {
    state.beforeGroupUpdate = undefined;
    enter();
    await resumed;
  };
  const creating = manager.createTakeoverLease('cancelled');
  const rejected = assert.rejects(creating, { errorCode: ErrorCodes.COMMAND_FAILED });
  await entered;
  const releasing = manager.revokeLease('cancelled', 'cancel');
  await assert.rejects(manager.createTakeoverLease('racer'), { errorCode: ErrorCodes.COMMAND_FAILED });
  resume();
  await rejected;
  assert.equal(await releasing, true);
  assert.equal(manager.hasLease('cancelled'), false);
  assert.equal(state.groups.get(state.tabs.get(42)!.groupId)!.title, 'Research');
  await manager.createTakeoverLease('after-cancel');
});

test('tab remains exclusive until asynchronous restoration completes', async () => {
  const { state, manager } = installGroupedTakeover(false);
  await manager.createTakeoverLease('releasing');
  let enter!: () => void;
  let resume!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const resumed = new Promise<void>((resolve) => { resume = resolve; });
  state.beforeUngroup = async () => {
    state.beforeUngroup = undefined;
    enter();
    await resumed;
  };
  const releasing = manager.revokeLease('releasing', 'test');
  await entered;
  await assert.rejects(manager.createTakeoverLease('too-early'), { errorCode: ErrorCodes.COMMAND_FAILED });
  resume();
  await releasing;
  await manager.createTakeoverLease('after-release');
});

test('closed target during group setup cannot publish or leak a lease', async () => {
  const { state, manager } = installGroupedTakeover(true);
  state.beforeGroupUpdate = async () => {
    state.beforeGroupUpdate = undefined;
    state.tabs.delete(42);
    state.tabOnRemoved.emit(42, { windowId: 1, isWindowClosing: false });
  };
  await assert.rejects(manager.createTakeoverLease('closed'));
  assert.equal(manager.hasLease('closed'), false);
  state.tabs.set(42, { id: 42, windowId: 1, index: 1, groupId: -1, pinned: false });
  await manager.createTakeoverLease('new-target');
  assert.equal(manager.hasLease('new-target'), true);
});

test('takeover success waits for initialized telemetry', async () => {
  const state = installBrowserMock();
  const manager = new SessionManager();
  manager['tabLifecycle'].waitForTabToSettle = async () => undefined;
  let enter!: () => void;
  let resume!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const resumed = new Promise<void>((resolve) => { resume = resolve; });
  state.beforePing = async () => {
    enter();
    await resumed;
  };
  let published = false;
  manager.onLeaseCreated(() => { published = true; });
  const setup = manager.createTakeoverLease('ready');
  await entered;
  assert.equal(manager.hasLease('ready'), false);
  assert.equal(published, false);
  resume();
  await setup;
  assert.equal(published, true);
  assert.deepEqual(state.injectedTabIds, [42]);
});

test('failed initial injection cleans up telemetry, restores the tab and frees its claim', async () => {
  const { state, manager } = installGroupedTakeover(false);
  const originalGroup = state.tabs.get(42)!.groupId;
  const failure = new CodedError('injection denied', ErrorCodes.COMMAND_FAILED);
  state.beforeInjection = async () => { throw failure; };
  await assert.rejects(manager.createTakeoverLease('failed'), (error: unknown) => error === failure);
  assert.equal(manager.hasLease('failed'), false);
  assert.equal(state.tabs.get(42)!.groupId, originalGroup);
  assert.deepEqual(state.stoppedTabIds, [42]);
  state.beforeInjection = undefined;
  await manager.createTakeoverLease('retry');
});

test('navigation injection requires an existing lease and a top-level commit', async () => {
  const state = installBrowserMock();
  const manager = new SessionManager();
  manager['tabLifecycle'].waitForTabToSettle = async () => undefined;
  await manager.handleNavigationCommitted({ tabId: 42, frameId: 0 });
  assert.deepEqual(state.injectedTabIds, []);
  await manager.createTakeoverLease('owned');
  state.injectedTabIds.length = 0;
  await manager.handleNavigationCommitted({ tabId: 43, frameId: 0 });
  await manager.handleNavigationCommitted({ tabId: 42, frameId: 1 });
  assert.deepEqual(state.injectedTabIds, []);
  await manager.handleNavigationCommitted({ tabId: 42, frameId: 0 });
  assert.deepEqual(state.injectedTabIds, [42]);
  state.beforeInjection = async () => { throw new Error('restricted navigation'); };
  await manager.handleNavigationCommitted({ tabId: 42, frameId: 0 });
  assert.equal(manager.hasLease('owned'), true);
  await manager.revokeLease('owned', 'test');
  state.injectedTabIds.length = 0;
  await manager.handleNavigationCommitted({ tabId: 42, frameId: 0 });
  assert.deepEqual(state.injectedTabIds, []);
});

test('release stops only its target telemetry and keeps a takeover tab open', async () => {
  const state = installBrowserMock();
  const manager = new SessionManager();
  manager['tabLifecycle'].waitForTabToSettle = async () => undefined;
  await manager.createTakeoverLease('takeover');
  const workspace = await manager.createWorkspaceLease('other', 'https://other.example');
  await manager.revokeLease('takeover', 'test');
  assert.deepEqual(state.stoppedTabIds, [42]);
  assert.equal(state.tabs.has(42), true);
  assert.equal(manager.getLease('other')!.tabId, workspace.tabId);
});

test('workspace initializes its initial document before publishing a usable lease', async () => {
  const state = installBrowserMock();
  const manager = new SessionManager();
  manager['tabLifecycle'].waitForTabToSettle = async () => undefined;
  state.beforePing = async () => {
    assert.equal(manager.hasLease('workspace'), false);
  };
  const lease = await manager.createWorkspaceLease('workspace', 'https://example.com');
  assert.deepEqual(state.injectedTabIds, [lease.tabId]);
  assert.equal(manager.hasLease('workspace'), true);
});

test('workspace telemetry failure rolls back its owned window without publishing', async () => {
  const state = installBrowserMock();
  const manager = new SessionManager();
  manager['tabLifecycle'].waitForTabToSettle = async () => undefined;
  const failure = new CodedError('workspace injection denied', ErrorCodes.COMMAND_FAILED);
  state.beforeInjection = async () => { throw failure; };
  await assert.rejects(manager.createWorkspaceLease('workspace', 'https://example.com'), (error: unknown) => error === failure);
  assert.equal(manager.hasLease('workspace'), false);
  assert.equal(state.stoppedTabIds.length, 1);
  assert.deepEqual(state.removedWindowIds, [state.createdLeaseWindows[0]!.id]);
});

test('navigation finishing after release stops the late telemetry', async () => {
  const state = installBrowserMock();
  const manager = new SessionManager();
  manager['tabLifecycle'].waitForTabToSettle = async () => undefined;
  await manager.createTakeoverLease('released');
  let enter!: () => void;
  let resume!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const resumed = new Promise<void>((resolve) => { resume = resolve; });
  state.beforeInjection = async () => { enter(); await resumed; };
  const navigation = manager.handleNavigationCommitted({ tabId: 42, frameId: 0 });
  await entered;
  await manager.revokeLease('released', 'test');
  resume();
  await navigation;
  assert.deepEqual(state.stoppedTabIds, [42, 42]);
});

test('late navigation cleanup preserves a different session that claimed the released tab', async () => {
  const state = installBrowserMock();
  const manager = new SessionManager();
  manager['tabLifecycle'].waitForTabToSettle = async () => undefined;
  await manager.createTakeoverLease('released');
  let enter!: () => void;
  let resume!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const resumed = new Promise<void>((resolve) => { resume = resolve; });
  state.beforeInjection = async () => {
    state.beforeInjection = undefined;
    enter();
    await resumed;
  };
  const navigation = manager.handleNavigationCommitted({ tabId: 42, frameId: 0 });
  await entered;
  await manager.revokeLease('released', 'test');
  await manager.createTakeoverLease('replacement');
  resume();
  await navigation;
  assert.deepEqual(state.stoppedTabIds, [42]);
  assert.equal(manager.hasLease('replacement'), true);
});

test('workspace reserves its tab while initial telemetry awaits readiness', async () => {
  const state = installBrowserMock();
  const manager = new SessionManager();
  manager['tabLifecycle'].waitForTabToSettle = async () => undefined;
  state.beforePing = async () => {
    const created = state.createdLeaseWindows[0]!;
    state.focusedWindowId = created.id;
    state.focusedTabId = created.tabs[0]!.id;
    await assert.rejects(
      manager.createTakeoverLease('competing'),
      { errorCode: ErrorCodes.COMMAND_FAILED },
    );
  };
  const lease = await manager.createWorkspaceLease('workspace', 'https://example.com');
  assert.equal(manager.getLease('workspace')!.tabId, lease.tabId);
  assert.equal(manager.hasLease('competing'), false);
  assert.deepEqual(state.stoppedTabIds, []);
});
