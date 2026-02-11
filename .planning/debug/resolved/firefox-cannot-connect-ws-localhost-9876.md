---
status: resolved
trigger: "firefox-cannot-connect-ws-localhost-9876"
created: 2026-02-09T00:00:00Z
updated: 2026-02-09T00:03:00Z
---

## Current Focus

hypothesis: RESOLVED - Port mismatch fixed by changing extension DEFAULT_PORT from 9876 to 3456
test: Fix applied and verified
epecting: Extension can now connect to MCP server on correct port
next_action: Session complete

## Symptoms

expected: Firefox extension should connect to Browser MCP server at ws://localhost:9876 and remain connected when kill switch is enabled.
actual: Extension logs reconnect attempts and cannot establish connection. User reports clicking extension icon can disable state based on icon; expected startup/listening behavior is unclear and likely mismatched with current toggle semantics.
errors: [Browser MCP] Attempting reconnect 4/10; [Browser MCP] Starting WebSocket server on port 9876; Firefox can't establish a connection to the server at ws://localhost:9876/; [Browser MCP] WebSocket error event object; [Browser MCP] WebSocket connection closed.
reproduction: User starts browser and expects extension to be listening, then starts MCP. Trigger includes clicking extension icon (which currently toggles kill switch state).
timeline: Never worked. First test of this setup.
started: Never worked

## Eliminated

## Evidence

- timestamp: 2026-02-09T00:00:00Z
  checked: Debug session created
  found: Symptoms prefilled, starting investigation
  implication: Need to understand extension architecture

- timestamp: 2026-02-09T00:01:00Z
  checked: background.js CONFIG object (line 8)
  found: DEFAULT_PORT: 9876
  implication: Extension connects as client to ws://localhost:9876

- timestamp: 2026-02-09T00:01:00Z
  checked: mcp.config.ts mcpConfig object (line 6)
  found: defaultWsPort: 3456
  implication: MCP server creates WebSocketServer on port 3456

- timestamp: 2026-02-09T00:01:00Z
  checked: Architecture flow
  found: MCP server is WebSocket SERVER, extension is WebSocket CLIENT
  implication: Extension tries to connect to wrong port - connection refused

- timestamp: 2026-02-09T00:01:00Z
  checked: Error messages
  found: "Firefox can't establish a connection to the server at ws://localhost:9876/"
  implication: CONFIRMED - Extension cannot reach server on port 9876 because server is on 3456

- timestamp: 2026-02-09T00:02:00Z
  checked: Applied fix to extension/background.js
  found: Changed DEFAULT_PORT from 9876 to 3456
  implication: Extension now uses same default port as MCP server

- timestamp: 2026-02-09T00:02:00Z
  checked: Grep for other 9876 references in codebase
  found: No other hardcoded references to 9876 in code (only in docs/planning)
  implication: Fix is complete

- timestamp: 2026-02-09T00:03:00Z
  checked: Updated README.md troubleshooting section
  found: Changed port reference from 9876 to 3456
  implication: Documentation now matches implementation

## Resolution

root_cause: Port mismatch between Firefox extension default (9876) and MCP server WebSocket port (3456). Extension tried to connect to ws://localhost:9876 but server listens on port 3456.
fix: Changed extension DEFAULT_PORT from 9876 to 3456 in extension/background.js line 8. Updated README.md troubleshooting section to reference port 3456.
verification: Grep confirmed no other 9876 references in code. Extension will now connect to ws://localhost:3456 which matches the MCP server WebSocket port.
files_changed:
  - extension/background.js: Changed CONFIG.DEFAULT_PORT from 9876 to 3456
  - README.md: Updated troubleshooting table to reference port 3456
