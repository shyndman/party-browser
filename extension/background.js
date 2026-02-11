/**
 * Background script for Browser MCP Firefox extension
 * Manages WebSocket server and routes commands between MCP server and content scripts
 *
 * SESSION MODEL ARCHITECTURE (Phase 02.1)
 * ======================================
 *
 * Session Lifecycle States:
 * - UNINITIALIZED: No session tab exists (sessionTabId === null)
 * - NAVIGATING: Navigate command in progress, tab created/updated
 * - ACTIVE: Session tab exists and is ready for commands
 * - CLOSED: Session tab was closed or kill switch triggered
 *
 * State Transitions:
 * - UNINITIALIZED -> NAVIGATING: First browser_navigate call creates session tab
 * - NAVIGATING -> ACTIVE: Navigation completes (page load finished)
 * - ACTIVE -> CLOSED: Tab closed by user or kill switch
 * - CLOSED -> UNINITIALIZED: Session cleared, ready for new navigate
 *
 * Key Invariants:
 * - One session tab per MCP connection (no multi-session support)
 * - Session persists across reconnects until tab closed
 * - Navigate command required to re-initialize after tab closure
 * - No in-flight request retry after transport drop
 *
 * PHASE 3 INTEGRATION POINTS (Handoff and Repeatable Execution)
 * =============================================================
 *
 * Phase 3 features implemented:
 * - Session ID generation on first navigate (timestamp + random suffix)
 * - Console message capture via content script with ring buffer (1000 entries)
 * - Network activity capture via webRequest API per session tab
 * - Selector artifact export with metadata, console, and network data
 * - Session-scoped storage with automatic cleanup on tab close/transport drop
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
let sessionId = null; // Unique session identifier
let sessionStartTime = null; // When session started (for duration calculation)

// Session-scoped network and console capture (Phase 03.1)
const MAX_LOG_SIZE = 1000; // Maximum entries per session (ring buffer)

// Map to store network request data per session (key: sessionTabId, value: array of request objects)
const sessionNetworkLogs = new Map();

// Track active network capture listener
let networkCaptureListener = null;

// Map to store console logs per session
const sessionConsoleLogs = new Map();

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

// ============================================================
// SESSION-SCOPED NETWORK CAPTURE (Phase 03.1)
// ============================================================

/**
 * Start network capture for a specific tab/session
 * Uses webRequest API to capture network activity
 * @param {number} tabId - The session tab ID to capture
 */
function startNetworkCapture(tabId) {
  // Stop any existing capture first
  stopNetworkCapture();

  console.log(`[Browser MCP] Starting network capture for tab ${tabId}`);

  // Initialize log storage for this session
  sessionNetworkLogs.set(tabId, []);

  // Capture request started
  const onBeforeRequest = (details) => {
    if (details.tabId !== tabId) return;

    const logs = sessionNetworkLogs.get(tabId);
    if (!logs) return;

    // Create request entry
    const requestEntry = {
      requestId: details.requestId,
      url: details.url,
      method: details.method,
      type: details.type,
      timestamp: details.timeStamp,
      requestBody: details.requestBody || null,
      statusCode: null,
      responseHeaders: null,
      error: null
    };

    // Add to buffer with ring buffer behavior
    logs.push(requestEntry);
    if (logs.length > MAX_LOG_SIZE) {
      logs.shift(); // Remove oldest entry
    }
  };

  // Capture request completed
  const onCompleted = (details) => {
    if (details.tabId !== tabId) return;

    const logs = sessionNetworkLogs.get(tabId);
    if (!logs) return;

    // Find and update the request entry
    const entry = logs.find(r => r.requestId === details.requestId);
    if (entry) {
      entry.statusCode = details.statusCode;
      entry.responseHeaders = details.responseHeaders;
    }
  };

  // Capture request errors
  const onErrorOccurred = (details) => {
    if (details.tabId !== tabId) return;

    const logs = sessionNetworkLogs.get(tabId);
    if (!logs) return;

    // Find and update the request entry
    const entry = logs.find(r => r.requestId === details.requestId);
    if (entry) {
      entry.error = details.error;
    }
  };

  // Register listeners
  browser.webRequest.onBeforeRequest.addListener(
    onBeforeRequest,
    { urls: ['<all_urls>'], tabId },
    ['requestBody']
  );

  browser.webRequest.onCompleted.addListener(
    onCompleted,
    { urls: ['<all_urls>'], tabId },
    ['responseHeaders']
  );

  browser.webRequest.onErrorOccurred.addListener(
    onErrorOccurred,
    { urls: ['<all_urls>'], tabId }
  );

  // Store references for cleanup
  networkCaptureListener = {
    tabId,
    onBeforeRequest,
    onCompleted,
    onErrorOccurred
  };
}

