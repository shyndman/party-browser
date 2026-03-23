## Context

PartyBrowser currently has two different stabilization models. Explicit navigation commands (`navigate`, `go_back`, `go_forward`) wait in the extension background layer for tab load completion before returning, while input commands (`click`, `type`, `hover`, `drag`, `press_key`, `select_option`) forward directly to the content script and return immediately. The background wait logic is also duplicated outside command handling in `SessionManager`, so load stabilization already lacks a single owner even before input commands are considered. On the MCP side, several input tools then call a shared helper that reads URL, title, and accessibility snapshot immediately after the action.

That split produces false failures when an input action succeeds, starts a navigation, and the follow-up readback reaches the new tab state before the content script is ready again. The current code also does not preserve enough structure in logs to explain whether a later `snapshot` came from a user request or from post-action readback.

For implementation context, the current flow is roughly:

1. MCP tool wrapper sends an interaction command over the socket.
2. Extension background resolves the leased tab for the session.
3. Interaction command forwards the action to the content script.
4. MCP wrapper immediately asks for `getUrl`, `getTitle`, and `snapshot` and formats a combined response.

Explicit navigation commands follow a different path today:

1. background resolves the leased tab
2. background issues the browser navigation call
3. command-local wait logic waits for load completion
4. command returns

Session creation has yet another copy of wait-for-load behavior during lease window setup. A junior engineer should assume this proposal is primarily about consolidating those three partially-overlapping control paths into one truthful owner for tab stabilization.

This design follows the constraints established in discussion:
- strict outcomes are preferred over partial success; if the command contract includes post-action readback, failure in any phase fails the command
- extension logging should stay simple and console-based rather than introducing a logging framework
- command flow should stay procedural where possible, with events used narrowly as a completion signal instead of becoming the primary orchestration model
- if a tab is already loading before an input command starts, the command should fail fast so the unstable precondition is visible

## Goals / Non-Goals

**Goals:**
- Give input commands the same background-owned stabilization model that explicit navigation commands already have.
- Preserve a procedural command flow: inspect tab state before the action, run the action, inspect tab state after the action, wait only when the after-state shows an in-flight load.
- Arm any required load-completion listeners before dispatching the action so fast navigations cannot race the waiter.
- Keep command semantics strict: action + stabilization + readback are one workflow, and any phase failure fails the workflow.
- Make logs tell the command story clearly, including the parent user command, internal follow-up phases, and exact failure phase.

**Non-Goals:**
- Introducing partial-success response types for action-succeeded-but-snapshot-failed cases.
- Building a persistent navigation-event broker or global workflow engine.
- Adding a new extension logging framework or configurable extension log levels.
- Changing the shape of standalone user-requested `snapshot`, `getUrl`, or `getTitle` commands beyond the logging/origin metadata needed to tell workflows apart.

## Decisions

### 1. Input commands will use a single background-owned lifecycle wrapper

Input commands that currently return updated page state will run through one shared background workflow:
1. resolve target tab
2. read tab state before action
3. fail fast if the tab is already loading
4. arm a single-use load waiter for that tab
5. dispatch the action to the content script
6. read tab state after action
7. if the tab is still loading, await the already-armed waiter
8. capture follow-up page state
9. return the combined command result or fail the workflow

This extracts the existing duplicated background waiting behavior into a reusable lifecycle rather than leaving each command or manager to decide ad hoc.

Definitions used in this decision:

- **background-owned**: the extension background process, not the content script and not the MCP wrapper, is the source of truth for whether the tab is stable enough to continue. Content scripts can perform the DOM action, but they must not decide lifecycle policy because they are torn down during real navigations.
- **post-action readback**: the follow-up observation step that gathers page state after an action. In PartyBrowser today that means URL, title, and accessibility snapshot. This is still part of the same user command even though it may happen after navigation settles.
- **single-use waiter**: a command-local object/promise that listens only for one tab during one workflow. It is created before the action, awaited only if needed, and then always removed. It is not a shared global broker.
- **main-frame navigation**: the top-level document load for the tab itself, not iframe/subframe activity. The waiter must care about the tab's primary page lifecycle because subframe traffic should not make the command look like the whole page is still loading.

