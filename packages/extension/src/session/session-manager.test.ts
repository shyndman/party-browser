import { strict as assert } from "node:assert";
import test from "node:test";

import { SessionManager } from "./session-manager";
import { ErrorCodes, CodedError } from "@/utils/errors";

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
  };
}

function installBrowserMock(): void {
  const onUpdated = createEventEmitter();
  const onRemoved = createEventEmitter();
  let nextTabId = 100;
  const existingTabs = new Map<number, { id: number; url?: string }>();

  (globalThis as any).browser = {
    tabs: {
      onUpdated,
      onRemoved,
      async create({ url }: { url: string }) {
        nextTabId += 1;
        const tab = { id: nextTabId, url };
        existingTabs.set(tab.id, tab);
        return tab;
      },
      async executeScript() {
        return [];
      },
      async get(tabId: number) {
        const tab = existingTabs.get(tabId);
        if (!tab) {
          throw new Error("tab not found");
        }
        return tab;
      },
      async remove(tabId: number) {
        existingTabs.delete(tabId);
      },
      async group() {
        return 1;
      },
    },
    tabGroups: undefined,
  };
}

test("lease map lifecycle create/get/revoke/revokeAll", async () => {
  installBrowserMock();
  const manager = new SessionManager();
  (manager as any).waitForTabLoad = async () => undefined;

  const tabIdOne = await manager.createLease("session-1", "https://example.com");
  assert.equal(manager.getLease("session-1"), tabIdOne);

  const tabIdTwo = await manager.createLease("session-2", "https://partybrowser.io");
  assert.equal(manager.getLease("session-2"), tabIdTwo);
  assert.equal(manager.getLeaseCount(), 2);

  const revokedOne = await manager.revokeLease("session-1", "test", true);
  assert.equal(revokedOne, true);
  assert.equal(manager.getLease("session-1"), null);

  await manager.revokeAllLeases("test-all", true);
  assert.equal(manager.getLeaseCount(), 0);
});

test("hard-denies missing and unknown session routing", async () => {
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
    () => manager.resolveTargetTab({ sessionId: "unknown-session" }),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, ErrorCodes.SESSION_LEASE_NOT_FOUND);
      return true;
    },
  );
});