/**
 * Stop network capture and clear listeners
 */
function stopNetworkCapture() {
  if (networkCaptureListener) {
    const { onBeforeRequest, onCompleted, onErrorOccurred } = networkCaptureListener;

    try {
      browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
    } catch (e) {
      // Listener may not exist
    }

    try {
      browser.webRequest.onCompleted.removeListener(onCompleted);
    } catch (e) {
      // Listener may not exist
    }

    try {
      browser.webRequest.onErrorOccurred.removeListener(onErrorOccurred);
    } catch (e) {
      // Listener may not exist
    }

    console.log(`[Browser MCP] Stopped network capture for tab ${networkCaptureListener.tabId}`);
    networkCaptureListener = null;
  }
}

/**
 * Clear session network logs
 * @param {number} tabId - The session tab ID
 */
function clearSessionNetworkLogs(tabId) {
  if (tabId !== null) {
    sessionNetworkLogs.delete(tabId);
  }
  // Clear all if no specific tab (full cleanup)
  if (tabId === undefined) {
    sessionNetworkLogs.clear();
  }
}

/**
 * Get network requests for current session
 * @param {Object} filter - Optional filter { types: string[], urlPattern: string }
 * @returns {Array} Filtered network request logs
 */
function getSessionNetworkRequests(filter = {}) {
  if (sessionTabId === null) {
    return [];
  }

  let logs = sessionNetworkLogs.get(sessionTabId) || [];

  // Apply type filter
  if (filter.types && filter.types.length > 0) {
    logs = logs.filter(r => filter.types.includes(r.type));
  }

  // Apply URL pattern filter (simple substring match)
  if (filter.urlPattern) {
    const pattern = filter.urlPattern.toLowerCase();
    logs = logs.filter(r => r.url.toLowerCase().includes(pattern));
  }

  return logs;
}

/**
 * Clear session console logs
 * @param {number} tabId - The session tab ID
 */
