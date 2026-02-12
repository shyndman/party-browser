## ADDED Requirements

### Requirement: Extension manages per-session tab leases
The extension SHALL maintain an active lease map of `sessionId -> tabId` for approved sessions.

#### Scenario: Approved session creates a lease
- **WHEN** a session is approved with requested URL `U`
- **THEN** the extension creates a tab navigated to `U` and records `sessionId -> tabId`

### Requirement: Command execution requires explicit active session lease
The extension SHALL require a valid `sessionId` on command execution messages and SHALL reject commands if no active lease exists for that `sessionId`.

#### Scenario: Command omits session ID
- **WHEN** a command arrives without `sessionId`
- **THEN** the extension returns a hard error and executes nothing

#### Scenario: Command targets unknown session
- **WHEN** a command arrives with a `sessionId` that has no active lease
- **THEN** the extension returns a hard routing error and executes nothing

### Requirement: Session commands are isolated by lease
The extension SHALL route each command only to the tab bound to the provided `sessionId` and MUST NOT route based on active tab, previous command context, or any implicit fallback.

#### Scenario: Multiple active sessions execute concurrently
- **WHEN** commands for two different active session IDs are processed
- **THEN** each command executes only against its own leased tab

### Requirement: Approved session starts from requested URL
The extension SHALL use the join request `url` as the initial navigation target when creating a leased tab for an approved session.

#### Scenario: Session approval includes URL
- **WHEN** a session is approved after waiting-room admission
- **THEN** the created session tab starts at the approved request URL
