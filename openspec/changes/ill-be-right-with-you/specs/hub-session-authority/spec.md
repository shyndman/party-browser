## ADDED Requirements

### Requirement: Hub mints authoritative session IDs
The hub SHALL mint `sessionId` values for new join attempts and SHALL treat hub-issued IDs as the only valid session identifiers.

#### Scenario: Hub issues a new session ID for a join attempt
- **WHEN** an MCP client submits a valid join request
- **THEN** the hub returns a newly minted `sessionId` for that session lifecycle

### Requirement: Session IDs are 64-bit random with active collision checks
The hub SHALL generate `sessionId` values from a 64-bit random space and SHALL verify the generated ID is not present in active session state before assignment.

#### Scenario: Generated session ID collides with an active ID
- **WHEN** the hub generates a `sessionId` that already exists in active session state
- **THEN** the hub MUST generate a new ID and MUST NOT assign the colliding value

### Requirement: Hub binds sessions to one MCP connection
The hub SHALL bind each active `sessionId` to exactly one MCP connection and SHALL reject session-scoped messages that arrive on a different connection.

#### Scenario: Session-scoped message arrives from the wrong connection
- **WHEN** a message includes `sessionId = S` and arrives from a connection that is not bound to `S`
- **THEN** the hub SHALL reject the message with a hard authorization/routing error

### Requirement: Hub enforces strict envelope validation
The hub SHALL require `sessionId`, `requestId`, `type`, and `payload` on session-scoped envelopes. The hub MUST reject malformed, unknown, or incomplete envelopes and MUST NOT apply fallback routing.

#### Scenario: Envelope is missing required routing fields
- **WHEN** a session-scoped message is missing one or more required envelope fields
- **THEN** the hub SHALL return a hard protocol error and SHALL perform no routing side effects