Expected preconditions:

- the command has a valid `sessionId`
- that session owns an active lease and tab
- the tab can still be resolved via `browser.tabs.get`
- the tab is not already loading before the action begins

Expected postconditions on success:

- the user action was dispatched successfully
- if the action triggered a real page load, that load reached a terminal successful state before readback
- the returned URL/title/snapshot describe the stable post-action page state, not an intermediate state
- the MCP response shape remains the same as today

Expected postconditions on failure:

- the command returns failure without pretending the workflow completed
- logs identify which phase failed
- any temporary event listeners are cleaned up

Why this approach:
- it matches the desired procedural style
- it keeps the background layer as the owner of tab lifecycle truth
- it avoids putting navigation detection inside content scripts that are torn down during real navigations

Alternatives considered:
- **Keep per-command ad hoc snapshot calls**: rejected because it preserves the current race and leaves no single owner for lifecycle or logging.
- **Make each input command decide its own wait behavior**: rejected because it duplicates policy and guarantees drift.

### 2. Navigation detection is procedural-first, using tab fields before and after the action

The primary decision point will come from tab state, not from event streams alone.

Expected cases:
- if the tab is already loading before the action, fail fast
- if the tab is stable after the action, proceed immediately to readback
- if the tab is loading after the action (with `status === "loading"`, optionally corroborated by `pendingUrl` when Firefox exposes it during a pending navigation), wait for completion before readback
- if the tab URL changed but the tab is already stable by the time the after-state is read, do not wait

Firefox WebExtensions documents `tabs.Tab.status` as `"loading"` or `"complete"`, and documents `pendingUrl` as present only while a navigation is pending. The lifecycle should therefore treat `status` as the primary procedural signal and `pendingUrl` as supplemental context when it exists, not as a permanent state field.

Step-by-step behavior expected from the lifecycle wrapper:

1. Resolve the leased tab ID from the session.
2. Read the tab record before dispatch. Capture enough fields to explain later decisions in logs (`status`, URL, and `pendingUrl` when available).
3. If the pre-action tab is already loading, fail immediately. Do not try to be helpful by waiting first; that would hide the unstable precondition.
4. Create the command-local waiter before dispatching the action.
5. Dispatch the DOM action or browser navigation call.
6. Read the tab record again after dispatch.
7. If the post-action tab reports `status: "complete"`, skip waiting and move directly to readback.
8. If the post-action tab reports `status: "loading"`, await the already-armed waiter.
9. After the wait resolves, perform URL/title/snapshot readback.
10. Return the same user-visible result shape as today.

This sequencing matters because it defines exactly what is locked behavior versus implementation detail:

- the waiter must exist before dispatch so fast navigations are not missed
- the decision to wait is based on observed post-action tab state, not on guesswork about which actions "usually navigate"
- readback happens after stabilization, not in parallel with it

Why this approach:
- it keeps the command flow readable and debuggable
- it limits event handling to the one thing events are uniquely good at: telling us when an already-observed in-flight load finishes or errors
- it avoids turning navigation detection into a fully event-driven state machine

Alternatives considered:
- **Pure event-driven orchestration**: rejected because it adds more statefulness than needed and makes control flow harder to reason about.
- **Pure before/after tab inspection with no listeners**: rejected because it can detect an in-flight load but cannot safely wait for its terminal outcome.

### 3. Load-completion waiting uses a single-use tab-scoped waiter armed before dispatch

The background layer will create a one-command waiter before dispatching the action. The waiter is passive unless the post-action tab state shows that a load is in progress. When awaited, it resolves on load completion, rejects on load error, and is always torn down in `finally`.

The waiter is intentionally single-use and command-local rather than persistent.

Implementation guidance:

- scope the waiter to one tab ID and one command correlation ID
- listen only for main-frame completion/error events for that tab
- treat timeout as a real command failure, not a silent fallback to snapshotting anyway
- put all listener removal in one cleanup path and call it from `finally` so success, error, and timeout all behave the same
- keep the waiter narrowly focused: it reports terminal load outcome; it does not own readback or response formatting

