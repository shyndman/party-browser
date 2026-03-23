## Why

Today, several PartyBrowser interaction tools behave like this:

1. send the input action to the content script (`click`, `type`, `hover`, `drag`, `press_key`, `select_option`)
2. return success for the action itself
3. immediately ask for `getUrl`, `getTitle`, and `snapshot`

That is safe only when the page stays stable after the action. It breaks when the action triggers a real navigation.

Concrete failure story:

- The model calls `click` on a link or submit button.
- The DOM click succeeds.
- Firefox starts navigating the leased tab to a new document.
- The MCP layer immediately asks the extension for URL/title/snapshot.
- The old content script is going away or the new page is not ready yet.
- The follow-up `snapshot` or `getTitle` fails.
- The operator sees a confusing command failure even though the original click did what it was supposed to do.

This is hard to debug because the system currently has split ownership:

- explicit navigation commands already wait for load in the extension background layer
- input commands do not
- session creation has another copy of wait-for-load behavior
- MCP wrappers do their own immediate post-action readback without knowing whether the tab is stable

The result is a workflow that tells the truth only some of the time. A command may fail for the readback phase, but the logs do not clearly explain that the action succeeded and the later stabilization/readback phase failed.

## What Changes

- Introduce one explicit lifecycle for input commands that return updated page state.
- Move load-wait ownership into a shared background-controlled path instead of leaving it split across navigation code, session management, and MCP wrappers.
- Fail fast if the leased tab is already loading before the input command starts.
- Detect whether the action left the tab loading and, if so, wait before reading back page state.
- Keep failure semantics strict: action, stabilization, and readback are one command workflow, so failure in any phase fails the command.
- Keep the current MCP response shape: action summary plus URL/title/snapshot.
- Improve workflow logging so operators can see the command story phase by phase instead of guessing from isolated log lines.

## Commands Affected

Primary behavior change:

- `click`
- `type`
- `hover`
- `drag`
- `press_key`
- `select_option`

Related commands that should share the same stabilization owner after refactor:

- `navigate`
- `go_back`
- `go_forward`

Readback commands that stay separate user-facing tools but are part of the internal post-action workflow:

- `getUrl`
- `getTitle`
- `snapshot`

> [!REVIEW]
> you know what? 
> 
> I would like to introduce a new method (and not remove anything), that combines these three things. the back and forth just seems so silly when it happens so frequently


## Capabilities

### New Capabilities
- `input-command-lifecycle`: Executes eligible input commands through one background-owned workflow that can inspect tab state before and after the action, decide whether a wait is required, and only then capture follow-up page state.
- `phase-aware-command-logging`: Emits logs that show the user command, internal follow-up phases, and exact failure point for a command workflow.

### Modified Capabilities
- `browser-interaction-commands`: Click, type, hover, drag, press-key, and select-option stop relying on ad hoc immediate readback in MCP wrappers and instead participate in the shared lifecycle.
- `page-state-readback`: Post-action URL/title/snapshot readback happens only after the lifecycle decides the tab is stable enough to inspect.
- `navigation-stabilization`: Existing wait-for-load behavior used by explicit navigation commands and session setup is extracted into reusable lifecycle code instead of staying duplicated.

## Impact

Likely code areas affected:

- `packages/extension/src/commands/interaction.ts` for input command dispatch
- `packages/extension/src/commands/navigation.ts` for shared navigation stabilization ownership
- `packages/extension/src/session/session-manager.ts` for the duplicated wait-for-load logic used during lease creation
- `packages/extension/src/commands/command-handler.ts` if shared workflow plumbing needs a central entry point
- `packages/extension/wxt.config.ts` to add the Firefox `webNavigation` permission
- `packages/mcp/src/tools/common.ts` and other MCP interaction tool wrappers that currently dispatch then immediately format a result
- `packages/mcp/src/utils/aria-snapshot.ts`, which currently performs immediate `getUrl` / `getTitle` / `snapshot` readback
- extension and hub logging paths that need shared request/phase identifiers

Likely test areas affected:

- extension command tests for navigation and interaction commands
- session-manager tests for load waiting and cleanup behavior
- MCP tool tests that assert response shape and end-to-end interaction output

Platform impact:

- add the Firefox WebExtensions `webNavigation` permission to the existing Manifest V2 extension
- no new npm package or runtime dependency
- keep all existing MCP response contracts intact

Operational impact:

- operators should get fewer false negatives where a click really navigated but the command failed because the follow-up snapshot raced the new page
- when failure does happen, logs should say whether it was the precondition, action dispatch, wait, or readback phase that failed
