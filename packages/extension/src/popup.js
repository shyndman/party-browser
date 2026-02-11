/**
 * Popup script for Browser MCP Firefox extension
 * Handles popup UI and displays connection status
 */

document.addEventListener('DOMContentLoaded', init);

/**
 * Initialize popup
 */
async function init() {
  console.log('[Browser MCP] Popup initialized');

  // Set up event listeners
  document.getElementById('refresh-btn').addEventListener('click', refreshStatus);
  document.getElementById('docs-btn').addEventListener('click', openDocs);
  document.getElementById('kill-switch-btn').addEventListener('click', toggleKillSwitch);

  // Load initial status
  await refreshStatus();
}

/**
 * Toggle kill switch
 */
async function toggleKillSwitch() {
  const btn = document.getElementById('kill-switch-btn');
  btn.disabled = true;

  try {
    const response = await browser.runtime.sendMessage({ type: 'toggleKillSwitch' });
    updateKillSwitchUI(response.isEnabled);
  } catch (error) {
    console.error('[Browser MCP] Failed to toggle kill switch:', error);
  } finally {
    btn.disabled = false;
  }
}

/**
 * Update kill switch UI based on state
 */
function updateKillSwitchUI(isEnabled) {
  const btn = document.getElementById('kill-switch-btn');
  if (isEnabled) {
    btn.textContent = 'Enabled';
    btn.className = 'kill-switch-btn enabled';
  } else {
    btn.textContent = 'Disabled';
    btn.className = 'kill-switch-btn disabled';
  }
}

/**
 * Refresh connection status
 */
async function refreshStatus() {
  const serverStatusEl = document.getElementById('server-status');
  const serverDotEl = document.getElementById('server-dot');
  const serverTextEl = document.getElementById('server-text');
  const tabCountEl = document.getElementById('tab-count');
  const currentUrlEl = document.getElementById('current-url');

  // Show loading state
  serverTextEl.textContent = 'Checking...';
  serverDotEl.className = 'status-dot unknown';

  try {
    // Get status from background script
    const status = await browser.runtime.sendMessage({ type: 'getStatus' });

    // Update server status
    if (status.isServerRunning && status.isKillSwitchEnabled) {
      serverTextEl.textContent = 'Connected';
      serverDotEl.className = 'status-dot connected';
      serverStatusEl.className = 'status-value connected';
    } else {
      serverTextEl.textContent = status.isKillSwitchEnabled ? 'Disconnected' : 'Paused';
      serverDotEl.className = 'status-dot disconnected';
      serverStatusEl.className = 'status-value disconnected';
    }

    // Update kill switch UI
    updateKillSwitchUI(status.isKillSwitchEnabled);

    // Get tab count
    const tabs = await browser.tabs.query({});
    tabCountEl.textContent = tabs.length.toString();

    // Get current tab URL
    const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTabs.length > 0) {
      const url = activeTabs[0].url;
      currentUrlEl.textContent = url.length > 30 ? url.slice(0, 30) + '...' : url;
      currentUrlEl.title = url;
    }
  } catch (error) {
    console.error('[Browser MCP] Failed to get status:', error);
    serverTextEl.textContent = 'Error';
    serverDotEl.className = 'status-dot disconnected';
    serverStatusEl.className = 'status-value disconnected';
  }
}

/**
 * Open documentation
 */
function openDocs() {
  browser.tabs.create({
    url: 'https://docs.browsermcp.io'
  });
}

/**
 * Format URL for display
 */
function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url.slice(0, 30);
  }
}
