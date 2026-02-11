# Architecture Research: v1.1 Structural Milestone

**Project:** blindflight (browser-mcp rebrand)  
**Milestone:** v1.1 pre-v2.0-structural-improvements  
**Researched:** 2026-02-11  
**Confidence:** HIGH

## Executive Summary

The v1.1 milestone restructures browser-mcp from a monolithic single-package repo to a pnpm workspace with clear separation between MCP server (`packages/mcp`) and browser extension (`packages/extension`). This enables independent versioning, parallel development, and cleaner protocol boundaries while preserving existing runtime behavior.

**Key architectural shifts:**
1. **Package split**: Single package → workspace with `packages/mcp` and `packages/extension`
2. **Extension modernization**: Plain JS + hand-rolled manifest → TypeScript + WXT with MV2 output preservation
3. **Protocol hardening**: Untyped message passing → strict message contracts with coded errors
4. **Naming clean break**: `browser_` prefix removal across tool names and protocol messages
5. **Rebrand**: `browsermcp` identifiers → `blindflight` across packages, binaries, and manifests

---

## Current Architecture (Pre-v1.1)

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MCP Server (Node.js/TS)                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      src/index.ts (Entry)                         │   │
│  │  - Registers tools with MCP SDK                                   │   │
│  │  - Starts WebSocket server on port 3456                           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌──────────────────┬──────────────┼──────────────┬──────────────────┐   │
│  │ Tool Definitions │ Tool Impl    │ Protocol     │ Context          │   │
│  │ (Zod schemas)    │ (handlers)   │ (WS msgs)    │ (connection mgmt)│   │
│  └──────────────────┴──────────────┴──────────────┴──────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                               WebSocket
                              (ws://localhost:3456)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                         Firefox Extension (MV2)                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    background.js (Event Page)                     │   │
│  │  - WebSocket client connecting to MCP server                      │   │
│  │  - Session tab management (create/reuse/cleanup)                  │   │
│  │  - Command routing to content scripts                             │   │
│  │  - Network capture via webRequest API                             │   │
│  │  - Kill switch state management                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌──────────────────┬──────────────┼──────────────┬──────────────────┐   │
│  │ content-script.js│   popup.js   │  icons/      │  manifest.json   │   │
│  │ (DOM interaction)│ (UI toggle)  │  (states)    │  (MV2 config)    │   │
│  └──────────────────┴──────────────┴──────────────┴──────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (Current)

| Component | Responsibility | Key Files |
|-----------|---------------|-----------|
| MCP Server | MCP protocol handler, WebSocket server, tool dispatch | `src/server.ts`, `src/index.ts` |
| Tool Layer | Zod schema definitions, tool handlers | `src/tools/`, `src/protocol/tool-definitions.ts` |
| Protocol Layer | Message type definitions, WS sender | `src/protocol/ws-messages.ts`, `src/protocol/ws-sender.ts` |
| Context | WebSocket connection lifecycle | `src/context.ts` |
| Extension Background | WebSocket client, session management, command routing | `extension/background.js` |
| Content Script | DOM manipulation, element finding, snapshot generation | `extension/content-script.js` |
| Manifest | Extension permissions, entry points | `extension/manifest.json` |

### Data Flow

```
User LLM → MCP Tool Call
    ↓
MCP Server (src/server.ts)
    ↓
Tool Handler (src/tools/*.ts)
    ↓
Context.sendSocketMessage()
    ↓
WebSocket → extension/background.js
    ↓
handleBrowserCommand()
    ↓
Content Script Message (tabs.sendMessage)
    ↓
DOM Operation (content-script.js)
    ↓
Response bubbles back up
```

---

## Target Architecture (Post-v1.1)

### Workspace Structure

```
blindflight/
├── package.json                 # Root workspace config (pnpm workspaces)
├── pnpm-workspace.yaml          # Workspace definitions
├── packages/
│   ├── mcp/                     # MCP Server Package
│   │   ├── package.json         # @blindflight/mcp
│   │   ├── src/
│   │   │   ├── index.ts         # Entry point
│   │   │   ├── server.ts        # MCP server implementation
│   │   │   ├── protocol/        # Protocol contracts
│   │   │   │   ├── messages.ts  # Renamed from ws-messages.ts
│   │   │   │   ├── sender.ts    # Renamed from ws-sender.ts
│   │   │   │   └── errors.ts    # NEW: Coded error definitions
│   │   │   ├── tools/           # Tool implementations
│   │   │   │   ├── common.ts    # navigate, wait, press_key, etc.
│   │   │   │   ├── snapshot.ts  # snapshot, click, type, etc.
│   │   │   │   ├── inspection.ts# network, console tools
│   │   │   │   ├── evaluate.ts  # evaluate tool
│   │   │   │   └── custom.ts    # screenshot, console logs
│   │   │   ├── config/
│   │   │   │   └── mcp.config.ts # Server config
│   │   │   └── context.ts       # Connection management
│   │   └── tsconfig.json
│   │
│   └── extension/               # Browser Extension Package
│       ├── package.json         # @blindflight/extension
│       ├── wxt.config.ts        # WXT configuration (MV2 output)
│       ├── entrypoints/
│       │   ├── background.ts    # Background service worker (was background.js)
│       │   ├── content.ts       # Content script (was content-script.js)
│       │   └── popup/
│       │       ├── index.html   # Popup HTML
│       │       ├── main.ts      # Popup logic (was popup.js)
│       │       └── App.vue      # Vue popup UI (if adopting WXT-Vue)
│       ├── components/          # Vue components (optional)
│       ├── public/
│       │   └── icons/           # Extension icons
│       └── tsconfig.json
│
├── scripts/                     # Build/release scripts
│   ├── build-xpi.mjs           # XPI packaging (delegates to WXT)
│   └── version-sync.mjs        # NEW: Sync versions across packages
│
└── .planning/                   # Project planning (unchanged)
```

### Package Boundaries

| Package | Type | Responsibility | Public API |
|---------|------|---------------|------------|
| `@blindflight/mcp` | Node.js library/binary | MCP server implementation | CLI binary, programmatic API (future) |
| `@blindflight/extension` | WebExtension | Browser automation runtime | Extension XPI artifact |

### Inter-Package Contracts

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Inter-Package Contract                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  @blindflight/mcp                      @blindflight/extension           │
│  ─────────────────                     ─────────────────────            │
│                                                                          │
│  Protocol Contract (TypeScript):                                        │
│  ───────────────────────────────                                        │
│  Defined in: packages/mcp/src/protocol/messages.ts                      │
│                                                                          │
│  interface ExtensionMessage {                                           │
│    type: 'navigate' | 'click' | 'type' | ... (no browser_ prefix)       │
│    payload: unknown                                                      │
│  }                                                                       │
│                                                                          │
│  WebSocket Contract:                                                    │
│  ───────────────────                                                    │
│  - Transport: WebSocket (ws://localhost:3456)                           │
│  - Serialization: JSON                                                   │
│  - Message envelope: { id, type, payload }                              │
│  - Response envelope: { id, result, error, errorCode }                  │
│                                                                          │
│  Error Codes (shared):                                                  │
│  ─────────────────────                                                  │
│  Defined in: packages/mcp/src/protocol/errors.ts                        │
│  Copied to: packages/extension/src/protocol/errors.ts (build-time)      │
│                                                                          │
│  SESSION_NOT_INITIALIZED                                                │
│  SESSION_TAB_CLOSED                                                     │
│  TRANSPORT_UNAVAILABLE                                                  │
│  COMMAND_FAILED                                                         │
│  ... etc                                                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Protocol Rename Path (browser_ Removal)

### Tool Name Mapping

| Current (v1.0) | New (v1.1) | Package |
|----------------|------------|---------|
| `browser_navigate` | `navigate` | MCP |
| `browser_go_back` | `go_back` | MCP |
| `browser_go_forward` | `go_forward` | MCP |
| `browser_click` | `click` | MCP |
| `browser_drag` | `drag` | MCP |
| `browser_hover` | `hover` | MCP |
| `browser_type` | `type` | MCP |
| `browser_press_key` | `press_key` | MCP |
| `browser_select_option` | `select_option` | MCP |
| `browser_wait` | `wait` | MCP |
| `browser_wait_for` | `wait_for` | MCP |
| `browser_snapshot` | `snapshot` | MCP |
| `browser_screenshot` | `screenshot` | MCP |
| `browser_get_console_logs` | `get_console_logs` | MCP |
| `browser_evaluate` | `evaluate` | MCP |
| `browser_close` | `close` | MCP |
| `browser_get_network_requests` | `get_network_requests` | MCP |
| `browser_get_console_messages` | `get_console_messages` | MCP |

### Protocol Message Mapping

| Current Message Type | New Message Type | Direction |
|---------------------|------------------|-----------|
| `browser_navigate` | `navigate` | MCP → Extension |
| `browser_click` | `click` | MCP → Extension |
| ... | ... | ... |

### Implementation Strategy

**Clean Break Approach** (recommended):
1. Rename all identifiers in single sweep
2. No backward compatibility aliases
3. Update all tool definitions simultaneously
4. Update extension message handlers simultaneously
5. Single commit for rename (separate from workspace migration)

---

## Build and Release Flows

### Development Build Flow

```
Root: pnpm install
    │
    ├────► packages/mcp: tsup build
    │      - Output: packages/mcp/dist/
    │      - Entry: index.js (CLI binary)
    │
    └────► packages/extension: wxt build -b firefox
           - WXT generates MV2 manifest
           - Output: packages/extension/.output/firefox/
```

### Production Build Flow

```
Root: pnpm run build:all
    │
    ├────► pnpm -r build
    │      (builds all packages in dependency order)
    │
    ├────► pnpm --filter @blindflight/mcp build
    │      - Produces: packages/mcp/dist/index.js
    │      - Binary: dist/index.js (chmod +x)
    │
    ├────► pnpm --filter @blindflight/extension build:firefox
    │      - WXT produces: .output/firefox-mv2-prod/
    │      - Manifest: MV2 format for Firefox
    │
    └────► scripts/build-xpi.mjs
           - Input: packages/extension/.output/firefox-mv2-prod/
           - Output: dist/blindflight-firefox.xpi
```

### Release Flow

```
1. Version bump (root package.json)
   └── scripts/version-sync.mjs
       ├── Updates packages/mcp/package.json
       ├── Updates packages/extension/package.json
       └── Updates extension manifest version

2. Build
   └── pnpm run build:all

3. Test
   └── pnpm test (smoke, integration)

4. Publish packages
   ├── pnpm --filter @blindflight/mcp publish
   └── Extension XPI artifact (GitHub release)
```

---

## Migration Build Order

### Phase 1: Workspace Foundation (Low Risk)

```
Step 1.1: Create workspace structure
├── Create packages/ directory
├── Create packages/mcp/ with existing code
├── Create packages/extension/ (empty WXT scaffold)
├── Update root package.json (workspaces)
└── Create pnpm-workspace.yaml

Step 1.2: Verify workspace builds
├── pnpm install at root
├── Verify packages/mcp builds
└── Verify packages/extension (WXT) builds
```

### Phase 2: Extension Migration (Medium Risk)

```
Step 2.1: Port background.js to TypeScript
├── Create packages/extension/entrypoints/background.ts
├── Port session management logic
├── Port WebSocket client logic
├── Port command handlers
└── Port network capture logic

Step 2.2: Port content-script.js to TypeScript
├── Create packages/extension/entrypoints/content.ts
├── Port DOM interaction logic
├── Port element finding utilities
├── Port accessibility tree generation
└── Port console capture logic

Step 2.3: Configure WXT for MV2 output
├── wxt.config.ts: target firefox, mv2
├── Port manifest.json values to wxt.config.ts
└── Verify manifest output matches MV2 requirements

Step 2.4: Port popup
├── Create popup entrypoint
├── Port existing popup.js logic
└── Port popup.html structure

Step 2.5: Update build scripts
├── Modify scripts/build-xpi.mjs
│   └── Source from .output/firefox-mv2-prod/
└── Add extension build to root build:all
```

### Phase 3: Protocol Hardening (Medium Risk)

```
Step 3.1: Extract shared protocol types
├── Create packages/mcp/src/protocol/errors.ts
│   └── CodedError definitions
├── Create packages/mcp/src/protocol/messages.ts
│   └── SocketMessageMap (renamed from ws-messages.ts)
└── Create protocol export for extension consumption

Step 3.2: Harden message contracts
├── Strict message validation on both sides
├── Add message ID correlation
├── Add timeout handling
└── Add error code consistency
```

### Phase 4: Clean-Break Rename (High Risk)

```
Step 4.1: Rename tool definitions
├── Update all tool names in tool-definitions.ts
├── Update tool handler registrations
└── Update tool schema names

Step 4.2: Rename protocol messages
├── Update SocketMessageMap keys
├── Update extension message handlers
└── Update background.ts command routing

Step 4.3: Rename package identifiers
├── Root: @browsermcp/mcp → @blindflight/mcp
├── Extension package: → @blindflight/extension
├── Binary: mcp-server-browsermcp → blindflight-mcp
└── Config keys: browsermcp.* → blindflight.*
```

### Phase 5: Integration & Verification (Validation)

```
Step 5.1: End-to-end testing
├── Tool smoke tests
├── Extension connection tests
├── Session lifecycle tests
└── Error code verification

Step 5.2: Build verification
├── Clean build from scratch
├── XPI packaging verification
├── Binary execution verification
└── Manifest validation

Step 5.3: Documentation updates
├── Update README.md references
├── Update package descriptions
└── Update installation instructions
```

---

## New vs Modified Components

### New Components

| Component | Package | Purpose |
|-----------|---------|---------|
| `packages/` directory | Root | Workspace container |
| `@blindflight/extension` | packages/extension | New WXT-based extension |
| `wxt.config.ts` | packages/extension | WXT configuration |
| `packages/extension/entrypoints/` | packages/extension | WXT entry point structure |
| `errors.ts` | packages/mcp/src/protocol/ | Centralized error codes |
| `scripts/version-sync.mjs` | scripts | Cross-package version sync |

### Modified Components

| Component | Changes |
|-----------|---------|
| `package.json` | Convert to workspace root, add pnpm-workspace.yaml |
| `packages/mcp/src/` | Move existing src/ from root |
| Tool names | Remove `browser_` prefix |
| Message types | Remove `browser_` prefix |
| `scripts/build-xpi.mjs` | Source from WXT output directory |
| Binary name | `mcp-server-browsermcp` → `blindflight-mcp` |

### Removed Components

| Component | Replacement |
|-----------|-------------|
| Root `src/` | `packages/mcp/src/` |
| Root `extension/` | `packages/extension/` |
| `extension/manifest.json` | WXT-generated manifest |
| Manual XPI build (partial) | WXT zip output + XPI repack |

---

## Integration Points

### MCP Server → Extension Communication

| Integration | Protocol | Contract Location |
|-------------|----------|-------------------|
| WebSocket connection | ws://localhost:3456 | `packages/mcp/src/protocol/` |
| Message serialization | JSON | `messages.ts` |
| Error codes | String constants | `errors.ts` |
| Command routing | Message type → handler | Extension `background.ts` |

### Extension → Content Script Communication

| Integration | Protocol | Notes |
|-------------|----------|-------|
| Command execution | `browser.tabs.sendMessage()` | Standard WebExtension API |
| Response handling | Promise-based | Async/await pattern |
| Console log retrieval | `getConsoleLogs` message | Content script manages ring buffer |

### Build System Integration

| Integration | Tool | Purpose |
|-------------|------|---------|
| Workspace management | pnpm workspaces | Monorepo structure |
| Extension bundling | WXT | MV2 generation, HMR |
| Server bundling | tsup | ESM output, TypeScript |
| XPI packaging | Custom script | ZIP signing prep |
| Version sync | Custom script | Cross-package consistency |

---

## Architecture Patterns

### Pattern 1: Workspace Package Separation

**What:** Split code into publishable packages with clear boundaries  
**When:** When server and extension have independent release cycles  
**Trade-offs:**
- ✅ Independent versioning and publishing
- ✅ Clear dependency boundaries
- ✅ Parallel development possible
- ❌ Cross-package changes require coordination
- ❌ Build complexity increases

**Example:**
```
packages/mcp/ - Published to npm as @blindflight/mcp
packages/extension/ - Built as XPI artifact
```

### Pattern 2: Protocol Contract Sharing

**What:** Define protocol types once, consume in both packages  
**When:** Server and extension must agree on message shapes  
**Approach:**
1. Define in `packages/mcp/src/protocol/`
2. Export as package export (`@blindflight/mcp/protocol`)
3. Extension imports as dev dependency

**Trade-offs:**
- ✅ Single source of truth
- ✅ Type safety across boundary
- ❌ Extension depends on MCP package (build-time only)

### Pattern 3: WXT for Cross-Browser Extension Building

**What:** Use WXT framework for extension development  
**When:** Need TypeScript + multiple manifest versions  
**Configuration for MV2 preservation:**
```typescript
// wxt.config.ts
export default defineConfig({
  manifest: {
    manifest_version: 2,
    browser_specific_settings: {
      gecko: {
        id: 'blindflight@blindflight.io'
      }
    }
  }
});
```

**Trade-offs:**
- ✅ TypeScript support
- ✅ HMR during development
- ✅ Automatic MV2/MV3 generation
- ✅ Built-in zip packaging
- ❌ Additional build dependency
- ❌ Must configure for MV2 output explicitly

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Gradual Rename

**What:** Keep `browser_` aliases during transition period  
**Why it's wrong:** Creates technical debt, doubles testing surface  
**Do this instead:** Clean break rename in single phase with comprehensive testing

### Anti-Pattern 2: Shared Source Import

**What:** Extension imports from `../mcp/src/` directly  
**Why it's wrong:** Breaks package boundaries, causes circular dependency risks  
**Do this instead:** Protocol types exported from MCP package, imported as package dependency

### Anti-Pattern 3: Runtime Manifest Modification

**What:** Script modifies WXT-generated manifest.json post-build  
**Why it's wrong:** Fragile, breaks with WXT updates  
**Do this instead:** Configure WXT correctly to generate desired manifest

### Anti-Pattern 4: Preserving Old Build Scripts

**What:** Keep old manual XPI build alongside WXT  
**Why it's wrong:** Confusion about which build to use, maintenance burden  
**Do this instead:** Migrate fully to WXT, adapt XPI script to consume WXT output

---

## Scalability Considerations

| Scale | Architecture Adjustment |
|-------|------------------------|
| Current (single user) | Monorepo workspace is appropriate |
| Multiple extension versions | Add `packages/extension-legacy/` for parallel MV2/MV3 |
| Additional browsers | WXT supports Chrome, Edge, Safari with config |
| Plugin architecture | Extract `packages/protocol/` as shared package |

---

## Sources

- Current codebase analysis (src/, extension/, scripts/)
- WXT documentation: https://wxt.dev/
- pnpm workspaces: https://pnpm.io/workspaces
- Firefox MV2 manifest format: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json
- Reference implementation: tmp/blindflight-extension/ (WXT + Vue starter)

---

*Architecture research for: blindflight v1.1 structural milestone*  
*Researched: 2026-02-11*
