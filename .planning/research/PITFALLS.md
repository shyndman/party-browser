# Migration Pitfalls: v1.1 Structural Improvements

**Domain:** Browser MCP extension + MCP server migration (TS+WXT, pnpm workspace, rebrand)
**Researched:** 2026-02-11
**Confidence:** HIGH (based on official WXT docs, pnpm documentation, and Mozilla extension docs)

## Critical Pitfalls

### Pitfall 1: WXT Entrypoint API Access Outside Main Function

**What goes wrong:**
Extension APIs like `browser.webRequest`, `browser.tabs`, or `browser.storage` are accessed outside the `main()` function in WXT entrypoints, causing runtime failures or build-time errors. WXT polyfills these globals with `@webext-core/fake-browser` during build, but many APIs are not fully implemented in the fake.

**Why it happens:**
WXT imports entrypoint files into a NodeJS environment during build to extract metadata and generate the manifest. Code outside `main()` executes in this Node context where browser globals don't exist. Developers migrating from vanilla JS often put initialization code at module level.

**How to avoid:**
- Move ALL browser API calls inside `defineBackground(() => { ... })` or `defineContentScript(() => { ... })` main functions
- Never use `browser.*` at module scope (top-level imports are fine, but no API calls)
- Use `import { browser } from 'wxt/browser'` instead of relying on global `browser`
- Initialize WebSocket servers, event listeners, and storage access only inside `main()`

**Warning signs:**
- Build errors mentioning `@webext-core/fake-browser` or missing APIs
- Runtime errors: `browser.tabs is undefined` or similar
- Background script fails to start silently (check browser console)

**Phase to address:**
Phase 01 (WXT Setup + Entrypoint Migration) — this must be caught during the initial TypeScript conversion

---

### Pitfall 2: Firefox MV2 webRequest API Requires Persistent Background

**What goes wrong:**
Network capture via `webRequest` API fails silently or throws errors because WXT defaults to non-persistent background scripts for MV3 compatibility, but Firefox MV2 requires `persistent: true` for `webRequest` to work reliably.

**Why it happens:**
Current `background.js` uses `browser.webRequest.onBeforeRequest/ onCompleted/onErrorOccurred` for session-scoped network capture. WXT generates MV3-style service workers by default. While Firefox supports both MV2 and MV3, MV3 service workers have limited `webRequest` capabilities in some browsers, and the migration target explicitly preserves MV2.

**How to avoid:**
- Explicitly set `persistent: true` in `defineBackground()` for MV2 builds:
  ```typescript
  export default defineBackground({
    persistent: true,
    main() { /* ... */ }
  });
  ```
- Configure `wxt.config.ts` to target Firefox MV2 specifically:
  ```typescript
  export default defineConfig({
    manifest: ({ manifestVersion }) => ({
      // MV2-specific settings
      background: manifestVersion === 2 ? { persistent: true } : undefined,
    }),
  });
  ```
- Verify network capture still works after migration with a test session

**Warning signs:**
- Network logs are empty despite navigation
- `browser.webRequest.onBeforeRequest.addListener` throws "Invalid context" errors
- Background script unloads during network activity

**Phase to address:**
Phase 02 (Protocol Contract Hardening) — verify network capture after background script migration

---

### Pitfall 3: pnpm Workspace Cross-Package Import Failures

**What goes wrong:**
TypeScript builds fail with "Cannot find module" errors or runtime fails when importing from `packages/mcp` in `packages/extension` due to incorrect workspace configuration or missing `workspace:` protocol.

**Why it happens:**
Current single-package setup uses direct imports. After workspace migration, packages become isolated. pnpm requires explicit workspace dependencies using `workspace:*` or `workspace:^` protocol. TypeScript project references must be configured for cross-package type resolution.

**How to avoid:**
1. Add explicit workspace dependency in `packages/extension/package.json`:
   ```json
   {
     "dependencies": {
       "@blindflight/mcp": "workspace:*"
     }
   }
   ```
2. Configure TypeScript project references in root `tsconfig.json`:
   ```json
   {
     "references": [
       { "path": "./packages/mcp" },
       { "path": "./packages/extension" }
     ]
   }
   ```
