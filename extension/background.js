/**
 * Background script for Browser MCP Firefox extension
 * Manages WebSocket server and routes commands between MCP server and content scripts
 */

// Configuration
const CONFIG = {
  DEFAULT_PORT: 3456,
  RECONNECT_INTERVAL: 5000,
  MAX_RECONNECT_ATTEMPTS: 10
};

const ICON_PATHS = {
  connected: {
    64: 'icons/state_connected_64.png',
    128: 'icons/state_connected_128.png'
  },
  disconnected: {
    64: 'icons/state_disconnected_64.png',
    128: 'icons/state_disconnected_128.png'
  },
  off: {
    64: 'icons/state_off_64.png',
    128: 'icons/state_off_128.png'
  }
};

// State
let serverSocket = null;
let isServerRunning = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let wsConnection = null; // Track WebSocket connection for kill switch
let isKillSwitchEnabled = true; // Kill switch state (default: enabled)
let sessionTabId = null; // Bound tab for current MCP session

/**
 * Initialize the extension
 */
function init() {
  console.log('[Browser MCP] Background script initialized');
  updateToolbarIcon();
  loadPortFromStorage().then(port => {
    startWebSocketServer(port);
  });
}

/**
 * Set toolbar icon based on extension state
 */
function updateToolbarIcon() {
  const iconState = !isKillSwitchEnabled
    ? 'off'
    : (isServerRunning ? 'connected' : 'disconnected');

  browser.browserAction.setIcon({ path: ICON_PATHS[iconState] }).catch((error) => {
    console.error('[Browser MCP] Failed to update toolbar icon:', error);
  });
}

/**
 * Resolve target tab for MCP commands (session-bound only)
 */
function resolveTargetTabId(params) {
  if (params && Object.prototype.hasOwnProperty.call(params, 'tabId')) {
    throw new Error('tabId overrides are not supported. Browser MCP uses the bound session tab.');
  }

  if (!sessionTabId) {
    throw new Error('Session tab unavailable. Reconnect Browser MCP while focused on the tab you want to control.');
  }

  return sessionTabId;
}

/**
 * Bind current active tab to this MCP session
 */
async function bindSessionTab() {
  const activeTab = await getActiveTab();
  if (!activeTab || !activeTab.id) {
    throw new Error('No active tab found to bind Browser MCP session.');
  }

  sessionTabId = activeTab.id;
  console.log(`[Browser MCP] Session tab bound: ${sessionTabId}`);
}

/**
 * Load configured port from storage
 */
async function loadPortFromStorage() {
  try {
    const result = await browser.storage.local.get('serverPort');
    return result.serverPort || CONFIG.DEFAULT_PORT;
  } catch (error) {
    console.error('[Browser MCP] Failed to load port from storage:', error);
    return CONFIG.DEFAULT_PORT;
  }
}

/**
 * Start the WebSocket server (connect to MCP server)
 */
