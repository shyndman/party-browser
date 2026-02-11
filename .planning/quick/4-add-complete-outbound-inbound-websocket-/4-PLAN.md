---
phase: quick
plan: 4
type: execute
wave: 1
depends_on: []
files_modified:
  - extension/background.js
  - AGENTS.md
autonomous: true

must_haves:
  truths:
    - "All WebSocket messages sent FROM extension TO MCP are logged"
    - "All WebSocket messages received FROM MCP TO extension are logged"
    - "Log format matches existing [Browser MCP] pattern for consistency"
    - "Response payloads are visible in browser console for debugging"
    - "AGENTS.md exists with guidance for resolving MCP vs extension target ambiguity"
  artifacts:
    - path: "extension/background.js"
      provides: "Bidirectional WebSocket logging"
    - path: "AGENTS.md"
      provides: "Agent guidance for ambiguous targets"
      min_lines: 20
  key_links:
    - from: "wsConnection.send calls"
      to: "console.log statements"
      via: "Pre-send logging of response payloads"
---

<objective>
Add complete outbound/inbound WebSocket response logging in extension/background.js to match MCP-side visibility, and add AGENTS.md guidance to ask for clarification when MCP vs extension target is ambiguous.

Purpose: When debugging MCP tool calls, operators need to see both what the MCP sends AND what the extension responds with. Currently only inbound messages are logged; outbound responses are invisible, making it hard to trace command execution flow. Additionally, establish clear guidance for agents when task targets are ambiguous between MCP server and extension.
Output: Extension logs every WebSocket message in both directions with consistent formatting, and AGENTS.md provides target ambiguity resolution guidance.
</objective>

<execution_context>
@./.opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./extension/background.js

Current state: The extension already logs inbound messages at line 383 (`[Browser MCP] Received command from MCP:`) but does NOT log outbound responses. There are 4 places where `wsConnection.send()` is called:
1. Line 398: mcpCommand response
2. Line 438-444: Direct message type response  
3. Line 448-453: Unknown message type error
4. Line 457-461: Error response in catch block

Each needs a corresponding log statement before sending.
</context>

<tasks>

<task type="auto">
  <name>Add outbound WebSocket response logging</name>
  <files>extension/background.js</files>
  <action>
Add console.log statements before each wsConnection.send() call in the onmessage handler to log outbound responses.

Modify these 4 locations:

1. Line 398 (mcpCommand response):
   Before: wsConnection.send(JSON.stringify(result));
   Add: console.log('[Browser MCP] Sending response to MCP:', result);

2. Line 438-444 (direct message response):
   Before: wsConnection.send(JSON.stringify({ id: message.id, result: result, ... }));
   Add: console.log('[Browser MCP] Sending response to MCP:', { id: message.id, result: result, error: result.success ? undefined : result.error, errorCode: result.errorCode });

3. Line 448-453 (unknown message type):
   Before: wsConnection.send(JSON.stringify({ id: message.id, success: false, ... }));
   Add: console.log('[Browser MCP] Sending error response to MCP:', { id: message.id, success: false, error: `Unknown message type: ${message.type}`, errorCode: ErrorCodes.COMMAND_FAILED });

4. Line 457-461 (error catch block):
   Before: wsConnection.send(JSON.stringify({ success: false, ... }));
   Add: console.log('[Browser MCP] Sending error response to MCP:', { success: false, error: error.message, errorCode: error.errorCode || ErrorCodes.TRANSPORT_UNAVAILABLE });

The kill switch response (lines 387-392) should also be logged:
   Add before send: console.log('[Browser MCP] Sending kill switch response to MCP:', { success: false, error: 'Kill switch is disabled...', errorCode: ErrorCodes.KILL_SWITCH_DISABLED });
  </action>
  <verify>grep -n "Sending response to MCP" extension/background.js | wc -l returns 5 (1 inbound log pattern already exists + 4 new outbound logs)</verify>
  <done>All 4 wsConnection.send() locations in onmessage handler have preceding console.log statements with consistent [Browser MCP] prefix logging the response payload</done>
</task>

<task type="auto">
  <name>Create AGENTS.md with target clarification guidance</name>
  <files>AGENTS.md</files>
  <action>
Create AGENTS.md at the project root with guidance for resolving ambiguous targets between MCP server and extension.

Content should include:
1. Header: "# Agent Guidelines"
2. Section: "## Working with Browser MCP"
3. Subsection: "### Target Ambiguity Resolution"
   - Explain when to ask for clarification (ambiguous requests like "add logging", "fix WebSocket", "update build process")
   - Provide examples of ambiguous vs clear requests
   - Show how to ask for clarification with specific file references
4. Subsection: "#### Project Structure Reminder" 
   - Show the directory structure distinguishing src/ (MCP server) vs extension/ (Firefox extension)
5. Section: "### General Principles"
   - Don't assume - When in doubt, ask
   - Be specific - Reference exact file paths in questions
   - Document decisions - Note preferences for future tasks

Use conversational but professional tone. Keep it concise but comprehensive.
  </action>
  <verify>File exists at AGENTS.md with "Target Ambiguity Resolution" section</verify>
  <done>AGENTS.md created with clear guidance on resolving MCP server vs extension target ambiguity, including examples and project structure reference</done>
</task>

</tasks>

<verification>
- [ ] Inbound message logging still works (line 383 unchanged)
- [ ] Outbound response logging added to all 4 send locations
- [ ] Log format consistent: `[Browser MCP] Sending response to MCP:`
- [ ] Both request and response payloads visible in browser console
- [ ] AGENTS.md exists at project root
- [ ] AGENTS.md contains "Target Ambiguity Resolution" section
- [ ] AGENTS.md includes project structure distinguishing src/ vs extension/
</verification>

<success_criteria>
Extension background script logs complete WebSocket traffic:
1. Every message received from MCP is logged (already existed)
2. Every response sent to MCP is logged (new)
3. Log format is consistent and grep-able

AGENTS.md provides clear guidance:
1. Explains when to ask for target clarification
2. Shows examples of ambiguous requests
3. Demonstrates how to ask with specific file references
4. Documents project structure for reference
</success_criteria>

<output>
After completion, create `.planning/quick/4-add-complete-outbound-inbound-websocket-/4-SUMMARY.md`
</output>
