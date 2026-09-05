import type { ContentBridge } from '../messaging/content-bridge';
import type { SessionManager } from '../session/session-manager';
import type { CommandResult, PageState, SnapshotData } from '../types/commands';

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
    const nextRefStart = this.nextSnapshotRefByTab.get(tabId) ?? 0;
    const snapshotResult = requireSuccessfulCommandResult<SnapshotData>(
      await this.contentBridge.sendCommand(tabId, 'snapshot', { nextRefStart }),
      `Snapshot readback failed for tab ${tabId}.`,
    );

    const snapshotData = snapshotResult.data;
    if (!snapshotData || typeof snapshotData.url !== 'string' || typeof snapshotData.title !== 'string') {
      throw new Error(`Snapshot readback failed for tab ${tabId}: response missing URL/title metadata.`);
    }
    const updatedNextRefStart = snapshotData.nextRefStart;
    if (
      typeof updatedNextRefStart === 'number'
      && Number.isInteger(updatedNextRefStart)
      && updatedNextRefStart >= nextRefStart
    ) {
      this.nextSnapshotRefByTab.set(tabId, updatedNextRefStart);
    }

    return {
      url: snapshotData.url,
      title: snapshotData.title,
      tree: snapshotData.tree ?? {},
    };
  }

  async snapshot(tabId: number): Promise<CommandResult<SnapshotData>> {
    const nextRefStart = this.nextSnapshotRefByTab.get(tabId) ?? 0;
    const result = await this.contentBridge.sendCommand(tabId, 'snapshot', {
      nextRefStart,
    }) as CommandResult<SnapshotData>;
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
