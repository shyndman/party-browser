# Feature Landscape: v1.1 Structural Improvements

**Domain:** Browser MCP / blindflight Pre-Scraping Tooling
**Milestone:** v1.1 pre-v2.0-structural-improvements
**Researched:** February 11, 2026
**Confidence:** HIGH (based on existing v1.0 implementation analysis and WXT/Firefox MV2 documentation)

## Scope Context

This is a **structural milestone** on a shipped v1.0 product. The goal is establishing a cleaner architecture baseline before v2.0 feature work. **Zero net-new end-user capabilities.** All changes are internal restructuring with strict behavior stability requirements.

## Feature Categories for v1.1

### Table Stakes (Must Complete for Milestone Success)

These are non-negotiable structural improvements. Missing any = milestone failure.

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| **TypeScript migration (extension)** | Foundation for all other structural work; eliminates untyped JS surface | MEDIUM | Convert `extension/background.js`, `content-script.js`, `popup.js` to `.ts` with strict types |
| **WXT build system adoption** | Modern extension dev experience; handles manifest generation, HMR, cross-browser builds | MEDIUM | Replace manual manifest.json with WXT config; preserve Firefox MV2 output |
| **pnpm workspace split** | Clean package boundaries for independent MCP/extension versioning | MEDIUM | `packages/mcp/` + `packages/extension/` with shared types package |
| **browser_ prefix removal** | Clean-break naming alignment with blindflight rebrand | LOW | Rename all `browser_*` tools to remove prefix; breaking change requiring major version |
| **blindflight rebrand** | Consistent project identity across packages, docs, and user-facing surfaces | LOW | Package names, binary names, manifest names, documentation |
| **MV2 compatibility preservation** | Firefox is primary target; MV3 migration is future work (v2.0+) | MEDIUM | WXT must output MV2-compatible builds; test against Firefox 109+ |

### Differentiators (Strategic Value Adds)

These structural improvements provide long-term competitive advantage but aren't strictly required for milestone completion.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Protocol contract hardening** | Typed message boundaries prevent entire classes of integration bugs | MEDIUM | Zod schemas for all WebSocket messages; explicit error codes; runtime validation |
| **Codebase modularization** | Reduces maintenance risk; enables parallel work; clearer ownership | MEDIUM | Split oversized files (background.js ~1300 lines) into focused modules |
| **Shared types package** | Single source of truth for protocol types; eliminates drift between MCP and extension | LOW | `packages/types/` with message definitions, error codes, schemas |
| **Build artifact parity** | WXT produces equivalent XPI to current manual build | LOW | File list, icon paths, permission sets must match v1.0 output |

### Anti-Features (Explicitly Out of Scope)

These would add risk without advancing the structural goals. Explicitly excluded to prevent scope creep.

| Anti-Feature | Why Requested | Why Excluded | What to Do Instead |
|--------------|---------------|--------------|-------------------|
| **MV3 migration** | Modern standard; Chrome Web Store requirement | Increases complexity; requires extensive testing; not required for Firefox | Defer to v2.0; maintain MV2-only for v1.1 |
| **New browser tools** | "While we're refactoring..." | Violates behavior stability mandate; scope creep | Create v1.2 feature milestone |
| **Protocol version negotiation** | Future-proofing for protocol evolution | Over-engineering for current needs; no protocol changes planned | Add when v2.0 protocol changes actually needed |
| **Chrome/Chromium support** | Broader browser coverage | Doubles testing matrix; not required for current users | Evaluate post-rebrand based on user demand |
| **Extension UI redesign** | Modernize popup interface | Out of scope for structural milestone; purely cosmetic | Defer to v2.0 UX milestone |
| **Automated E2E testing framework** | Regression prevention | High setup cost; manual testing sufficient for behavior stability validation | Add in v1.2 as separate initiative |

## Behavior Stability: Acceptance Outcomes

These criteria prove the restructuring didn't break user-facing behavior. All must pass for milestone completion.

### Tool Semantics Stability (Critical)