Failure modes the waiter must make explicit:

- browser reports navigation error
- browser never reports completion before timeout
- the tab closes while the command is waiting
- cleanup is skipped and later commands accidentally inherit stale listeners

Why this approach:
- it prevents missing fast navigation events
- it avoids a global listener registry or event broker
- it keeps ownership simple: one command, one waiter, one cleanup path

Alternatives considered:
- **Persistent listener that vends promises on demand**: rejected as unnecessary infrastructure with more correlation and cleanup complexity.
- **Attaching listeners only after the action finishes**: rejected because the start of a fast navigation can be missed.

### 4. Use `webNavigation` as the completion/error signal, with manifest permission added

Firefox supports `webNavigation`, and PartyBrowser currently does not request that permission or use the API. This design adds the `webNavigation` permission and uses tab-scoped, main-frame navigation events as the completion/error signal for the single-use waiter.

Tab state remains the primary detector. `webNavigation` is used because it provides the terminal outcome needed by the wait path.

Official Firefox WebExtensions docs require the `webNavigation` permission to use this API. PartyBrowser's extension is already a Firefox Manifest V2 extension (`manifest_version: 2`) with `strict_min_version: 109.0`, so this is a permission change inside the existing platform target, not a new package dependency.

Why this approach:
- the browser already exposes navigation lifecycle events that map directly to the required wait semantics
- `tabs.onUpdated` is already used today for explicit navigation commands, but `webNavigation` gives a more specific browser-navigation signal for completion/error
- using `webNavigation` only inside the waiter keeps the rest of the design procedural

Important boundary: adding `webNavigation` does not mean the design becomes event-driven overall. The sequence is still "inspect, dispatch, inspect, maybe wait, read back". `webNavigation` is only the completion/error notifier for the case where step 8 actually waits.

Alternatives considered:
- **Continue using only `tabs.onUpdated`**: acceptable but weaker; it provides a coarser load signal and less explicit navigation lifecycle semantics.
- **Infer completion from content-script availability**: rejected because receiver availability is an indirect symptom, not a trustworthy lifecycle boundary.

### 5. Command failure remains strict and does not collapse action/readback into “best effort” success

The workflow contract is: perform the action, stabilize the tab if required, and return post-action page state. If any phase fails, the command fails.

That includes:
- unstable precondition (tab already loading before the action)
- action dispatch failure
- navigation load error or timeout after the action
- post-action page-state readback failure

What this means in practice:

- if a click causes navigation and the new page never finishes loading, the whole command fails
- if the action succeeds but `snapshot` fails afterward, the whole command fails
- the logs should still reveal which earlier phases succeeded so operators can debug truthfully
- callers must not receive a plausible-looking success response built from stale or partial state

Why this approach:
- it preserves truth instead of smoothing over real workflow failures
- it avoids leaving the caller unsure whether the returned page state corresponds to the action they asked for
- it surfaces unstable or flaky conditions early while this behavior is still being hardened

Alternatives considered:
- **Partial success result that reports action success even if readback fails**: rejected because it hides real failures behind plausible output and makes operator debugging harder.

### 5a. Existing post-action MCP response shape is preserved

Input tools will continue to return the same user-visible shape they return today: a short action summary followed by the updated page URL, title, and snapshot. The new lifecycle wrapper changes when and how that state is produced, not the shape of the response contract.

Why this approach:
- it fixes lifecycle correctness without forcing unrelated MCP API churn
- it keeps existing operator and model expectations intact while the stabilization model changes underneath

Implementation reminder: preserving response shape does not mean preserving the current place where the response is assembled. The readback may move behind the shared lifecycle, but the tool output should still look the same to MCP clients.

Alternatives considered:
- **Normalize all post-action tools into a new wrapper-owned response format**: rejected because it mixes a correctness fix with an avoidable surface-area change.

### 6. Logging stays simple but becomes phase-aware and origin-aware

