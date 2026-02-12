## ADDED Requirements

### Requirement: Join request fields are mandatory
The system SHALL require `name`, `reason`, and `url` for every join request. The system MUST reject join requests that omit any required field.

#### Scenario: Join request omits reason
- **WHEN** an MCP client sends a join request without `reason`
- **THEN** the system SHALL reject the request with a hard validation error

### Requirement: Join requests block until operator decision
The system SHALL keep a join request pending until the operator explicitly chooses Join or Reject for that request.

#### Scenario: Join request remains unresolved while awaiting user action
- **WHEN** a valid join request is added to the waiting room
- **THEN** the MCP join call remains unresolved until a Join or Reject decision is recorded

### Requirement: Waiting-room time is hub-stamped
The system SHALL stamp `join_request_time` at hub receive-time and SHALL use that timestamp as the authoritative waiting-room event time.

#### Scenario: Join request enters waiting room
- **WHEN** the hub accepts a valid join request
- **THEN** the waiting-room entry includes `join_request_time` from the hub clock

### Requirement: Waiting-room ordering is presentation-only and deterministic
The waiting-room list SHALL be sorted for display by `join_request_time` ascending, with `sessionId` lexicographic tie-break for equal timestamps. Admission choice SHALL remain operator-driven and MUST NOT be inferred from list position.

#### Scenario: Two requests have identical timestamps
- **WHEN** two waiting-room entries share the same `join_request_time`
- **THEN** the display order uses `sessionId` lexicographic ordering as the tie-break

### Requirement: Operator decision returns explicit outcome
The system SHALL emit an explicit Join or Reject outcome for each pending request and SHALL include the chosen decision in the response path to the requesting MCP.

#### Scenario: Operator rejects a pending request
- **WHEN** the operator selects Reject for a pending waiting-room entry
- **THEN** the requesting MCP receives a reject outcome for that request