3. Set `"composite": true` in each package's `tsconfig.json`
4. Use `tsc --build` instead of `tsc` for building

**Warning signs:**
- `pnpm install` succeeds but imports show red squiggles in IDE
- Build error: "Cannot find module '@blindflight/mcp' or its corresponding type declarations"
- Runtime error: Cannot resolve module after build

**Phase to address:**
Phase 01 (pnpm Workspace Migration) — validate with a test import immediately after setup

---

### Pitfall 4: Tool Name Change Breaks Existing MCP Clients

**What goes wrong:**
The clean-break removal of `browser_` prefix causes existing MCP clients and saved workflows to fail with "Tool not found" errors. Clients may cache tool lists or hardcode tool names.

**Why it happens:**
Current tool names: `browser_navigate`, `browser_click`, etc. After rename: `navigate`, `click`, etc. MCP clients (Claude Desktop, Cursor, etc.) may have:
- Hardcoded tool names in system prompts
- Saved conversation threads referencing old names
- Cached tool definitions from previous sessions

**How to avoid:**
1. **Do NOT rename in-place** — create aliases first
2. Register both names during migration period:
   ```typescript
   // Tool definition registers both
   { name: "navigate", aliases: ["browser_navigate"] }
   ```
   OR maintain dual registration in Phase 1, remove aliases in Phase 2
3. Update protocol documentation before code change
4. Provide migration guide for operators
5. Consider major version bump (v2.0) if breaking change is absolute

**Warning signs:**
- MCP client logs show: "Tool browser_navigate not found"
- Tools appear in client but invocations fail
- Session restoration fails for saved workflows

**Phase to address:**
Phase 04 (Clean-Break Renames) — must implement alias/compatibility layer first

---

### Pitfall 5: Message Protocol Schema Drift Between Server and Extension

**What goes wrong:**
TypeScript migration introduces subtle message shape changes (undefined vs null, missing fields, type mismatches) causing protocol failures between MCP server and extension. The WebSocket messages deserialize incorrectly or fail validation.

**Why it happens:**
Current JS code has implicit contracts. TS migration may:
- Change `undefined` to `null` for JSON serialization
- Add strict typing that rejects previously-tolerated extra fields
- Change discriminated union shapes (e.g., `browser_wait_for` modes)
- Alter error response structure

**How to avoid:**
1. Define shared message types in `packages/protocol` (shared workspace package)
2. Use Zod schemas for runtime validation on BOTH sides:
   ```typescript
   // Shared between server and extension
   export const MessageSchema = z.discriminatedUnion('type', [
     z.object({ type: z.literal('navigate'), url: z.string() }),
     // ...
   ]);
   ```
3. Add protocol version handshake on WebSocket connect
4. Snapshot current message shapes before migration (baseline test)
5. Run integration tests comparing serialized messages byte-for-byte

**Warning signs:**
- Extension receives messages but doesn't respond
- "Unknown message type" errors in logs
- Type mismatch errors on deserialization
- Behavior changes in wait conditions or element interactions

**Phase to address:**
Phase 02 (Protocol Contract Hardening) — establish shared types before modularization

---

### Pitfall 6: WXT Dev Mode HMR Conflicts with Extension Lifecycle

**What goes wrong:**
WXT's hot module replacement (HMR) causes background script reloads that lose WebSocket connection state, session state, or network capture listeners. Dev mode behaves differently than production.

**Why it happens:**
Current `background.js` maintains global state (sessionTabId, wsConnection, network listeners). WXT HMR reloads the background script on file changes, destroying:
- WebSocket connection to MCP server
- Session tab binding
- Network capture listeners
- Console log buffers

**How to avoid:**
1. Store session state in `browser.storage.session` (MV3) or `browser.storage.local` (MV2) instead of memory
2. Rehydrate state on background script startup:
   ```typescript
   export default defineBackground(() => {
     // Restore session on reload
     browser.storage.local.get(['sessionTabId']).then(({ sessionTabId }) => {
       if (sessionTabId) restoreSession(sessionTabId);
     });
   });
   ```
