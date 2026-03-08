## Extension-Initiated Request Flow (Exploration Notes)

### Locked Decisions

1. Hub spawns `opencode run` directly (no companion daemon).
2. Target tab is captured at request time.
3. Prompt input is freeform, effectively unbounded.
4. Main agent type is `partywebsurfer`.
5. Title is generated in preflight by a separate lightweight agent/model.
6. If title preflight fails, fallback title is `prompt.trim().slice(0, 80)`.
7. Waiting-room approval remains required for extension-originated requests.
8. Spawn happens immediately on request submission (before approval).
9. Exactly one browser session per request.
10. 5-minute execution timeout is real: hub terminates process after timeout.
11. Timeout starts at waiting-room approval (start of real work).
12. If bound tab closes after approval, hub terminates process and marks request failed.
13. If waiting-room decision is Reject, hub terminates process and marks request rejected.
14. Results are persisted; keep newest 10 entries, evict oldest FIFO.
15. Popup has two tabs: Waiting Room and History.
16. History rows use immutable model-generated title.
17. Popout opens dedicated extension page for selected item.
18. History sort is newest-first with no auto-scroll.
19. Store prompt + title + markdown result + requestId.
20. Markdown rendering should be safe (strip raw HTML/script), but keep normal markdown formatting/links.
21. Parse outputs from `opencode run --format json`; canonical output is last assistant text event.
22. Show `requestId` as secondary metadata in UI; keep `sessionId` internal.
23. Add Cancel action in both Waiting Room and History, visible only for in-progress requests.
24. Cancel semantics: terminate process, revoke session if present, mark request canceled.

### Remaining Design Questions

1. What is the exact `opencode run` command contract for each phase?
   - Title preflight: exact args (`--agent`, `--model`, `--dir`, prompt template)
   - Main run: exact args (`--agent partywebsurfer`, `--format json`, `--dir`, prompt template)

2. What is the concrete JSON event schema emitted by `opencode run --format json` in our environment?
   - Which event type/field carries assistant markdown text?
   - How do we deterministically identify the final assistant text event?

3. How is MCP registration injected for spawned runs from per-request temp dirs?
   - Do we write `opencode.json` into each workspace?
   - Do we rely on global user config plus `--dir`?
   - Which approach is canonical for this repo?

4. Where is `partywebsurfer` defined and loaded?
   - File location and format for agent instructions
   - Resolution rules so hub-spawned runs always pick it up

5. What hardcoded fallback should be used for `PARTYBROWSER_TITLE_MODEL`?
   - Need one concrete model ID to ship with

6. What `requestId` format is canonical?
   - UUID v4 vs timestamp+random vs other existing utility
   - Must be stable for storage keying and log correlation

7. How should history entries represent in-progress state internally?
   - Single status field in storage (internal-only) while keeping UI minimal
   - Required states for logic: pending/approved/running/completed/failed/rejected/canceled/timeout

8. On hub startup cleanup (delete request workspaces older than 7 days), what safety boundaries are required?
   - Exact root path guard (`/tmp/partybrowser/requests` only)
   - Directory name validation to avoid accidental deletion outside root

9. What should the fixed markdown timeout and failure note templates be?
   - Exact user-facing copy for timeout/reject/cancel/failure cases
