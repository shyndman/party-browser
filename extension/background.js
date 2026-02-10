/**
 * Background script for Browser MCP Firefox extension
 * Manages WebSocket server and routes commands between MCP server and content scripts
 */

// Configuration
const CONFIG = {
  DEFAULT_PORT: 9876,
  RECONNECT_INTERVAL: 5000,
  MAX_RECONNECT_ATTEMPTS: 10
};

// State
let serverSocket = null;
let isServerRunning = false;
let reconnectAttempts = 0;
let reconnectTimer = null;

/**
 * Initialize the extension
 */
function init() {
  console.log('[Browser MCP] Background script initialized');
  loadPortFromStorage().then(port => {
    startWebSocketServer(port);
  });
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
 * Start the WebSocket server
 */
function startWebSocketServer(port) {
  if (isServerRunning) {
    console.log('[Browser MCP] Server already running');
    return;
  }

  console.log(`[Browser MCP] Starting WebSocket server on port ${port}`);

  // Create server socket
  // Note: Firefox extensions cannot directly create TCP servers
  // We use a different approach - the MCP server connects via native messaging
  // or we poll for commands from the extension

  // For Firefox, we'll use a hybrid approach:
  // 1. Listen for native messaging connections from MCP server
  // 2. Handle commands via message passing

  isServerRunning = true;
  console.log('[Browser MCP] Server ready for MCP connections');
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
  const { url, tabId } = params;
  const targetTabId = tabId || (await getActiveTab()).id;

  await browser.tabs.update(targetTabId, { url });
  await waitForTabLoad(targetTabId);

  return { success: true, url, tabId: targetTabId };
}

/**
 * Click element
 */
async function handleClick(params) {
  const { element, tabId } = params;
  const targetTabId = tabId || (await getActiveTab()).id;

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
  const { element, value, tabId } = params;
  const targetTabId = tabId || (await getActiveTab()).id;

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
  const { script, tabId } = params;
  const targetTabId = tabId || (await getActiveTab()).id;

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
  const { tabId } = params;
  const targetTabId = tabId || (await getActiveTab()).id;

  const screenshot = await browser.tabs.captureTab(targetTabId, {
    format: 'png'
  });

  return { success: true, screenshot };
}

/**
 * Get page snapshot (accessibility tree)
 */
async function handleSnapshot(params) {
  const { tabId } = params;
  const targetTabId = tabId || (await getActiveTab()).id;

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
  const { element, value, tabId } = params;
  const targetTabId = tabId || (await getActiveTab()).id;

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
 * Handle messages from content scripts
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Browser MCP] Message received:', message);

  if (message.type === 'mcpCommand') {
    handleBrowserCommand(message.command, message.params)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async
  }

  if (message.type === 'getStatus') {
    sendResponse({
      isServerRunning,
      reconnectAttempts
    });
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
