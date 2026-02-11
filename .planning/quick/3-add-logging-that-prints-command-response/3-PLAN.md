---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server.ts
  - src/protocol/ws-sender.ts
  - src/utils/log.ts
autonomous: true
must_haves:
  truths:
    - All tool execution results are logged with tool name and success/error status
    - All WebSocket command requests are logged with message type and payload
    - All WebSocket responses are logged with result or error details
    - Logs use stderr to avoid interfering with MCP stdout transport
  artifacts:
    - path: src/server.ts
      provides: "Tool result logging in CallToolRequestSchema handler"
      contains: "debugLog after tool.handle() returns"
    - path: src/protocol/ws-sender.ts
      provides: "WebSocket message and response logging"
      contains: "debugLog for outgoing message and incoming response"
    - path: src/utils/log.ts
      provides: "Debug logging utility"
      exists: true
  key_links:
    - from: src/server.ts
      to: src/utils/log.ts
      via: "import { debugLog }"
    - from: src/protocol/ws-sender.ts
      to: src/utils/log.ts
      via: "import { debugLog }"
---

<objective>
Add comprehensive logging that prints command responses across the board for better debugging and observability.

Purpose: When debugging MCP tool execution or WebSocket communication issues, operators need visibility into what commands were sent and what responses were received. Currently this information is opaque.

Output: Modified server.ts and ws-sender.ts with strategic logging at command send/receive boundaries.
</objective>

<execution_context>
@./.opencode/get-shit-done/workflows/execute-plan.md
@./.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/server.ts
@src/protocol/ws-sender.ts
@src/utils/log.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add WebSocket message logging in ws-sender.ts</name>
  <files>src/protocol/ws-sender.ts</files>
  <action>
    Import debugLog from '@/utils/log' and add two logging statements in the sendSocketMessage function:
    
    1. Before sending the message (after line 87, inside the ws.readyState check): 
       Log the outgoing message with type and messageId: `debugLog('[WS] → Sending:', type, messageId, payload)`
    
    2. After receiving a response (inside responseHandler, before cleanup(), around line 63):
       Log the response: `debugLog('[WS] ← Received:', type, messageId, 'result:', response.result || '(error)')`
    
    Use debugLog from '@/utils/log' which writes to stderr to avoid interfering with MCP stdout transport.
  </action>
  <verify>
    grep -n "debugLog" src/protocol/ws-sender.ts | head -5
  </verify>
  <done>
    ws-sender.ts contains debugLog import and two debugLog calls - one before ws.send() and one when response received
  </done>
</task>

<task type="auto">
  <name>Task 2: Add tool result logging in server.ts</name>
  <files>src/server.ts</files>
  <action>
    Import debugLog from '@/utils/log' and add logging in the CallToolRequestSchema handler:
    
    1. At the start of the handler (line 88): Log tool invocation with name and params
       `debugLog('[MCP] Tool called:', request.params.name, request.params.arguments)`
    
    2. After tool.handle() returns successfully (line 122, inside try block): 
       Log the result: `debugLog('[MCP] Tool result:', request.params.name, result)`
    
    3. In the catch block (before returning error, around line 129):
       Log the error: `debugLog('[MCP] Tool error:', request.params.name, error)`
    
    Ensure the import path is '@/utils/log' and all three logging points are present.
  </action>
  <verify>
    grep -n "debugLog" src/server.ts | head -5
  </verify>
  <done>
    server.ts contains debugLog import and three debugLog calls - one at handler start, one on success, one on error
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify TypeScript compiles cleanly</name>
  <files>src/server.ts, src/protocol/ws-sender.ts</files>
  <action>
    Run TypeScript compiler to verify the changes compile without errors:
    - Run `npm run build` or `npx tsc --noEmit` to check for type errors
    - Fix any import path issues if debugLog cannot be resolved
    - Ensure no console.log is used (should be debugLog which uses console.error)
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    TypeScript compiles without errors, no type issues with debugLog imports or usage
  </done>
</task>

</tasks>

<verification>
- [ ] ws-sender.ts logs outgoing WebSocket messages with type and id
- [ ] ws-sender.ts logs incoming WebSocket responses with type and id  
- [ ] server.ts logs tool invocations with name and params
- [ ] server.ts logs successful tool results
- [ ] server.ts logs tool execution errors
- [ ] All logging uses stderr (via debugLog utility)
- [ ] TypeScript compiles without errors
</verification>

<success_criteria>
Command responses are logged at all major boundaries:
1. MCP tool calls show invocation and result/error
2. WebSocket messages show sent request and received response
3. Logs appear in stderr without breaking MCP stdout transport
4. TypeScript compiles successfully
</success_criteria>

<output>
After completion, create `.planning/quick/3-add-logging-that-prints-command-response/3-SUMMARY.md`
</output>
