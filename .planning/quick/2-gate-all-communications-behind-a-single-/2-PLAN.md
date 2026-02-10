---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - extension/background.js
  - extension/popup.html
  - extension/popup.js
  - src/server.ts
autonomous: true
must_haves:
  truths:
    - User can click extension icon to toggle kill switch
    - When kill switch is OFF, all MCP tool calls are rejected with clear error
    - When kill switch is toggled OFF, WebSocket connection is closed
    - When kill switch is toggled ON, WebSocket reconnects automatically
    - Extension popup shows current kill switch state
  artifacts:
    - path: "extension/background.js"
      provides: "Kill switch state management and message gating"
      contains: "isEnabled flag, toggle handler, connection management"
    - path: "extension/popup.html"
      provides: "Kill switch UI toggle"
      contains: "kill switch button, status indicators"
    - path: "extension/popup.js"
      provides: "Kill switch UI interactions"
      contains: "toggle messaging, status updates"
    - path: "src/server.ts"
      provides: "Graceful disconnect handling"
      contains: "close event handler, context cleanup"
  key_links:
    - from: "extension/popup.js"
      to: "extension/background.js"
      via: "browser.runtime.sendMessage({ type: 'toggleKillSwitch' })"
    - from: "extension/background.js"
      to: "src/server.ts"
      via: "WebSocket connection close/open events"
    - from: "src/server.ts"
      to: "extension/background.js"
      via: "WebSocket message routing"
---

<objective>
Implement a kill switch mechanism controlled from the extension popup that gates all MCP communications. When disabled, the extension closes its WebSocket connection and rejects all incoming commands. When re-enabled, it automatically reconnects to the MCP server.

Purpose: Give users immediate control over browser automation access with a single click
Output: Working kill switch in extension popup that stops/resumes all MCP communications
</objective>

<execution_context>
@./.opencode/get-shit-done/workflows/execute-plan.md
@./.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@./extension/background.js
@./extension/popup.js
@./extension/popup.html
@./src/server.ts
@./src/context.ts
@./src/ws.ts
</context>

<tasks>

<task type="auto">
  <name>Add kill switch state and gating to background script</name>
  <files>extension/background.js</files>
  <action>
    Modify extension/background.js to implement kill switch functionality:
    
    1. Add state variables at the top (after existing state):
       - `isKillSwitchEnabled` (default: true)
       - `wsConnection` (to track the WebSocket connection)
    
    2. Modify the message handler to add:
       - Handler for `toggleKillSwitch` message type that:
         * Toggles `isKillSwitchEnabled`
         * If disabled: close WebSocket connection, set `isServerRunning = false`
         * If enabled: call `startWebSocketServer()` to reconnect
         * Returns the new state
       - Handler for `getKillSwitchState` that returns current state
    
    3. Modify the existing `mcpCommand` handler to:
       - Check `isKillSwitchEnabled` first
       - If disabled, return `{ success: false, error: 'Kill switch is disabled. Enable it via the extension popup to resume MCP communications.' }`
       - Only process commands if enabled
    
    4. Track the WebSocket connection in `startWebSocketServer` and store it in `wsConnection` so it can be closed later.
    
    5. Add `stopWebSocketServer()` function that:
       - Closes `wsConnection` if it exists
       - Sets `isServerRunning = false`
       - Clears `wsConnection`
  </action>
  <verify>
    - Open extension/popup.html in browser
    - Check background script loads without errors
    - Verify `browser.runtime.sendMessage({ type: 'getKillSwitchState' })` returns `{ isEnabled: true }`
  </verify>
  <done>
    Background script has kill switch state, toggle handlers, and gates all mcpCommand messages. WebSocket connection can be closed and reopened.
  </done>
</task>

<task type="auto">
  <name>Add kill switch UI to extension popup</name>
  <files>extension/popup.html, extension/popup.js</files>
  <action>
    1. Modify extension/popup.html:
       - Add new status item for "MCP Control" with a toggle button
       - Add CSS for toggle switch (checkbox-styled button):
         * ON state: green background, "Enabled" text
         * OFF state: red background, "Disabled" text
       - Place it at the top of status-section (most important control)
       - Add id="kill-switch-btn" to the button
       - Add id="kill-switch-status" for status text
    
    2. Modify extension/popup.js:
       - Add `toggleKillSwitch()` function that:
         * Sends `{ type: 'toggleKillSwitch' }` to background script
         * Updates UI based on response
       - Modify `init()` to:
         * Query kill switch state on load via `getKillSwitchState`
         * Set up click listener on #kill-switch-btn
       - Add `updateKillSwitchUI(isEnabled)` function that:
         * Updates button text and styling based on state
         * Shows "Enabled" (green) or "Disabled" (red)
       - Modify `refreshStatus()` to also refresh kill switch state
  </action>
  <verify>
    - Open extension popup
    - See "MCP Control" section with toggle button
    - Button shows "Enabled" with green styling initially
    - Clicking button changes to "Disabled" with red styling
  </verify>
  <done>
    Popup shows kill switch toggle that reflects and controls background script state.
  </done>
</task>

<task type="auto">
  <name>Handle graceful disconnect in MCP server</name>
  <files>src/server.ts</files>
  <action>
    Modify src/server.ts to handle WebSocket disconnect gracefully:
    
    1. In the `wss.on("connection")` handler (around line 35):
       - Add a `websocket.on("close")` handler that:
         * Logs "Extension disconnected (kill switch or browser closed)"
         * Sets `context.ws = undefined` (clears the connection)
         * Optionally: clear any pending operations
    
    2. In the `wss.on("connection")` handler:
       - Add a `websocket.on("error")` handler that:
         * Logs the error
         * Clears `context.ws`
    
    3. Ensure the existing close handler on the server (line 85-89) handles cleanup properly:
       - The server.close override should close wss and context
       - This is already there, just verify it works
    
    4. The Context class already throws a helpful error when `ws` is undefined ("No connection to browser extension..."), so tool calls will automatically fail with a clear message when the kill switch is off.
  </action>
  <verify>
    - Start MCP server: `npm run build && node dist/index.js`
    - Verify server starts and waits for connection
    - When extension disconnects, server logs disconnect message
    - Attempting to use tools without connection shows "No connection to browser extension" error
  </verify>
  <done>
    MCP server properly handles WebSocket disconnect, clears context, and shows clear error messages when extension is disconnected.
  </done>
</task>

</tasks>

<verification>
1. Build and install extension in Firefox
2. Open extension popup - verify kill switch shows "Enabled"
3. Start MCP server
4. Use a browser tool (e.g., browser_navigate) - should work
5. Click kill switch to disable
6. Try using browser tool again - should fail with "No connection" error
7. Check server logs - should show disconnect message
8. Click kill switch to enable
9. Try tool again - should work after reconnection
</verification>

<success_criteria>
- Kill switch toggle visible in extension popup
- Toggle state persists and controls communication
- When disabled: all MCP tools fail immediately with clear error
- When enabled: automatic reconnection, tools work again
- No crashes or hanging connections
</success_criteria>

<output>
After completion, create `.planning/quick/2-gate-all-communications-behind-a-single-/2-SUMMARY.md`
</output>