function startWebSocketServer(port) {
  // Clear any pending reconnect timer before checking state
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (isServerRunning) {
    console.log('[Browser MCP] Server already running');
    return;
  }

  if (!isKillSwitchEnabled) {
    console.log('[Browser MCP] Kill switch disabled, not connecting');
    updateToolbarIcon();
    return;
  }

  console.log(`[Browser MCP] Starting WebSocket server on port ${port}`);

  try {
    // Connect to MCP server WebSocket
    wsConnection = new WebSocket(`ws://localhost:${port}`);

    wsConnection.onopen = async () => {
      console.log('[Browser MCP] Extension connected to MCP server');
      isServerRunning = true;
      reconnectAttempts = 0;
      try {
        await bindSessionTab();
      } catch (error) {
        sessionTabId = null;
        console.error('[Browser MCP] Failed to bind session tab:', error);
      }
      updateToolbarIcon();
    };

    wsConnection.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[Browser MCP] Received command from MCP:', message);

        // Check kill switch before processing
        if (!isKillSwitchEnabled) {
          wsConnection.send(JSON.stringify({
            success: false,
            error: 'Kill switch is disabled. Click the extension icon to resume MCP communications.'
          }));
          return;
        }

        // Handle MCP commands
        if (message.type === 'mcpCommand') {
          const result = await handleBrowserCommand(message.command, message.params);
          wsConnection.send(JSON.stringify(result));
        }
      } catch (error) {
        console.error('[Browser MCP] Error processing message:', error);
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({
            success: false,
            error: error.message
          }));
        }
      }
    };

    wsConnection.onclose = () => {
      const wasConnected = isServerRunning;
      isServerRunning = false;
      wsConnection = null;

      // Determine reason for disconnection
      let reason = 'transport_drop';
      if (!isKillSwitchEnabled) {
        reason = 'kill_switch';
      } else if (reconnectAttempts > 0) {
        reason = 'reconnect';
      }

      if (sessionTabId !== null) {
        console.log(`[Browser MCP] Session ownership cleared (reason: ${reason})`);
        sessionTabId = null;
      }

      console.log(`[Browser MCP] Extension disconnected (reason: ${reason})`);
      updateToolbarIcon();

      // Attempt reconnection if kill switch is still enabled
      if (isKillSwitchEnabled && reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[Browser MCP] Attempting reconnect ${reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS}`);
        reconnectTimer = setTimeout(() => {
          startWebSocketServer(port);
        }, CONFIG.RECONNECT_INTERVAL);
      }
    };

    wsConnection.onerror = (error) => {
      console.error('[Browser MCP] WebSocket error:', error);
      isServerRunning = false;
      updateToolbarIcon();
    };

  } catch (error) {
    console.error('[Browser MCP] Failed to start WebSocket:', error);
    isServerRunning = false;
    updateToolbarIcon();
  }
}

/**
 * Handle browser command
 */
async function handleBrowserCommand(command, params) {
  console.log('[Browser MCP] Handling command:', command, params);

  try {
    switch (command) {
      case 'navigate':
        return await handleNavigate(params);

      case 'click':
        return await handleClick(params);

      case 'type':
        return await handleType(params);

      case 'evaluate':
        return await handleEvaluate(params);

      case 'screenshot':
        return await handleScreenshot(params);

      case 'snapshot':
        return await handleSnapshot(params);

      case 'select_option':
        return await handleSelectOption(params);

      case 'wait':
        return await handleWait(params);

      case 'getTabs':
        return await handleGetTabs();

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error('[Browser MCP] Command failed:', error);
    return { error: error.message, stack: error.stack };
  }
}

/**
 * Navigate to URL
 */
async function handleNavigate(params) {
  const { url } = params;
  const targetTabId = resolveTargetTabId(params);

  await browser.tabs.update(targetTabId, { url });
  await waitForTabLoad(targetTabId);

  return { success: true, url, tabId: targetTabId };
}

/**
 * Click element
 */
async function handleClick(params) {
  const { element } = params;
  const targetTabId = resolveTargetTabId(params);

  const results = await browser.tabs.sendMessage(targetTabId, {
    type: 'executeCommand',
    command: 'click',
    params: { element }
  });

  return results;
}

/**
 * Type text into element
 */
async function handleType(params) {
  const { element, value } = params;
  const targetTabId = resolveTargetTabId(params);

  const results = await browser.tabs.sendMessage(targetTabId, {
    type: 'executeCommand',
    command: 'type',
    params: { element, value }
  });

  return results;
}

/**
 * Execute JavaScript
 */
async function handleEvaluate(params) {
  const { script } = params;
  const targetTabId = resolveTargetTabId(params);

  const results = await browser.tabs.sendMessage(targetTabId, {
    type: 'executeCommand',
    command: 'evaluate',
    params: { script }
  });

  return results;
}

/**
 * Take screenshot
 */
async function handleScreenshot(params) {
  const targetTabId = resolveTargetTabId(params);

  const screenshot = await browser.tabs.captureTab(targetTabId, {
    format: 'png'
  });

  return { success: true, screenshot };
}

/**
 * Get page snapshot (accessibility tree)
 */
async function handleSnapshot(params) {
  const targetTabId = resolveTargetTabId(params);

  const results = await browser.tabs.sendMessage(targetTabId, {
    type: 'executeCommand',
    command: 'snapshot'
  });

  return results;
}

/**
 * Select option from dropdown
 */
async function handleSelectOption(params) {
  const { element, value } = params;
  const targetTabId = resolveTargetTabId(params);

  const results = await browser.tabs.sendMessage(targetTabId, {
    type: 'executeCommand',
    command: 'select_option',
    params: { element, value }
  });

  return results;
}

/**
 * Wait for condition
 */
async function handleWait(params) {
  const { timeout } = params;
  await new Promise(resolve => setTimeout(resolve, timeout));
  return { success: true };
}

/**
 * Get all tabs
 */
async function handleGetTabs() {
  const tabs = await browser.tabs.query({});
  return tabs.map(tab => ({
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active
  }));
}

/**
 * Get active tab
 */
async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) {
    throw new Error('No active tab found');
  }
  return tabs[0];
}

/**
 * Wait for tab to finish loading
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);

    // Timeout fallback
    setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 10000);
  });
}

/**
 * Stop the WebSocket server (kill switch off)
 */
async function stopWebSocketServer(reason = 'kill_switch') {
  // Clear all timers first
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Close WebSocket connection with defensive checks
  if (wsConnection) {
    try {
      if (wsConnection.readyState === WebSocket.OPEN || wsConnection.readyState === WebSocket.CONNECTING) {
        wsConnection.close();
      }
    } catch (error) {
      console.error('[Browser MCP] Error closing WebSocket:', error);
    }
    wsConnection = null;
  }

  // Close session-owned tab if it exists
  if (sessionTabId !== null) {
    try {
      await browser.tabs.remove(sessionTabId);
      console.log(`[Browser MCP] Session tab closed (reason: ${reason})`);
    } catch (error) {
      // Tab may already be closed or no longer exist
      console.log(`[Browser MCP] Session tab already closed or unavailable`);
    }
  }

  // Reset all state
  isServerRunning = false;
  reconnectAttempts = 0;
  const clearedTabId = sessionTabId;
  sessionTabId = null;
  updateToolbarIcon();

  if (clearedTabId !== null) {
    console.log(`[Browser MCP] Session ownership cleared (reason: ${reason})`);
  }
  console.log('[Browser MCP] Server stopped and session cleaned up');
}

/**
 * Toggle kill switch and start/stop MCP communications
 */
async function toggleKillSwitch() {
  isKillSwitchEnabled = !isKillSwitchEnabled;
  console.log('[Browser MCP] Kill switch toggled:', isKillSwitchEnabled ? 'ENABLED' : 'DISABLED');

  if (!isKillSwitchEnabled) {
    await stopWebSocketServer('kill_switch');
    return { isEnabled: isKillSwitchEnabled };
  }

  const port = await loadPortFromStorage();
  startWebSocketServer(port);
  updateToolbarIcon();
  return { isEnabled: isKillSwitchEnabled };
}

/**
 * Handle messages from content scripts
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Browser MCP] Message received:', message);

  if (message.type === 'mcpCommand') {
    // Gate all commands behind kill switch
    if (!isKillSwitchEnabled) {
      sendResponse({
        success: false,
        error: 'Kill switch is disabled. Click the extension icon to resume MCP communications.'
      });
      return false;
    }
    handleBrowserCommand(message.command, message.params)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async
  }

  if (message.type === 'getStatus') {
    sendResponse({
      isServerRunning,
      reconnectAttempts,
      isKillSwitchEnabled,
      sessionTabId
    });
    return false;
  }

  if (message.type === 'toggleKillSwitch') {
    toggleKillSwitch()
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({
        isEnabled: isKillSwitchEnabled,
        error: error.message
      }));
    return true;
  }

  if (message.type === 'getKillSwitchState') {
    sendResponse({ isEnabled: isKillSwitchEnabled });
    return false;
  }

  return false;
});

/**
 * Handle extension installation
 */
browser.runtime.onInstalled.addListener((details) => {
  console.log('[Browser MCP] Extension installed:', details);
  init();
});

// Initialize on startup
init();

browser.tabs.onRemoved.addListener((removedTabId) => {
  if (sessionTabId === removedTabId) {
    console.log(`[Browser MCP] Session ownership cleared (reason: tab_closed)`);
    console.warn('[Browser MCP] Session tab closed; clearing session binding');
    sessionTabId = null;
  }
});

browser.browserAction.onClicked.addListener(() => {
  toggleKillSwitch().catch((error) => {
    console.error('[Browser MCP] Failed to toggle kill switch from toolbar click:', error);
  });
});