| Tool | v1.0 Behavior | v1.1 Acceptance Criteria | Test Approach |
|------|---------------|------------------------|---------------|
| `navigate` (→ `bf_navigate` or similar) | Creates session tab at about:blank, navigates, prefixes title with "OC | " | Same behavior; only name changes | Execute via MCP; verify tab creation, navigation, title prefix |
| `click` (→ `bf_click`) | Sends click command to content script via tab messaging | Same behavior; only name changes | Click element; verify DOM mutation |
| `type` (→ `bf_type`) | Sends type command with element + value | Same behavior; only name changes | Type into input; verify value set |
| `snapshot` (→ `bf_snapshot`) | Returns accessibility tree snapshot via content script | Same tree format; same element ref generation | Capture snapshot; compare structure to v1.0 output |
| `wait_for` (→ `bf_wait_for`) | Supports time/text/text_gone modes with timeout | Same modes; same timeout behavior | Test all three modes; verify resolution/rejection timing |
| `evaluate` (→ `bf_evaluate`) | Executes script in page context, returns JSON-serializable result | Same execution context; same return format | Execute script; compare return values |
| `screenshot` (→ `bf_screenshot`) | Returns base64 PNG via `tabs.captureTab` | Same image format; same dimensions | Capture screenshot; verify PNG decode, dimensions |
| `network_requests` (→ `bf_network_requests`) | Returns captured requests from webRequest API | Same filter options; same response format | Navigate to page; verify request capture |
| `console_messages` (→ `bf_console_messages`) | Returns console logs from content script ring buffer | Same log format; same level filtering | Trigger console logs; verify capture and filtering |
| `close` (→ `bf_close`) | Closes session tab, clears session state | Same cleanup behavior | Execute close; verify tab removal |

### Protocol Stability (Critical)

| Aspect | v1.0 Behavior | v1.1 Acceptance Criteria | Test Approach |
|--------|---------------|------------------------|---------------|
| **WebSocket message format** | `{ type: string, payload?: object, id?: string }` | Identical structure; field names unchanged | Inspect wire protocol; verify JSON shape |
| **Error response format** | `{ success: false, error: string, errorCode: string }` | Identical structure; same error codes | Trigger errors; verify response shape |
| **Success response format** | `{ success: true, ...result }` | Identical structure | Execute successful commands; verify response |
| **Session lifecycle** | Navigate creates tab; disconnect clears session; reconnect requires fresh navigate | Same state machine transitions | Test connect → navigate → disconnect → reconnect flow |
| **Kill switch behavior** | Toolbar click toggles; disables WebSocket; updates icon | Same toggle logic; same icon states | Click icon; verify state changes |

### Extension Behavior Stability (Critical)

| Aspect | v1.0 Behavior | v1.1 Acceptance Criteria | Test Approach |
|--------|---------------|------------------------|---------------|
| **Manifest permissions** | activeTab, tabs, storage, webRequest, `<all_urls>`, ws://localhost:3456/ | Identical permission set | Build XPI; inspect manifest.json |
| **Content script injection** | document_end, all_frames, `<all_urls>` | Same injection timing; same match patterns | Load extension; verify script injection |
| **WebSocket reconnection** | 5s interval, 10 max attempts | Same retry logic; same backoff | Kill MCP server; verify reconnection attempts |
| **Network capture scope** | Session-tab only via webRequest API | Same tab-scoped capture | Navigate; verify only session tab requests captured |
| **Console capture scope** | Content script ring buffer (1000 entries) | Same buffer size; same cleanup | Generate logs; verify buffer limits |

### Build Output Stability (Important)

| Aspect | v1.0 Behavior | v1.1 Acceptance Criteria | Test Approach |
|--------|---------------|------------------------|---------------|
| **XPI file structure** | manifest.json, background.js, content-script.js, popup.js, icons/ | Equivalent structure; WXT-generated manifest matches | Extract XPI; compare file list |
| **Binary name** | `mcp-server-browsermcp` | New name: `mcp-server-blindflight` (breaking change documented) | Build; verify binary name in `dist/` |
| **Package name** | `@browsermcp/mcp` | New name: `@blindflight/mcp` | Check package.json; verify npm publish |

## Feature Dependencies

```
[TypeScript migration]
    └──requires──> [WXT adoption]
        └──requires──> [pnpm workspace split]
            └──enables──> [Protocol hardening]
                └──enables──> [Modularization]

[browser_ prefix removal]
    └──conflicts──> [Behavior stability]
        └──mitigated by──> [Comprehensive acceptance testing]

[blindflight rebrand]
    └──requires──> [Package rename]
        └──requires──> [Binary rename]
            └──requires──> [Documentation update]
```

### Dependency Notes

- **TypeScript migration requires WXT adoption:** WXT provides the TypeScript build pipeline for extensions; manual TS setup is fragile
- **WXT adoption requires pnpm workspace:** Clean separation of concerns; extension becomes independent package
- **browser_ prefix removal conflicts with behavior stability:** This is an intentional breaking change; mitigation is exhaustive testing that only names changed, not semantics
- **Protocol hardening enables modularization:** Strong contracts make it safe to split code into smaller modules