No new extension logging framework will be introduced. The hub keeps its structured, levelled logger. The extension keeps console logging, but logs for command workflows will include enough shared fields to tell the story:
- command/request identifier
- parent command identifier for internal follow-up phases
- phase (`begin`, `precondition_failed`, `action_dispatched`, `loading_detected`, `load_completed`, `snapshot_begin`, `snapshot_failed`, etc.)
- origin (`user` vs `system`)
- tab/session identifiers where relevant

This enables log nesting without changing the overall logging approach.

Concrete expected log story for a navigation-triggering click:

1. user-originated `click` command begins with one correlation ID
2. pre-action tab inspection logs `status=complete`
3. action dispatch logs success
4. post-action inspection logs that loading was detected
5. system-originated wait phase logs begin under the same parent command ID
6. wait phase logs load completion or failure
7. system-originated readback phase logs `getUrl`, `getTitle`, and `snapshot` as internal follow-up work, not new user commands
8. parent command logs final success or failure

For a failure case, the final error log should answer two questions immediately:

- which phase failed?
- was that phase user-originated action dispatch or system-originated stabilization/readback?

Simple extension logging is still fine here. The requirement is about truthful fields and sequencing, not a new logger package.

Why this approach:
- it gives operators causal visibility without introducing more logging machinery
- it makes later failures attributable: e.g. “snapshot failed as part of click workflow” instead of “snapshot failed” in isolation

Alternatives considered:
- **Add an extension logging framework with explicit levels**: rejected as unnecessary for this feature.
- **Keep current flat log lines**: rejected because they do not distinguish user commands from internally-triggered follow-up phases.
- **Push most workflow detail to hub logs only**: rejected because extension-side causality is essential when diagnosing browser lifecycle issues in real sessions.

## Risks / Trade-offs

- **[Pre-action fail-fast may reject commands during legitimate background page motion]** → This is intentional for the first version so unstable preconditions become visible instead of being hidden.
- **[Adding `webNavigation` increases extension permissions]** → The permission is narrow and justified by a concrete browser-lifecycle need; document the reason, expect the normal install-time permission surface for API permissions, and keep usage scoped to command-local waiters.
- **[Single workflow failure may feel harsher than today’s implicit partial success]** → This is a deliberate trade-off in favor of truthful outcomes and easier debugging.
- **[More detailed workflow logs could become noisy]** → Keep the message shape structured and tied to a single request identifier so noisy lines remain attributable and filterable.
- **[SPA-style changes may not trigger a real page load]** → The design only waits when the post-action tab state shows that a real load is in progress; otherwise it snapshots immediately.

Additional implementation risk to keep in mind:

- **[Main-frame filtering mistakes can cause false waits or missed waits]** → if the waiter reacts to iframe activity, commands may block unnecessarily; if it ignores the real top-level navigation, readback can still race the new page.

## Migration Plan

1. Extract the current background wait-for-load logic into reusable lifecycle code that can serve both explicit navigation commands and eligible input commands.
2. Add the `webNavigation` permission and implement the command-local, tab-scoped, main-frame waiter in the background layer.
3. Route `click`, `type`, `hover`, `drag`, `press_key`, and `select_option` through the lifecycle wrapper.
4. Repoint explicit navigation commands and any session setup path that still owns wait-for-load behavior to the same shared lifecycle decision code.
5. Move MCP-side post-action readback behind the lifecycle-managed result so MCP interaction tools stop issuing ad hoc immediate `getUrl` / `getTitle` / `snapshot` calls.
6. Add phase-aware log fields for the workflow in both extension and hub logs.
7. Verify both branches of the lifecycle: no-wait path for non-navigating actions and wait path for navigation-triggering actions.
8. Verify cleanup behavior explicitly so later commands do not inherit stale listeners or stale parent IDs.

Rollback strategy: remove the lifecycle wrapper from input commands, restore current direct action dispatch plus immediate readback, and remove the `webNavigation` permission if necessary.

No new npm or runtime package dependency is required for this design; all new external surface area is limited to the Firefox WebExtensions permission/API already available on the project's target platform.

## Open Questions

None currently.