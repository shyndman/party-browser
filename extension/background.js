/**
 * Background script for Browser MCP Firefox extension
 * Manages WebSocket server and routes commands between MCP server and content scripts
 */

// Error codes for machine-readable failure reasons
const ErrorCodes = {
  SESSION_NOT_INITIALIZED: 'SESSION_NOT_INITIALIZED',
  SESSION_TAB_CLOSED: 'SESSION_TAB_CLOSED',
  EXPLICIT_TABID_NOT_SUPPORTED: 'EXPLICIT_TABID_NOT_SUPPORTED',
  TRANSPORT_UNAVAILABLE: 'TRANSPORT_UNAVAILABLE',
  COMMAND_FAILED: 'COMMAND_FAILED',
  KILL_SWITCH_DISABLED: 'KILL_SWITCH_DISABLED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

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
let sessionTabClosed = false; // Flag to track if session tab was closed

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
async function resolveTargetTabId(params) {
  if (params && Object.prototype.hasOwnProperty.call(params, 'tabId')) {
    const error = new Error('tabId overrides are not supported. Browser MCP uses the session-owned tab.');
    error.errorCode = ErrorCodes.EXPLICIT_TABID_NOT_SUPPORTED;
    throw error;
  }

  if (sessionTabId === null) {
    const error = new Error('Session not initialized. Run browser_navigate first to create a session tab.');
    error.errorCode = ErrorCodes.SESSION_NOT_INITIALIZED;
    throw error;
  }

  // Verify the session tab still exists
  try {
    await browser.tabs.get(sessionTabId);
  } catch (error) {
    const err = new Error('Session tab was closed. Run browser_navigate to create a new session tab.');
    err.errorCode = ErrorCodes.SESSION_TAB_CLOSED;
    throw err;
  }

  return sessionTabId;
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
      // Note: sessionTabId is NOT auto-restored on reconnect
      // Session must be initialized via browser_navigate
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
            error: 'Kill switch is disabled. Click the extension icon to resume MCP communications.',
            errorCode: ErrorCodes.KILL_SWITCH_DISABLED
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
            error: error.message,
            errorCode: error.errorCode || ErrorCodes.TRANSPORT_UNAVAILABLE
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

      // Note: sessionTabId is NOT cleared on disconnect
      // Session persists across reconnects until tab is closed or kill switch triggered
      // On reconnect, sessionTabId will remain set until explicitly cleared

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
    return {
      success: false,
      error: error.message,
      errorCode: error.errorCode || ErrorCodes.COMMAND_FAILED,
      stack: error.stack
    };
  }
}

/**
 * Create a new session-owned tab at about:blank in background
 */
async function createSessionTab() {
  // Create tab in background (active: false)
  const tab = await browser.tabs.create({
    url: 'about:blank',
    active: false
  });

  // Wait for the tab to finish loading
  await waitForTabLoad(tab.id);

  // Set initial title prefix
  try {
    await browser.tabs.executeScript(tab.id, {
      code: `document.title = 'OC | Browser MCP Session'`
    });
  } catch (error) {
    // Title setting may fail in some contexts; non-critical
    console.log('[Browser MCP] Could not set initial tab title:', error.message);
  }

  // Add tab to OpenCode Sessions group
  try {
    await addTabToSessionGroup(tab.id);
  } catch (error) {
    // Grouping may fail if API unavailable; non-critical
    console.log('[Browser MCP] Could not add tab to group:', error.message);
  }

  return tab.id;
}

/**
 * Add tab to OpenCode Sessions tab group
 */
async function addTabToSessionGroup(tabId) {
  // Check if tabGroups API is available
  if (!browser.tabGroups) {
    console.log('[Browser MCP] Tab groups API not available');
    return;
  }

  try {
    // Query for existing groups with 'OpenCode' or 'OC' in title
    const groups = await browser.tabGroups.query({});
    const existingGroup = groups.find(g =>
      g.title && (g.title.includes('OpenCode') || g.title.includes('OC'))
    );

    if (existingGroup) {
      // Add to existing group
      await browser.tabs.group({
        tabIds: tabId,
        groupId: existingGroup.id
      });
      console.log(`[Browser MCP] Added tab ${tabId} to existing group: ${existingGroup.title}`);
    } else {
      // Create new group
      const groupId = await browser.tabs.group({
        tabIds: tabId
      });
      await browser.tabGroups.update(groupId, {
        title: 'OpenCode Sessions',
        color: 'blue'
      });
      console.log(`[Browser MCP] Created new tab group: OpenCode Sessions`);
    }
  } catch (error) {
    console.error('[Browser MCP] Failed to manage tab group:', error);
  }
}

/**
 * Navigate to URL - creates session tab on first navigate, reuses on subsequent
 */
async function handleNavigate(params) {
  const { url } = params;

  let targetTabId;

  if (sessionTabId === null) {
    // First navigate or after tab closure: create session tab at about:blank in background
    console.log('[Browser MCP] Creating session tab at about:blank');
    targetTabId = await createSessionTab();
    sessionTabId = targetTabId;
    sessionTabClosed = false; // Clear the closure flag
    console.log(`[Browser MCP] Session tab created: ${sessionTabId}`);
  } else {
    // Subsequent navigate: reuse existing session tab
    targetTabId = sessionTabId;

    // Verify the tab still exists
    try {
      await browser.tabs.get(targetTabId);
    } catch (error) {
      // Tab was closed
      console.log('[Browser MCP] Prior session tab closed; creating new session tab');
      targetTabId = await createSessionTab();
      sessionTabId = targetTabId;
    }
  }

  // Navigate to the target URL
  await browser.tabs.update(targetTabId, { url });
  await waitForTabLoad(targetTabId);

  // Update title with page title prefixed
  try {
    await browser.tabs.executeScript(targetTabId, {
      code: `document.title = 'OC | ' + document.title`
    });
  } catch (error) {
    // Title setting may fail; non-critical
    console.log('[Browser MCP] Could not update tab title:', error.message);
  }

  return { success: true, url, tabId: targetTabId };
}

/**
 * Click element
 */
async function handleClick(params) {
  const { element } = params;
  const targetTabId = await resolveTargetTabId(params);

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
  const targetTabId = await resolveTargetTabId(params);

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
  const targetTabId = await resolveTargetTabId(params);

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
  const targetTabId = await resolveTargetTabId(params);

  const screenshot = await browser.tabs.captureTab(targetTabId, {
    format: 'png'
  });

  return { success: true, screenshot };
}

/**
 * Get page snapshot (accessibility tree)
 */
async function handleSnapshot(params) {
  const targetTabId = await resolveTargetTabId(params);

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
  const targetTabId = await resolveTargetTabId(params);

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
        error: 'Kill switch is disabled. Click the extension icon to resume MCP communications.',
        errorCode: ErrorCodes.KILL_SWITCH_DISABLED
      });
      return false;
    }
    handleBrowserCommand(message.command, message.params)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({
        success: false,
        error: error.message,
        errorCode: error.errorCode || ErrorCodes.COMMAND_FAILED
      }));
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
    sessionTabClosed = true;

    // Notify MCP server if connection is active
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      try {
        wsConnection.send(JSON.stringify({
          type: 'session_lost',
          reason: 'tab_closed',
          message: 'Session tab was closed'
        }));
      } catch (error) {
        console.log('[Browser MCP] Failed to notify server of session loss:', error.message);
      }
    }
  }
});

browser.browserAction.onClicked.addListener(() => {
  toggleKillSwitch().catch((error) => {
    console.error('[Browser MCP] Failed to toggle kill switch from toolbar click:', error);
  });
});
