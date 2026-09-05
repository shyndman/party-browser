import type { ContentBridge } from '../messaging/content-bridge';
import type { SessionManager } from '../session/session-manager';
import type { CommandResult, PageState, SnapshotData } from '../types/commands';

import { requireSuccessfulCommandResult } from './command-result';
import { logCommandPhase } from './command-logging';

const PAGE_READBACK_DEADLINE_MS = 5_000;
const PAGE_READBACK_POLL_INTERVAL_MS = 100;

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
    const result = requireSuccessfulCommandResult<SnapshotData>(
      await this.snapshot(tabId),
      `Snapshot readback failed for tab ${tabId}.`,
    );
    if (!result.data || typeof result.data.url !== 'string' || typeof result.data.title !== 'string') {
      throw new Error(`Snapshot readback failed for tab ${tabId}: response missing URL/title metadata.`);
    }
    const pageState = { url: result.data.url, title: result.data.title, tree: result.data.tree ?? {} };
    logCommandPhase('log', 'Page readback assembled page state.', {
      command: 'page_readback', origin: 'system', phase: 'assembled', tabId,
      url: pageState.url, title: pageState.title, treeSummary: summarizeSnapshotTree(pageState.tree),
    });
    return pageState;
  }

  async snapshot(tabId: number): Promise<CommandResult<SnapshotData>> {
    const deadline = Date.now() + PAGE_READBACK_DEADLINE_MS;
    let result = await this.requestSnapshot(tabId);
    while (result.success && isEmptySnapshot(result.data)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        logCommandPhase('log', 'Snapshot readiness timed out.', {
          command: 'snapshot', origin: 'system', phase: 'snapshot_response', tabId,
          timeoutMs: PAGE_READBACK_DEADLINE_MS,
        });
        return result;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(PAGE_READBACK_POLL_INTERVAL_MS, remaining)));
      result = await this.requestSnapshot(tabId);
    }
    return result;
  }

  private async requestSnapshot(tabId: number): Promise<CommandResult<SnapshotData>> {
    const nextRefStart = this.nextSnapshotRefByTab.get(tabId) ?? 0;
    logCommandPhase('log', 'Snapshot command request starting.', {
      command: 'snapshot', origin: 'system', phase: 'snapshot_request', tabId, nextRefStart,
    });
    const result = await this.contentBridge.sendCommand(tabId, 'snapshot', { nextRefStart }) as CommandResult<SnapshotData>;
    const updatedNextRefStart = result.data?.nextRefStart;
    if (result.success && typeof updatedNextRefStart === 'number' && Number.isInteger(updatedNextRefStart) && updatedNextRefStart >= nextRefStart) {
      this.nextSnapshotRefByTab.set(tabId, updatedNextRefStart);
    }
    logCommandPhase('log', 'Snapshot command response captured.', {
      command: 'snapshot', origin: 'system', phase: 'snapshot_response', tabId,
      nextRefStart, returnedNextRefStart: updatedNextRefStart, success: result.success,
      error: result.success ? undefined : result.error, ...summarizeSnapshotTree(result.data?.tree ?? {}),
    });
    return result;
  }
}


function isEmptySnapshot(snapshotData: SnapshotData | undefined): boolean {
  return snapshotData?.title === '' || (Array.isArray(snapshotData?.tree) && snapshotData.tree.length === 0);
}

function summarizeSnapshotTree(tree: unknown): Record<string, unknown> {
  const objectSummary = summarizeTreeShape(tree);

  return {
    treeType: Array.isArray(tree) ? 'array' : tree === null ? 'null' : typeof tree,
    topLevelKeys:
      tree && typeof tree === 'object' && !Array.isArray(tree)
        ? Object.keys(tree as Record<string, unknown>).slice(0, 12)
        : undefined,
    ...objectSummary,
  };
}

function summarizeTreeShape(tree: unknown): Record<string, unknown> {
  const visited = new WeakSet<object>();
  let nodeCount = 0;
  let keyCount = 0;

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (visited.has(value)) {
      return;
    }

    visited.add(value);
    nodeCount += 1;

    if (Array.isArray(value)) {
      keyCount += value.length;
      value.forEach(visit);
      return;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    keyCount += entries.length;
    entries.forEach(([, entryValue]) => visit(entryValue));
  };

  visit(tree);

  return {
    treeNodeCount: nodeCount,
    treeKeyCount: keyCount,
  };
}
