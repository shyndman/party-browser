## ADDED Requirements

### Requirement: Extension-originated requests enter waiting room
The system SHALL enqueue extension-originated requests into the same waiting-room admission flow used for MCP join requests.

#### Scenario: Extension creates request
- **WHEN** a request is submitted from popup
- **THEN** a waiting-room entry is created and surfaced to operator controls

### Requirement: Operator decision remains mandatory
Extension-originated requests SHALL require explicit operator Join or Reject decision and MUST NOT auto-approve by default.

#### Scenario: No operator decision yet
- **WHEN** an extension-originated request is pending in waiting room
- **THEN** browser session approval is withheld until operator chooses Join or Reject

### Requirement: Reject decision terminates associated request process
The system SHALL terminate the spawned request process immediately when the operator rejects the waiting-room entry.

#### Scenario: Operator rejects pending request
- **WHEN** Reject is selected for an extension-originated waiting-room entry
- **THEN** the request process is terminated and outcome is recorded as rejected
