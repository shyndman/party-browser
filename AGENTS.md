# Agent Guidelines

## Working with PartyBrowser

### Target Ambiguity Resolution

This project contains **two distinct components** that agents often confuse:

1. **MCP Server** (`src/` directory) - The Node.js/TypeScript MCP server that runs as a separate process
2. **Firefox Extension** (`extension/` directory) - The WebExtension that runs inside Firefox

When you receive an ambiguous request, **always ask for clarification** rather than assuming which component is the target.

#### Examples of Ambiguous Requests

| Ambiguous | Why It's Unclear |
|-----------|------------------|
| "Add logging" | To which component? Server logs vs extension console logs |
| "Fix WebSocket" | Server-side WebSocket handling or extension connection code? |
| "Update build process" | Server bundling or extension XPI packaging? |
| "Add error handling" | API errors in server or content script errors in extension? |
| "Improve messaging" | MCP protocol messages or extension-to-content-script messaging? |

#### Examples of Clear Requests

| Clear | Why It's Clear |
|-------|----------------|
| "Add logging to the extension's background script that prints WebSocket messages" | Explicitly mentions `extension/` and specific file |
| "Fix the WebSocket reconnection logic in the MCP server" | Explicitly targets `src/` server code |
| "Update the extension build to produce a signed XPI" | Explicitly targets extension packaging |

#### How to Ask for Clarification

When a request is ambiguous, ask a specific question referencing exact file paths:

> "I want to confirm which component you're targeting. Should I:
>
> 1. Modify the **MCP server** code in `src/mcp-server/` (handles tool registration and MCP protocol)
> 2. Or modify the **Firefox extension** in `extension/background.js` (handles browser automation and WebSocket client)?
>
> The request mentions 'logging' - the server logs to stdout via `console.log`, while the extension logs to the Firefox Browser Console. Which behavior are you looking for?"

#### Project Structure Reminder

```
browser-mcp/
├── src/                      # MCP Server (Node.js/TypeScript)
│   ├── mcp-server/          # MCP protocol implementation
│   │   ├── server.ts        # Main MCP server
│   │   └── tool-handlers/   # Tool implementations
│   ├── browser-api/         # Browser control abstraction
│   └── utils/               # Server utilities
│
├── extension/               # Firefox Extension (WebExtension v2)
│   ├── background.js        # Main extension background script
│   ├── content-script.js    # Injected into web pages
│   ├── manifest.json        # Extension manifest
│   └── icons/               # Extension icons
│
├── tests/                   # Test suites (covers both)
└── scripts/                 # Build and utility scripts
```

**Quick Reference:**
- If it mentions **tools**, **MCP protocol**, **JSON-RPC**, or **stdio** → likely `src/`
- If it mentions **Firefox**, **tabs**, **content scripts**, or **WebSocket client** → likely `extension/`
- If it mentions **WebSocket server** → `src/` (server listens)
- If it mentions **WebSocket connection/client** → `extension/` (extension connects)

### General Principles

#### Don't Assume — When in Doubt, Ask

The cost of asking a clarifying question (30 seconds) is far less than the cost of implementing the wrong thing (30+ minutes). Operators prefer a quick question over rework.

#### Be Specific — Reference Exact File Paths

When discussing implementation options or asking questions, always include the specific file paths. This demonstrates understanding and prevents miscommunication.

**Instead of:** "Should I update the WebSocket code?"
**Say:** "Should I update `extension/background.js` where the WebSocket connection is established (line 369), or `src/mcp-server/server.ts` where the WebSocket server is created?"

#### Document Decisions — Note Preferences for Future Tasks

When an operator clarifies their intent, capture that decision for future reference. If they say "prefer modifying the extension over the server for UI-related changes," note this in your context for subsequent tasks.

This creates continuity across sessions and reduces repeated clarification cycles.

---

*These guidelines apply to all agents working on the PartyBrowser project. When in doubt, refer back to this document and ask rather than assume.*
