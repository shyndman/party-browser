import type { ContentBridge } from '../messaging/content-bridge';
import type { SessionManager } from '../session/session-manager';
import type { CommandResult, PageState } from '../types/commands';

import { requireSuccessfulCommandResult } from './command-result';

export class PageStateReader {
  private readonly nextSnapshotRefByTab = new Map<number, number>();

  constructor(
    private readonly contentBridge: ContentBridge,
    sessionManager?: SessionManager,
  ) {
    sessionManager?.onLeaseRevoked((_sessionId, lease) => {
      this.nextSnapshotRefByTab.delete(lease.tabId);
    });
  }

  async read(tabId: number): Promise<PageState> {
    const tab = await browser.tabs.get(tabId);
    const nextRefStart = this.nextSnapshotRefByTab.get(tabId) ?? 0;
    const snapshotResult = requireSuccessfulCommandResult<{ nextRefStart?: number; tree?: unknown }>(
      await this.contentBridge.sendCommand(tabId, 'snapshot', { nextRefStart }),
      `Snapshot readback failed for tab ${tabId}.`,
    );

    const updatedNextRefStart = snapshotResult.data?.nextRefStart;
    if (
      typeof updatedNextRefStart === 'number'
      && Number.isInteger(updatedNextRefStart)
      && updatedNextRefStart >= nextRefStart
    ) {
      this.nextSnapshotRefByTab.set(tabId, updatedNextRefStart);
    }

    return {
      url: tab.url,
      title: tab.title,
      tree: snapshotResult.data?.tree ?? {},
    };
  }

  async snapshot(tabId: number): Promise<CommandResult<{ nextRefStart?: number; tree?: unknown }>> {
    const nextRefStart = this.nextSnapshotRefByTab.get(tabId) ?? 0;
    const result = await this.contentBridge.sendCommand(tabId, 'snapshot', {
      nextRefStart,
    }) as CommandResult<{ nextRefStart?: number; tree?: unknown }>;
    const updatedNextRefStart = result.data?.nextRefStart;

    if (
      result.success
      && typeof updatedNextRefStart === 'number'
      && Number.isInteger(updatedNextRefStart)
      && updatedNextRefStart >= nextRefStart
    ) {
      this.nextSnapshotRefByTab.set(tabId, updatedNextRefStart);
    }

    return result;
  }
}
