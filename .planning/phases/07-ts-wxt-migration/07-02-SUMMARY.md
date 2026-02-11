---
phase: 07-ts-wxt-migration
plan: 02
subsystem: extension
 tags: [typescript, modularization, architecture]

requires:
  - phase: 07-ts-wxt-migration
    plan: 01
    provides: TypeScript WXT extension with monolithic background.ts

provides:
  - SessionManager class for session lifecycle
  - NetworkCapture class for webRequest capture
  - ConsoleCapture class for content script logs
  - McpBridge class for WebSocket management
  - ContentBridge class for content script messaging
  - CommandHandler with category modules (navigation, interaction, inspection)
  - IconManager and selector utilities
  - Modular background.ts entrypoint (~70 lines)
  - MCP server index files for session/, messaging/, tools/

affects:
  - Phase 8 (testing will target modular modules)
  - Future maintenance (focused module changes)

tech-stack:
  added:
    - Class-based module architecture
  patterns:
    - Single Responsibility modules
    - Constructor injection for dependencies
    - Event-driven session lifecycle
    - Analogous module structure between extension and MCP

key-files:
  created:
    - packages/extension/src/session/session-manager.ts (239 lines)
    - packages/extension/src/session/network-capture.ts (198 lines)
    - packages/extension/src/session/console-capture.ts (158 lines)
    - packages/extension/src/messaging/mcp-bridge.ts (243 lines)
    - packages/extension/src/messaging/content-bridge.ts (70 lines)
    - packages/extension/src/commands/command-handler.ts (143 lines)
    - packages/extension/src/commands/navigation.ts (99 lines)
    - packages/extension/src/commands/interaction.ts (109 lines)
    - packages/extension/src/commands/inspection.ts (206 lines)
    - packages/extension/src/utils/selectors.ts (74 lines)
    - packages/extension/src/utils/icons.ts (61 lines)
    - packages/mcp/src/session/index.ts
    - packages/mcp/src/messaging/index.ts
    - packages/mcp/src/tools/index.ts
  modified:
    - packages/extension/entrypoints/background.ts (195 lines, down from 1059)
    - packages/extension/entrypoints/content.ts (617 lines, using ConsoleCapture)

key-decisions:
  - "Use constructor injection for all module dependencies"
  - "Background entrypoint is pure orchestration, no business logic"
  - "Keep circular dependency resolution explicit in entrypoint"
  - "MCP server gets index.ts files to match extension modularity"

patterns-established:
  - "Module pattern: Each domain has its own class with clear interface"
  - "Dependency injection: Constructor parameters for all dependencies"
  - "Event callbacks: onSessionCleared pattern for lifecycle events"
  - "Entrypoint pattern: Main() only wires modules, doesn't implement"

metrics:
  duration: 12min
  completed: 2026-02-11T18:11:40Z
---

# Phase 7 Plan 2: Extension Modularization Summary

**Monolithic 1059-line background.ts split into ~10 focused modules with clear architectural boundaries matching MCP server structure.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-11T17:59:50Z
- **Completed:** 2026-02-11T18:11:40Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

1. **Session Management** - SessionManager class with lifecycle, tab creation, and session groups
2. **Network Capture** - NetworkCapture class with webRequest API integration and filtering
3. **Console Capture** - ConsoleCapture class for content script with ring buffer
4. **MCP Bridge** - McpBridge class with WebSocket connection and auto-reconnect
5. **Content Bridge** - ContentBridge class for tab messaging with error handling
6. **Command Handler** - CommandHandler routing to Navigation, Interaction, and Inspection modules
7. **Utility Modules** - IconManager and selector parsing utilities
8. **Entrypoint Rewrite** - Background.ts reduced from 1059 to 195 lines (pure orchestration)
9. **MCP Alignment** - Index files for session/, messaging/, tools/ modules

## Task Commits

1. **Task 1: Extract session and capture modules** - `c9b7ac3` (feat)
   - SessionManager, NetworkCapture, ConsoleCapture classes
2. **Task 2: Create messaging and command modules** - `ea1b68a` (feat)
   - McpBridge, ContentBridge, CommandHandler, NavigationCommands, InteractionCommands, InspectionCommands
3. **Task 3: Create utility modules and wire up entrypoints** - `9efe8f8` (feat)
   - IconManager, selectors, modular entrypoints, MCP index files

## Files Created/Modified

### Session Modules
- `packages/extension/src/session/session-manager.ts` - Session lifecycle, tab management
- `packages/extension/src/session/network-capture.ts` - webRequest capture
- `packages/extension/src/session/console-capture.ts` - Content script console capture

### Messaging Modules
- `packages/extension/src/messaging/mcp-bridge.ts` - WebSocket client with reconnection
- `packages/extension/src/messaging/content-bridge.ts` - Content script messaging

### Command Modules
- `packages/extension/src/commands/command-handler.ts` - Command routing
- `packages/extension/src/commands/navigation.ts` - navigate, goBack, goForward
- `packages/extension/src/commands/interaction.ts` - click, type, drag, hover, wait
- `packages/extension/src/commands/inspection.ts` - screenshot, snapshot, logs, evaluate

### Utility Modules
- `packages/extension/src/utils/selectors.ts` - Element selector parsing
- `packages/extension/src/utils/icons.ts` - Toolbar icon state management

### Entrypoints
- `packages/extension/entrypoints/background.ts` - Orchestration only (~70 lines of logic)
- `packages/extension/entrypoints/content.ts` - Uses ConsoleCapture class

### MCP Server
- `packages/mcp/src/session/index.ts` - Session module exports
- `packages/mcp/src/messaging/index.ts` - Messaging module exports
- `packages/mcp/src/tools/index.ts` - Tools module exports

## Decisions Made

1. **Constructor injection** - All modules receive dependencies via constructors for testability
2. **Circular dependency handling** - CommandHandler and McpBridge have mutual dependency resolved in entrypoint
3. **Pure orchestration entrypoint** - background.ts only wires modules, no business logic
4. **Event callbacks for lifecycle** - SessionManager uses onSessionCleared callbacks for cleanup

## Deviations from Plan

None - plan executed exactly as written. All modules created with expected method signatures and functionality preserved.

## Issues Encountered

1. **MCP server path aliases** - Pre-existing build issue with `@/` aliases in MCP server (noted in 07-01 summary, unrelated to this plan)

## Metrics Comparison

| Metric | Before | After |
|--------|--------|-------|
| background.ts lines | 1059 | 195 (-81%) |
| background.ts logic | All mixed | Pure orchestration |
| Testable units | 1 | 10+ |
| Build size | 132 KB | 138 KB (+4.5% modules) |

## Next Phase Readiness

- Extension builds successfully with `pnpm build`
- All functionality preserved from original implementation
- Modular structure enables focused unit testing
- Clear module boundaries for future feature work
- Entrypoints are maintainable orchestration layers

---
*Phase: 07-ts-wxt-migration*
*Completed: 2026-02-11*