function clearSessionConsoleLogs(tabId) {
  if (tabId !== null) {
    sessionConsoleLogs.delete(tabId);
  }
  // Clear all if no specific tab (full cleanup)
  if (tabId === undefined) {
    sessionConsoleLogs.clear();
  }
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
          const killSwitchResponse = {
            success: false,
            error: 'Kill switch is disabled. Click the extension icon to resume MCP communications.',
            errorCode: ErrorCodes.KILL_SWITCH_DISABLED
          };
          console.log('[Browser MCP] Sending kill switch response to MCP:', killSwitchResponse);
          wsConnection.send(JSON.stringify(killSwitchResponse));
          return;
        }

        // Handle MCP commands (wrapped in mcpCommand envelope)
        if (message.type === 'mcpCommand') {
          const result = await handleBrowserCommand(message.command, message.params);
          console.log('[Browser MCP] Sending response to MCP:', result);
          wsConnection.send(JSON.stringify(result));
          return;
        }

        // Handle direct browser_* message types from MCP tools
        const directMessageTypes = {
          // Navigation
          'browser_navigate': 'navigate',
          'browser_go_back': 'go_back',
          'browser_go_forward': 'go_forward',
          // Interaction
          'browser_click': 'click',
          'browser_drag': 'drag',
          'browser_hover': 'hover',
          'browser_type': 'type',
          'browser_press_key': 'press_key',
          'browser_select_option': 'select_option',
          // Waiting
          'browser_wait': 'wait',
          'browser_wait_for': 'wait_for',
          // Capture
          'browser_screenshot': 'screenshot',
          'browser_snapshot': 'snapshot',
          'browser_get_console_logs': 'getConsoleLogs',
          // Evaluation
          'browser_evaluate': 'evaluate',
          // Session
          'browser_close': 'close',
          // State
          'getUrl': 'getUrl',
          'getTitle': 'getTitle',
          // Phase 3 features
          'browser_get_network_requests': 'getNetworkRequests',
          'browser_get_console_messages': 'getConsoleMessages',
          'browser_export_selectors': 'export_selectors'
        };

        if (directMessageTypes[message.type]) {
          const command = directMessageTypes[message.type];
          const result = await handleBrowserCommand(command, message.payload || {});
          const responsePayload = { id: message.id, result: result, error: result.success ? undefined : result.error, errorCode: result.errorCode };
          console.log('[Browser MCP] Sending response to MCP:', responsePayload);
          wsConnection.send(JSON.stringify(responsePayload));
          return;
        }

        // Unknown message type
        const unknownTypeResponse = { id: message.id, success: false, error: `Unknown message type: ${message.type}`, errorCode: ErrorCodes.COMMAND_FAILED };
        console.log('[Browser MCP] Sending error response to MCP:', unknownTypeResponse);
        wsConnection.send(JSON.stringify(unknownTypeResponse));
      } catch (error) {
        console.error('[Browser MCP] Error processing message:', error);
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          const errorResponse = { success: false, error: error.message, errorCode: error.errorCode || ErrorCodes.TRANSPORT_UNAVAILABLE };
          console.log('[Browser MCP] Sending error response to MCP:', errorResponse);
          wsConnection.send(JSON.stringify(errorResponse));
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

      // Session ownership cleared on disconnect - requires fresh navigate after reconnect
      // Per locked decision: session is NOT auto-reused after reconnect
      const clearedTabId = sessionTabId;
      sessionTabId = null;
      sessionId = null;
      sessionStartTime = null;
      if (clearedTabId !== null) {
        console.log(`[Browser MCP] Session ownership cleared (reason: ${reason})`);
      }

      // Note: No in-flight request retry - commands will fail immediately
      console.warn(`[Browser MCP] Extension disconnected (reason: ${reason}); pending commands will fail. Reconnecting...`);
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

      case 'getNetworkRequests':
        return await handleGetNetworkRequests(params);

      case 'getConsoleMessages':
        return await handleGetConsoleMessages(params);

      case 'export_selectors':
        return await handleExportSelectors(params);

      case 'go_back':
        return await handleGoBack(params);

      case 'go_forward':
        return await handleGoForward(params);

      case 'press_key':
        return await handlePressKey(params);

      case 'wait_for':
        return await handleWaitFor(params);

      case 'drag':
        return await handleDrag(params);

      case 'hover':
        return await handleHover(params);

      case 'close':
        return await handleClose(params);

      case 'getUrl':
        return await handleGetUrl(params);

      case 'getTitle':
        return await handleGetTitle(params);

      case 'getConsoleLogs':
        return await handleGetConsoleLogs(params);

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

    // Generate session ID on first navigate (Phase 03.2)
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStartTime = Date.now();
    console.log(`[Browser MCP] Session started: ${sessionId}`);

    console.log(`[Browser MCP] Session tab created: ${sessionTabId}`);

    // Start network capture for this session
    startNetworkCapture(sessionTabId);
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
 * Get network requests for current session
 */
async function handleGetNetworkRequests(params = {}) {
  const targetTabId = await resolveTargetTabId(params);

  // Get filtered network logs
  const { filter } = params;
  const logs = getSessionNetworkRequests(filter);

  // Format response
  const formatted = logs.map(r => ({
    id: r.requestId,
    url: r.url,
    method: r.method,
    type: r.type,
    status: r.statusCode,
    timestamp: r.timestamp,
    error: r.error
  }));

  return {
    success: true,
    count: formatted.length,
    requests: formatted
  };
}

/**
 * Get console messages for current session
 */
async function handleGetConsoleMessages(params = {}) {
  const targetTabId = await resolveTargetTabId(params);

  // Request logs from content script
  let logs = [];
  try {
    const response = await browser.tabs.sendMessage(targetTabId, {
      type: 'getConsoleLogs',
      clear: false
    });
    if (response && response.success) {
      logs = response.logs || [];
    }
  } catch (error) {
    console.log('[Browser MCP] Content script not available for console logs:', error.message);
  }

  // Apply level filter
  if (params.level && params.level !== 'all') {
    logs = logs.filter(l => l.level === params.level);
  }

  // Apply time filter (since timestamp)
  if (params.since) {
    logs = logs.filter(l => l.timestamp >= params.since);
  }

  return {
    success: true,
    count: logs.length,
    logs: logs.map(l => ({
      level: l.level,
      message: l.message,
      timestamp: l.timestamp,
      stack: l.stack
    }))
  };
}

/**
 * Export selectors as JSON artifact
 */
async function handleExportSelectors(params) {
  // Check if session exists
  if (!sessionId) {
    return {
      success: false,
      error: 'Session not initialized. Run browser_navigate first to create a session.',
      errorCode: ErrorCodes.SESSION_NOT_INITIALIZED
    };
  }

  const targetTabId = await resolveTargetTabId(params);

  const {
    name,
    steps,
    includeMetadata = true,
    includeConsole = false,
    includeNetwork = false
  } = params;

  // Validate name
  if (!name || typeof name !== 'string') {
    return {
      success: false,
      error: 'Name parameter is required',
      errorCode: ErrorCodes.COMMAND_FAILED
    };
  }

  // Sanitize name for filename use
  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);

  // Get current URL for initialUrl
  let initialUrl = '';
  try {
    const tab = await browser.tabs.get(targetTabId);
    initialUrl = tab.url || '';
  } catch (error) {
    console.log('[Browser MCP] Could not get tab URL:', error.message);
  }

  // Map input steps to SelectorStep format
  const mappedSteps = steps.map((step, index) => {
    const baseStep = {
      type: step.action,
      description: step.description || `${step.action} step ${index + 1}`
    };

    switch (step.action) {
      case 'navigate':
        return {
          ...baseStep,
          url: step.value || step.target || initialUrl
        };

      case 'click':
        return {
          ...baseStep,
          selectors: [parseSelector(step.target)]
        };

      case 'type':
        return {
          ...baseStep,
          selectors: [parseSelector(step.target)],
          value: step.value || ''
        };

      case 'select':
        return {
          ...baseStep,
          selectors: [parseSelector(step.target)],
          option: step.value || ''
        };

      case 'wait':
        // Wait can be time-based (numeric) or selector-based
        const isTimeBased = step.value && !isNaN(parseInt(step.value));
        return {
          ...baseStep,
          mode: isTimeBased ? 'time' : 'selector',
          value: isTimeBased ? parseInt(step.value) : (step.target || step.value || '')
        };

      case 'extract':
        return {
          ...baseStep,
          name: step.target || `extract_${index}`,
          selectors: [parseSelector(step.target)]
        };

      default:
        return baseStep;
    }
  });

  // Calculate session duration
  const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;

  // Aggregate metadata
  const networkLogs = sessionNetworkLogs.get(targetTabId) || [];
  const consoleLogs = sessionConsoleLogs.get(targetTabId) || [];

  const metadata = {
    networkRequestCount: networkLogs.length,
    consoleErrorCount: consoleLogs.filter(l => l.level === 'error').length,
    consoleWarnCount: consoleLogs.filter(l => l.level === 'warn').length,
    sessionDuration
  };

  // Build artifact
  const artifact = {
    version: '1.0',
    title: sanitizedName,
    createdAt: new Date().toISOString(),
    sessionId,
    initialUrl,
    steps: mappedSteps,
    metadata
  };

  // Optionally include recent console logs (last 50)
  if (includeConsole && consoleLogs.length > 0) {
    artifact.console = consoleLogs.slice(-50).map(l => ({
      level: l.level,
      message: l.message,
      timestamp: l.timestamp,
      stack: l.stack
    }));
  }

  // Optionally include recent network requests (last 50)
  if (includeNetwork && networkLogs.length > 0) {
    artifact.network = networkLogs.slice(-50).map(r => ({
      requestId: r.requestId,
      url: r.url,
      method: r.method,
      type: r.type,
      timestamp: r.timestamp,
      statusCode: r.statusCode,
      error: r.error
    }));
  }

  console.log(`[Browser MCP] Exported artifact: ${sanitizedName} (${mappedSteps.length} steps)`);

  return {
    success: true,
    artifact
  };
}

