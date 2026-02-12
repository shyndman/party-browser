## ADDED Requirements

### Requirement: Kill switch off causes global revocation
When kill switch is turned off, the system SHALL revoke all pending and active sessions across hub and extension state.

#### Scenario: Kill switch is disabled during active operation
- **WHEN** the operator disables kill switch
- **THEN** all pending and active sessions transition to revoked/ended state

### Requirement: Revocation has precedence over approval and command execution
Revocation SHALL win over concurrent approval or command events for the same session.

#### Scenario: Approval and revocation race on the same session
- **WHEN** Join approval and revocation occur concurrently for one `sessionId`
- **THEN** the final session state is revoked and command execution is denied

### Requirement: Revocation is idempotent
Applying revocation more than once for the same session SHALL NOT create additional side effects beyond the first successful revocation.

#### Scenario: Duplicate revoke events are processed
- **WHEN** the system receives multiple revoke events for one `sessionId`
- **THEN** only the first event changes state and subsequent events are no-op

### Requirement: Extension deny is authoritative for local execution
When kill switch is off or a session is revoked, the extension SHALL reject local command execution even if upstream route state is stale.

#### Scenario: Command arrives while extension kill switch is off
- **WHEN** a command for any session reaches the extension after kill switch is disabled
- **THEN** the extension returns a hard deny error and executes nothing
