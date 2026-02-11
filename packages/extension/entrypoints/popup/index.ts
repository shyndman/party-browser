/**
 * Popup script for Blindflight Firefox extension
 * Handles popup UI and displays connection status
 */

/// <reference path="../../src/types/global.d.ts" />

import type { StatusResponse, KillSwitchResponse } from '../src/types/messages';

interface PopupElements {
  refreshBtn: HTMLButtonElement;
  docsBtn: HTMLButtonElement;
  killSwitchBtn: HTMLButtonElement;
  serverStatus: HTMLElement;
  serverDot: HTMLElement;
  serverText: HTMLElement;
  tabCount: HTMLElement;
  currentUrl: HTMLElement;
}

function getElements(): PopupElements {
  return {
    refreshBtn: document.getElementById('refresh-btn') as HTMLButtonElement,
    docsBtn: document.getElementById('docs-btn') as HTMLButtonElement,
    killSwitchBtn: document.getElementById('kill-switch-btn') as HTMLButtonElement,
    serverStatus: document.getElementById('server-status') as HTMLElement,
    serverDot: document.getElementById('server-dot') as HTMLElement,
    serverText: document.getElementById('server-text') as HTMLElement,
    tabCount: document.getElementById('tab-count') as HTMLElement,
    currentUrl: document.getElementById('current-url') as HTMLElement
  };
}

document.addEventListener('DOMContentLoaded', init);

/**
 * Initialize popup
 */
async function init(): Promise<void> {
  console.log('[Blindflight] Popup initialized');

  const elements = getElements();

  // Set up event listeners
  elements.refreshBtn.addEventListener('click', () => void refreshStatus());
  elements.docsBtn.addEventListener('click', openDocs);
  elements.killSwitchBtn.addEventListener('click', () => void toggleKillSwitch());

  // Load initial status
  await refreshStatus();
}

/**
 * Toggle kill switch
 */
async function toggleKillSwitch(): Promise<void> {
  const elements = getElements();
  elements.killSwitchBtn.disabled = true;

  try {
    const response = await browser.runtime.sendMessage({ type: 'toggleKillSwitch' }) as KillSwitchResponse;
    updateKillSwitchUI(response.isEnabled);
  } catch (error) {
    console.error('[Blindflight] Failed to toggle kill switch:', error);
  } finally {
    elements.killSwitchBtn.disabled = false;
  }
}

/**
 * Update kill switch UI based on state
 */
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

/**
 * Refresh connection status
 */
async function refreshStatus(): Promise<void> {
  const elements = getElements();

  // Show loading state
  elements.serverText.textContent = 'Checking...';
  elements.serverDot.className = 'status-dot unknown';

  try {
    // Get status from background script
    const status = await browser.runtime.sendMessage({ type: 'getStatus' }) as StatusResponse;

    // Update server status
    if (status.isServerRunning && status.isKillSwitchEnabled) {
      elements.serverText.textContent = 'Connected';
      elements.serverDot.className = 'status-dot connected';
      elements.serverStatus.className = 'status-value connected';
    } else {
      elements.serverText.textContent = status.isKillSwitchEnabled ? 'Disconnected' : 'Paused';
      elements.serverDot.className = 'status-dot disconnected';
      elements.serverStatus.className = 'status-value disconnected';
    }

    // Update kill switch UI
    updateKillSwitchUI(status.isKillSwitchEnabled);

    // Get tab count
    const tabs = await browser.tabs.query({});
    elements.tabCount.textContent = tabs.length.toString();

    // Get current tab URL
    const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTabs.length > 0) {
      const url = activeTabs[0].url || '';
      elements.currentUrl.textContent = url.length > 30 ? url.slice(0, 30) + '...' : url;
      elements.currentUrl.title = url;
    }
  } catch (error) {
    console.error('[Blindflight] Failed to get status:', error);
    elements.serverText.textContent = 'Error';
    elements.serverDot.className = 'status-dot disconnected';
    elements.serverStatus.className = 'status-value disconnected';
  }
}

/**
 * Open documentation
 */
function openDocs(): void {
  void browser.tabs.create({
    url: 'https://docs.blindflight.io'
  });
}