## Phase Ordering Recommendations

Based on dependencies and risk profile:

### Phase 1: Foundation (Low Risk, Enables Everything)
1. **pnpm workspace setup** — Create `packages/mcp/`, `packages/extension/`, `packages/types/`
2. **Move existing code** — Pure file moves; no logic changes
3. **Verify builds work** — Ensure both packages build independently

### Phase 2: Extension Modernization (Medium Risk, Well-Understood)
1. **WXT configuration** — Set up WXT with Firefox MV2 target
2. **TypeScript migration** — Convert background.js, content-script.js, popup.js
3. **Manifest generation** — Ensure WXT outputs equivalent manifest to v1.0
4. **Build parity testing** — Compare XPI structure to v1.0

### Phase 3: Protocol Hardening (Medium Risk, Critical for Stability)
1. **Shared types package** — Extract message definitions to `packages/types/`
2. **Zod schema validation** — Add runtime validation to WebSocket messages
3. **Error code standardization** — Document all error codes; ensure consistency

### Phase 4: Rebrand and Breaking Changes (High Risk, Requires Testing)
1. **Package renaming** — `@browsermcp/mcp` → `@blindflight/mcp`
2. **Tool prefix removal** — `browser_navigate` → `bf_navigate` (or similar)
3. **Binary renaming** — `mcp-server-browsermcp` → `mcp-server-blindflight`
4. **Documentation update** — README, examples, all references

### Phase 5: Modularization (Low Risk, Internal Quality)
1. **Background script splitting** — Break ~1300 line background.js into modules
2. **Tool organization** — Group tools by domain (navigation, interaction, inspection)
3. **Utility extraction** — Shared helpers to `packages/types/` or internal packages

### Phase 6: Validation (Critical Gate)
1. **Acceptance test execution** — Run all behavior stability criteria
2. **Smoke testing** — Build + basic functionality verification
3. **Regression testing** — Compare against v1.0 behavior baselines

## Risk Assessment

| Phase | Risk Level | Primary Risk | Mitigation |
|-------|------------|--------------|------------|
| Phase 1: Foundation | LOW | Workspace misconfiguration | CI builds for both packages from start |
| Phase 2: Extension Modernization | MEDIUM | WXT manifest differences | Automated manifest comparison; manual XPI inspection |
| Phase 3: Protocol Hardening | MEDIUM | Runtime validation overhead | Benchmark message throughput; optimize if needed |
| Phase 4: Rebrand/Breaking Changes | HIGH | Tool rename breaks clients | Exhaustive acceptance testing; clear migration guide |
| Phase 5: Modularization | LOW | Import cycles | Lint rules; code review |
| Phase 6: Validation | HIGH | Undetected behavior changes | Comprehensive test matrix; v1.0 baseline comparison |

## MVP for v1.1 (Minimum Viable Restructure)

The minimum successful v1.1 delivers:

1. **TypeScript + WXT extension** — Modern foundation, MV2-compatible
2. **pnpm workspace** — Clean package boundaries
3. **Tool rename** — `browser_` prefix removed (breaking change)
4. **blindflight rebrand** — Consistent naming
5. **Behavior stability verified** — All acceptance criteria pass

Deferred to v1.2 or v2.0:
- Protocol hardening with Zod (can be added incrementally)
- Deep modularization (internal quality; not user-visible)
- MV3 support (not required for Firefox)
- Chrome support (evaluate based on demand)

## Explicit Exclusions (Scope Creep Prevention)

The following are **explicitly not in v1.1 scope**, regardless of how easy they seem "while we're touching the code":

1. **New browser tools** — No additional automation capabilities
2. **UI redesign** — Extension popup stays as-is
3. **Settings/configuration UI** — Extension options page deferred
4. **Session persistence improvements** — Storage state management deferred
5. **Anti-bot evasion** — Stealth features deferred
6. **Parallel session support** — Multi-tab automation deferred
7. **Vision mode** — Screenshot-based interaction deferred
8. **Code generation** — Export to Playwright/Puppeteer scripts deferred

## Sources

- Existing v1.0 implementation: `src/`, `extension/` directories
- WXT documentation (wxt.dev) — Modern WebExtension build tool
- Firefox Extension Workshop (extensionworkshop.com) — MV2 vs MV3 guidance
- pnpm workspaces documentation (pnpm.io) — Monorepo patterns
- Project reference: `/tmp/blindflight-extension/` — WXT + Vue starter template

---

*Feature research for: v1.1 Structural Improvements milestone*
*Researched: February 11, 2026*