/**
 * Navigate back in history
 */
async function handleGoBack(params) {
  const targetTabId = await resolveTargetTabId(params);
  await browser.tabs.goBack(targetTabId);
  return { success: true };
}

/**
 * Navigate forward in history
 */
async function handleGoForward(params) {
  const targetTabId = await resolveTargetTabId(params);
  await browser.tabs.goForward(targetTabId);
  return { success: true };
}

/**
 * Press a key (simulates keyboard key press)
 */
async function handlePressKey(params) {
  const { key } = params;
  const targetTabId = await resolveTargetTabId(params);

  const results = await browser.tabs.sendMessage(targetTabId, {
    type: 'executeCommand',
    command: 'press_key',
    params: { key }
  });

  return results;
}

/**
 * Wait for condition (time, text appearance, or text disappearance)
 */
async function handleWaitFor(params) {
  const { mode, value, timeout } = params;
  const targetTabId = await resolveTargetTabId(params);

  const results = await browser.tabs.sendMessage(targetTabId, {
    type: 'executeCommand',
    command: 'wait_for',
    params: { mode, value, timeout }
  });

  return results;
}

/**
 * Drag element from source to target
 */
async function handleDrag(params) {
  const { startElement, endElement } = params;
  const targetTabId = await resolveTargetTabId(params);

  const results = await browser.tabs.sendMessage(targetTabId, {
    type: 'executeCommand',
    command: 'drag',
    params: { startElement, endElement }
  });

  return results;
}