3. Re-register all listeners in `main()` (idempotent registration)
4. Test specifically in production build mode (`wxt build`) before release
5. Disable HMR for background script if problematic:
   ```typescript
   // wxt.config.ts
   export default defineConfig({
     vite: () => ({
       server: { hmr: false }
     })
   });
   ```

**Warning signs:**
- Extension loses connection after file save in dev mode
- Session tab becomes orphaned after reload
- Network capture stops intermittently
- Works in dev but fails in production build

**Phase to address:**
Phase 01 (WXT Setup) — design state management with HMR in mind from start

---

### Pitfall 7: Content Script Injection Timing Changes

**What goes wrong:**
After WXT migration, content script runs at different timing than before, causing race conditions where `browser.tabs.sendMessage` fails with "Could not establish connection" because content script hasn't loaded yet.

**Why it happens:**
Current `manifest.json` specifies:
```json
"content_scripts": [{
  "run_at": "document_end",
  "all_frames": true
}]
```

WXT's `defineContentScript` may default to different timing. Additionally, WXT's dev mode injection is different from production build injection.

**How to avoid:**
1. Explicitly specify `runAt` in WXT content script definition:
   ```typescript
   export default defineContentScript({
     matches: ['<all_urls>'],
     runAt: 'document_end',
     allFrames: true,
     main() { /* ... */ }
   });
   ```
2. Ensure content script signals readiness before background script sends commands
3. Add retry logic for sendMessage failures with exponential backoff
4. Verify against both `wxt dev` and `wxt build` outputs

**Warning signs:**
- "Could not establish connection. Receiving end does not exist." errors
- Commands fail on fresh tab but work on reload
- Race conditions between navigate and subsequent commands

**Phase to address:**
Phase 01 (Entrypoint Migration) — validate content script timing immediately

---

### Pitfall 8: Package Name Rebrand Leaves Orphaned References

**What goes wrong:**
The `blindflight` rebrand misses references in package.json, import paths, environment variables, or documentation, causing confusion, broken installs, or runtime failures.

**Why it happens:**
Current package is `@browsermcp/mcp`. Rebrand requires changing:
- Package names in all package.json files
- Import paths and namespace declarations
- Binary names (`mcp-server-browsermcp` → `mcp-server-blindflight`)
- Environment variable prefixes
- Documentation and README references
- MCP server name field in protocol handshake

**How to avoid:**
1. Create comprehensive rename checklist:
   - [ ] All `package.json` `name` fields
   - [ ] All `package.json` `bin` entries
   - [ ] Import paths and namespace declarations
   - [ ] MCP server constructor `name` parameter
   - [ ] Extension manifest `name` and `applications.gecko.id`
   - [ ] Environment variable prefixes (BROWSER_MCP_* → BLINDFLIGHT_*)
   - [ ] Log message prefixes ([Browser MCP] → [Blindflight])
   - [ ] Documentation and README
   - [ ] Binary shebang lines
2. Use grep to find all occurrences: `rg -i "browser.?mcp"`
3. Update MCP client configurations (Claude Desktop config, etc.)
4. Publish migration guide for operators

**Warning signs:**
- Package installs with old name but runs new code
- Mixed branding in logs (old and new names)
- MCP client shows old server name
- Binary commands fail after update

**Phase to address:**
Phase 04 (Rebrand) — systematic search-and-replace with verification script

---

### Pitfall 9: Extension Build Output Path Changes Break Distribution

**What goes wrong:**
WXT outputs to `.output/<target>/` instead of traditional `dist/` or `extension/`, breaking existing build scripts, XPI packaging, and CI/CD workflows.

**Why it happens:**
Current build uses custom scripts (`build-xpi.mjs`) expecting extension files in specific locations. WXT uses `.output/firefox-mv2-dev/` or `.output/firefox-mv2-prod/` by default with different structures.

**How to avoid:**
1. Update build scripts to reference new paths:
   ```javascript
   // Before
   const extensionDir = './extension';
   // After
   const extensionDir = './packages/extension/.output/firefox-mv2-prod';
   ```
