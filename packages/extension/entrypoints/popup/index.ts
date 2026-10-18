/**
 * Popup script for PartyBrowser Firefox extension
 * Handles status and waiting-room actions
 */

/// <reference path="../../src/types/global.d.ts" />

import {
  PopupMessageKinds,
  WaitingRoomDecisions,
  type KillSwitchResponse,
  type StatusResponse,
  type WaitingRoomDecision,
  type WaitingRoomDecisionResponse,
  type WaitingRoomEntry,
  type WaitingRoomListResponse,
} from '../../src/types/messages';
import { SessionLeaseKinds } from '../../src/types/session';

interface PopupElements {
  refreshBtn: HTMLButtonElement;
  killSwitchBtn: HTMLButtonElement;
  serverStatus: HTMLElement;
  serverDot: HTMLElement;
  serverText: HTMLElement;
  tabCount: HTMLElement;
  currentUrl: HTMLElement;
  waitingRoomCount: HTMLElement;
  waitingRoomEmpty: HTMLElement;
  waitingRoomList: HTMLElement;

  actionError: HTMLElement;
}

function getElements(): PopupElements {
  return {
    refreshBtn: document.getElementById('refresh-btn') as HTMLButtonElement,
    killSwitchBtn: document.getElementById('kill-switch-btn') as HTMLButtonElement,
    serverStatus: document.getElementById('server-status') as HTMLElement,
    serverDot: document.getElementById('server-dot') as HTMLElement,
    serverText: document.getElementById('server-text') as HTMLElement,
    tabCount: document.getElementById('tab-count') as HTMLElement,
    currentUrl: document.getElementById('current-url') as HTMLElement,
    waitingRoomCount: document.getElementById('waiting-room-count') as HTMLElement,
    waitingRoomEmpty: document.getElementById('waiting-room-empty') as HTMLElement,
    waitingRoomList: document.getElementById('waiting-room-list') as HTMLElement,

    actionError: document.getElementById('action-error') as HTMLElement,
  };
}

document.addEventListener('DOMContentLoaded', init);

async function init(): Promise<void> {
  const elements = getElements();

  elements.refreshBtn.addEventListener('click', () => {
    void refreshAll(true);
  });

  elements.killSwitchBtn.addEventListener('click', () => {
    void toggleKillSwitch();
  });

  await refreshAll(true);
}

async function toggleKillSwitch(): Promise<void> {
  const elements = getElements();
  elements.killSwitchBtn.disabled = true;

  try {
    const response = (await browser.runtime.sendMessage({
      type: PopupMessageKinds.TOGGLE_KILL_SWITCH,
    })) as KillSwitchResponse;

    updateKillSwitchUI(response.isEnabled);
    await refreshAll(true);
  } catch (error) {
    console.error('[PartyBrowser] Failed to toggle kill switch:', error);
  } finally {
    elements.killSwitchBtn.disabled = false;
  }
}

function updateKillSwitchUI(isEnabled: boolean): void {
  const elements = getElements();
  if (isEnabled) {
    elements.killSwitchBtn.textContent = 'Enabled';
    elements.killSwitchBtn.className = 'kill-switch-btn enabled';
  } else {
    elements.killSwitchBtn.textContent = 'Disabled';
    elements.killSwitchBtn.className = 'kill-switch-btn disabled';
  }
}

async function refreshAll(refreshWaitingRoom: boolean): Promise<void> {
  await Promise.all([refreshStatus(), refreshWaitingRoomList(refreshWaitingRoom)]);
}

async function refreshStatus(): Promise<void> {
  const elements = getElements();

  elements.serverText.textContent = 'Checking...';
  elements.serverDot.className = 'status-dot unknown';

  try {
    const status = (await browser.runtime.sendMessage({
      type: PopupMessageKinds.GET_STATUS,
    })) as StatusResponse;

    if (status.isServerRunning && status.isKillSwitchEnabled) {
      elements.serverText.textContent = 'Connected';
      elements.serverDot.className = 'status-dot connected';
      elements.serverStatus.className = 'status-value connected';
    } else {
      elements.serverText.textContent = status.isKillSwitchEnabled
        ? 'Disconnected'
        : 'Paused';
      elements.serverDot.className = 'status-dot disconnected';
      elements.serverStatus.className = 'status-value disconnected';
    }

    updateKillSwitchUI(status.isKillSwitchEnabled);

    const tabs = await browser.tabs.query({});
    elements.tabCount.textContent = tabs.length.toString();

    const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTabs.length > 0) {
      const url = activeTabs[0].url || '';
      elements.currentUrl.textContent = url.length > 36 ? `${url.slice(0, 36)}...` : url;
      elements.currentUrl.title = url;
    }
  } catch (error) {
    console.error('[PartyBrowser] Failed to refresh status:', error);
    elements.serverText.textContent = 'Error';
    elements.serverDot.className = 'status-dot disconnected';
    elements.serverStatus.className = 'status-value disconnected';
  }
}