/**
 * Hover over element
 */
async function handleHover(params) {
  const { element } = params;
  const targetTabId = await resolveTargetTabId(params);

  const results = await browser.tabs.sendMessage(targetTabId, {
    type: 'executeCommand',
    command: 'hover',
    params: { element }
  });

  return results;
}

/**
 * Close session and terminate tab
 */
async function handleClose(params) {
  const targetTabId = await resolveTargetTabId(params);
  await stopWebSocketServer('user_close');
  return { success: true, message: 'Session closed' };
}

/**
 * Get current URL
 */
async function handleGetUrl(params) {
  const targetTabId = await resolveTargetTabId(params);
  const tab = await browser.tabs.get(targetTabId);
  return { success: true, url: tab.url };
}

/**
 * Get page title
 */
async function handleGetTitle(params) {
  const targetTabId = await resolveTargetTabId(params);
  const tab = await browser.tabs.get(targetTabId);
  return { success: true, title: tab.title };
}

/**
 * Get console logs for current session
 */
async function handleGetConsoleLogs(params) {
  const targetTabId = await resolveTargetTabId(params);

  const response = await browser.tabs.sendMessage(targetTabId, {
    type: 'getConsoleLogs',
    clear: false
  });

  if (!response || !response.success) {
    return {
      success: false,
      error: 'Failed to get console logs',
      errorCode: ErrorCodes.COMMAND_FAILED
    };
  }

  return {
    success: true,
    count: response.logs.length,
    logs: response.logs
  };
}

/**
 * Parse a selector string into SelectorDefinition format
 * Supports prefixes: css:, xpath:, text:, and eN (element ref) format
 */
function parseSelector(target) {
  if (!target) {
    return { type: 'text', value: '' };
  }

  // Check for prefixes
  if (target.startsWith('css:')) {
    return {
      type: 'css',
      value: target.slice(4)
    };
  }

  if (target.startsWith('xpath:')) {
    return {
      type: 'xpath',
      value: target.slice(6)
    };
  }

  if (target.startsWith('text:')) {
    return {
      type: 'text',
      value: target.slice(5)
    };
  }

  // Check for element ref format (e.g., "e12", "42")
  if (/^e?\d+$/.test(target)) {
    return {
      type: 'ref',
      value: target.startsWith('e') ? target : `e${target}`
    };
  }

  // Default to text matching
  return {
    type: 'text',
    value: target
  };
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

  // Stop network capture and clear logs
  stopNetworkCapture();
  clearSessionNetworkLogs(sessionTabId);
  clearSessionConsoleLogs(sessionTabId);

  // Reset all state
  // Session ownership cleared on kill switch - requires fresh navigate to re-establish
  isServerRunning = false;
  reconnectAttempts = 0;
  const clearedTabId = sessionTabId;
  sessionTabId = null;
  sessionId = null;
  sessionStartTime = null;
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
    // Session ownership cleared on tab close - requires fresh navigate to establish new session
    console.log(`[Browser MCP] Session ownership cleared (reason: tab_closed)`);
    console.warn('[Browser MCP] Session tab closed; clearing session binding');
    
    // Stop capture and clear logs for this session
    stopNetworkCapture();
    clearSessionNetworkLogs(sessionTabId);
    clearSessionConsoleLogs(sessionTabId);
    
    sessionTabId = null;
    sessionTabClosed = true;
    sessionId = null;
    sessionStartTime = null;

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