2. Or configure WXT to use legacy paths:
   ```typescript
   // wxt.config.ts
   export default defineConfig({
     outDir: 'dist',
   });
   ```
3. Verify XPI packaging still works after migration
4. Update CI/CD workflows for new paths
5. Document new build output locations for operators

**Warning signs:**
- XPI build fails with "File not found" errors
- Extension files missing from distribution
- CI builds succeed but produce empty artifacts
- Dev mode works but production build fails

**Phase to address:**
Phase 01 (WXT Setup) — update build scripts immediately after WXT init

---

### Pitfall 10: TypeScript Strict Mode Breaks Existing Patterns

**What goes wrong:**
Enabling TypeScript strict mode (recommended for new projects) causes hundreds of errors in migrated JavaScript code, requiring extensive refactoring beyond the migration scope.

**Why it happens:**
Current JavaScript uses patterns that fail TypeScript strict checks:
- Implicit `any` types on function parameters
- `null`/`undefined` not in type unions
- Missing return type annotations
- Dynamic property access without index signatures
- Loose equality checks (`==` instead of `===`)

**How to avoid:**
1. Start with lenient `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "strict": false,
       "noImplicitAny": false,
       "strictNullChecks": false,
       "allowJs": true
     }
   }
   ```
2. Migrate files incrementally, enabling stricter checks package by package
3. Use `// @ts-ignore` or `// @ts-expect-error` with TODOs for known issues
4. Enable strict mode only after full migration is complete
5. Focus on type safety for protocol boundaries first (server ↔ extension)

**Warning signs:**
- Thousands of TypeScript errors on first build
- Developers disable type checking to proceed
- Type casts proliferate to silence errors
- Runtime behavior changes due to type-driven refactoring

**Phase to address:**
Phase 01 (TS Migration) — start lenient, enable strict gradually

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `browser_` prefix with aliases | Zero breaking changes | Technical debt, confusing naming | Phase 04 only — remove in v2.0 |
| Skip shared protocol package | Faster initial setup | Schema drift, duplication | Never — create protocol package in Phase 02 |
| Use `any` for message types | Faster migration | No type safety on protocol boundary | Phase 01 only — must harden in Phase 02 |
| Maintain JS content script | Avoid one file migration | Inconsistent patterns | Never — migrate all entrypoints together |
| Single tsconfig for all packages | Simpler config | Slow builds, no incremental compilation | Never — use project references |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MCP SDK types | Importing from wrong subpath | Use `@modelcontextprotocol/sdk/types.js` for type-only imports |
| WXT browser API | Using global `browser` without import | Always `import { browser } from 'wxt/browser'` |
| WebSocket server | Binding to localhost without port check | Check port availability, provide clear error on EADDRINUSE |
| Zod schemas | Runtime validation only on one side | Validate both incoming and outgoing messages |
| Firefox permissions | Missing `<all_urls>` in host permissions | Required for content script injection on all pages |
| Content script communication | Not handling connection failures | Always wrap sendMessage in try/catch with retry |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Memory leaks in content script | Growing RAM usage during long sessions | Clean up event listeners, avoid console override accumulation | Sessions > 30 minutes |
| Unbounded network log buffer | Extension slows down on busy pages | Keep MAX_LOG_SIZE ring buffer (1000 entries), verify in TS | High-traffic sites |
| TypeScript project references not configured | Slow builds, IDE lag | Configure `composite: true` and project references | >2 packages in workspace |
| WebSocket reconnection storm | CPU spikes on disconnect | Use exponential backoff with max retry limit | Unstable network |
| Content script reinjection on SPA navigation | Duplicate listeners, memory leaks | Check for existing initialization, use cleanup functions | Single-page apps |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `eval()` or `new Function()` in content script | XSS vulnerability if script content compromised | Use structured message passing instead of code evaluation |
| No CSP in extension manifest | Code injection via compromised dependencies | Add `content_security_policy` to manifest |
| WebSocket on 0.0.0.0 instead of localhost | Remote code execution risk | Bind only to 127.0.0.1 |
| Missing input validation on tool params | Arbitrary code execution | Use Zod schemas for all tool inputs |
| Extension content script on `file://` URLs | Local file access | Explicitly exclude `file://` from matches if not needed |
| Console log buffer includes sensitive data | Data leakage in logs | Sanitize or truncate logged data |

