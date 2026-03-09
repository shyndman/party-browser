## MODIFIED Requirements

### Requirement: Extension manages per-session tab leases
The extension SHALL maintain an active lease map of `sessionId -> { windowId, tabId }` for approved sessions.

#### Scenario: Approved session creates a window-backed lease
- **WHEN** a session is approved with requested URL `U`
- **THEN** the extension creates a dedicated browser window containing a tab navigated to `U` and records `{ windowId, tabId }` for that `sessionId`

#### Scenario: Leased window closes
- **WHEN** the browser window bound to an active session lease is closed
- **THEN** the extension revokes that session lease and rejects subsequent commands for that `sessionId`

### Requirement: Session commands are isolated by lease
The extension SHALL route each command only to the tab bound to the provided `sessionId` within that session's leased window and MUST NOT route based on active tab, previous command context, or any implicit fallback.

#### Scenario: Multiple active sessions execute concurrently
- **WHEN** commands for two different active session IDs are processed
- **THEN** each command executes only against the tab bound to its own session lease

### Requirement: Approved session starts from requested URL
The extension SHALL use the join request `url` as the initial navigation target of the dedicated leased window created for session approval.

#### Scenario: Session approval includes URL
- **WHEN** a session is approved after waiting-room admission
- **THEN** the created session window's leased tab starts at the approved request URL