## 1. Finalize runtime contracts

- [ ] 1.1 Define exact `opencode run` argument contract for title preflight and main `partywebsurfer` execution
- [ ] 1.2 Document canonical JSON event extraction rules for selecting the final assistant text event
- [ ] 1.3 Define `requestId` generation format and persistence schema for history entries
- [ ] 1.4 Define fixed markdown templates for timeout, rejected, canceled, and generic failure outcomes

## 2. Implement hub request orchestration

- [ ] 2.1 Add hub request orchestration state model for submitted, approved, running, completed, canceled, rejected, failed, and timeout outcomes
- [ ] 2.2 Implement request workspace creation under `/tmp/partybrowser/requests/<requestId>` and startup cleanup for entries older than seven days
- [ ] 2.3 Implement `opencode run` spawn/monitor flow for title preflight with 30-second timeout and fallback title
- [ ] 2.4 Implement `opencode run` spawn/monitor flow for main request run with JSON event parsing and summary extraction
- [ ] 2.5 Enforce hard process termination on cancel, reject, tab-close signal, and 5-minute post-approval timeout
- [ ] 2.6 Add hub control commands/events needed for request creation, cancellation, progress fan-out, and result delivery

## 3. Implement extension request and history UX

- [ ] 3.1 Add popup request action with multiline freeform prompt form and submit/cancel interactions
- [ ] 3.2 Capture focused tab context at request submission and include it in request payload to hub
- [ ] 3.3 Split popup into Waiting Room and History tabs with newest-first history rendering and no auto-scroll
- [ ] 3.4 Persist rolling history of 10 entries with FIFO eviction and fields `{requestId, title, prompt, markdown}`
- [ ] 3.5 Render in-progress placeholder text (`In progress`) and safe markdown previews (first 3 rendered lines)
- [ ] 3.6 Add popout navigation to dedicated extension page for selected request (`history.html?requestId=...`)
- [ ] 3.7 Add Cancel actions in Waiting Room and History for in-progress requests only

## 4. Integrate session and waiting-room behavior

- [ ] 4.1 Ensure extension-originated requests enter standard waiting-room flow and require explicit Join/Reject
- [ ] 4.2 Bind approved session lease to tab captured at request submission time (no new tab creation for this flow)
- [ ] 4.3 Propagate tab-close lease revocation reason to hub for immediate request termination
- [ ] 4.4 Keep `sessionId` internal to routing/debug paths and expose only `requestId` in popup metadata

## 5. Verification

- [ ] 5.1 Add hub tests for process lifecycle transitions, timeout enforcement, and termination causes (cancel/reject/tab-close)
- [ ] 5.2 Add extension tests for popup tab switch, history persistence/eviction, and cancel visibility rules
- [ ] 5.3 Add integration test coverage for end-to-end request flow: submit -> approve -> execute -> summary surfaced
- [ ] 5.4 Add integration test for delayed or missing summary resulting in timeout termination and timeout note persistence
- [ ] 5.5 Run `openspec validate --change extension-agent-request-flow --strict` and fix any validation issues