async function refreshWaitingRoomList(refresh: boolean): Promise<void> {
  const elements = getElements();

  try {
    const response = (await browser.runtime.sendMessage({
      type: PopupMessageKinds.GET_WAITING_ROOM_LIST,
      refresh,
    })) as WaitingRoomListResponse;

    renderWaitingRoom(Array.isArray(response.entries) ? response.entries : []);
  } catch (error) {
    console.error('[PartyBrowser] Failed to refresh waiting room:', error);
    renderWaitingRoom([]);
  }
}

function renderWaitingRoom(entries: WaitingRoomEntry[]): void {
  const elements = getElements();
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.joinRequestTime !== b.joinRequestTime) {
      return a.joinRequestTime - b.joinRequestTime;
    }
    return a.sessionId.localeCompare(b.sessionId);
  });

  elements.waitingRoomCount.textContent = sortedEntries.length.toString();
  elements.waitingRoomList.innerHTML = '';

  if (sortedEntries.length === 0) {
    elements.waitingRoomEmpty.style.display = 'block';
    elements.waitingRoomList.style.display = 'none';
    return;
  }

  elements.waitingRoomEmpty.style.display = 'none';
  elements.waitingRoomList.style.display = 'flex';

  for (const entry of sortedEntries) {
    const row = document.createElement('div');
    row.className = 'waiting-room-row';

    const time = formatLocalTime(entry.joinRequestTime);
    const safeName = escapeHtml(entry.name);
    const safeReason = escapeHtml(entry.reason);
    const leaseKindLabel = entry.leaseKind === SessionLeaseKinds.TAKEOVER ? 'Takeover' : 'Workspace';
    const leaseDetail = entry.leaseKind === SessionLeaseKinds.TAKEOVER
      ? 'Takeover: will use your currently focused tab when you approve'
      : `Workspace: ${entry.url ?? ''}`;
    const safeLeaseKind = escapeHtml(leaseKindLabel);
    const safeLeaseDetail = escapeHtml(leaseDetail);

    row.innerHTML = `
      <div class="row-head">
        <div class="row-name">${safeName} · ${safeLeaseKind}</div>
        <div class="row-time">${time}</div>
      </div>
      <div class="row-reason">${safeReason}</div>
      <div class="row-url" title="${safeLeaseDetail}">${safeLeaseDetail}</div>
      <div class="row-actions">
        <button class="row-btn join" data-session-id="${entry.sessionId}" data-decision="${WaitingRoomDecisions.JOIN}">Approve</button>
        <button class="row-btn reject" data-session-id="${entry.sessionId}" data-decision="${WaitingRoomDecisions.REJECT}">Reject</button>
      </div>
    `;

    const buttons = row.querySelectorAll('button[data-session-id]');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const target = button as HTMLButtonElement;
        const sessionId = target.dataset.sessionId;
        const decision = target.dataset.decision as WaitingRoomDecision;
        if (!sessionId) {
          return;
        }
        void handleWaitingRoomDecision(row, sessionId, decision);
      });
    });

    elements.waitingRoomList.appendChild(row);
  }
}

async function handleWaitingRoomDecision(
  row: HTMLElement,
  sessionId: string,
  decision: WaitingRoomDecision,
): Promise<void> {
  const buttons = row.querySelectorAll('button[data-session-id]');
  buttons.forEach((button) => {
    (button as HTMLButtonElement).disabled = true;
  });

  try {
    const response = (await browser.runtime.sendMessage({
      type: PopupMessageKinds.WAITING_ROOM_DECISION,
      sessionId,
      decision,
    })) as WaitingRoomDecisionResponse;

    if (!response.success) {
      console.warn(
        `[PartyBrowser] Waiting-room ${decision} failed for ${sessionId}: ${response.error}`,
      );

      showActionError(
        decision === WaitingRoomDecisions.JOIN ? 'Approval setup failed' : 'Rejection failed',
        response.error ?? 'No error details were returned.',
      );
    }
  } catch (error) {
    console.error('[PartyBrowser] Waiting-room action failed:', error);

    showActionError('Waiting-room action failed', error);
  } finally {
    await refreshWaitingRoomList(true);
  }
}

/**
 * Keep feedback outside the request list so removing a failed request or
 * refreshing the waiting room cannot erase its actual setup error.
 */
function showActionError(context: string, error: unknown): void {
  const { actionError } = getElements();

  const message = error instanceof Error ? error.message : String(error);

  actionError.textContent = `${context}: ${message}`;
  actionError.hidden = false;
}

function formatLocalTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