---

## "Looks Done But Isn't" Checklist

- [ ] **TypeScript Migration:** Type-checking passes but runtime behavior not verified — run full integration test suite
- [ ] **WXT Build:** Dev mode works but production build (`wxt build`) not tested — verify both modes
- [ ] **Protocol Contracts:** Types compile but serialization not verified — add roundtrip message tests
- [ ] **Firefox MV2:** Manifest generated but `webRequest` capture not tested — verify network logs populate
- [ ] **pnpm Workspace:** Packages build individually but cross-imports not tested — verify protocol imports work
- [ ] **Rebrand:** Names changed in code but CLI binary names not updated — verify `npm link` and bin paths
- [ ] **Background Script:** Migrated to TS but persistence not configured — verify `persistent: true` for MV2
- [ ] **Content Script:** Migrated but `runAt` timing not specified — verify `document_end` behavior preserved

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WXT API access outside main | LOW | Move code into main() function, rebuild |
| webRequest fails (non-persistent) | LOW | Add `persistent: true` to defineBackground config |
| pnpm workspace imports fail | MEDIUM | Fix workspace: protocol, rebuild, clear node_modules |
| Tool rename breaks clients | HIGH | Re-add browser_ aliases, release patch, deprecate gradually |
| Protocol schema drift | HIGH | Create shared protocol package, update both sides simultaneously |
| HMR state loss | MEDIUM | Implement storage-based state persistence, add rehydration logic |
| Content script timing issues | MEDIUM | Add explicit runAt configuration, retry logic for sendMessage |
| Rebrand incomplete | LOW | Systematic grep for old names, update remaining references |
| Build path changes | LOW | Update build scripts to use new paths or reconfigure WXT outDir |
| TypeScript strict mode overwhelm | MEDIUM | Disable strict flags, migrate incrementally, enable gradually |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| WXT Entrypoint API Access | Phase 01 | Build succeeds with no fake-browser errors; background starts |
| Firefox MV2 webRequest | Phase 02 | Network logs populate during test navigation |
| pnpm Workspace Imports | Phase 01 | Cross-package import compiles and resolves at runtime |
| Tool Name Breaking Change | Phase 04 | Existing MCP clients work with aliased names |
| Message Protocol Schema Drift | Phase 02 | Integration tests pass; message shapes match baseline |
| WXT HMR State Loss | Phase 01 | Background survives file save without losing connection |
| Content Script Timing | Phase 01 | Commands succeed on first navigation without retry |
| Rebrand Orphaned References | Phase 04 | grep shows zero occurrences of old branding |
| Build Output Path Changes | Phase 01 | XPI packaging produces valid extension file |
| TypeScript Strict Mode | Phase 01 | Build passes with stricter config each week |

---

## Sources

- WXT Official Documentation: https://wxt.dev/guide/essentials/entrypoints (Entrypoint API limitations, manifest configuration)
- WXT Manifest Configuration: https://wxt.dev/guide/essentials/config/manifest.html (MV2/MV3 compatibility)
- Mozilla MDN Background Scripts: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts (persistent vs non-persistent)
- pnpm Workspaces: https://pnpm.io/workspaces (workspace protocol, monorepo patterns)
- TypeScript Project References: https://www.typescriptlang.org/docs/handbook/project-references.html (cross-package compilation)
- Browser Extension Message Passing: https://developer.chrome.com/docs/extensions/develop/concepts/messaging (content script timing)
- TurboStarter Messaging Patterns: https://turbostarter.dev/docs/extension/structure/messaging (type-safe messaging)
- Timon La Blog: https://timon.la/blog/background-script-message-typing/ (typing background script communication)
- Mozilla MV3 Migration: https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/ (MV2 persistence requirements)
- Personal analysis of current codebase: `extension/background.js`, `extension/content-script.js`, `src/protocol/`

---

*Pitfalls research for: Browser MCP v1.1 Structural Migration (TS+WXT, pnpm, rebrand)*
*Researched: 2026-02-11*
