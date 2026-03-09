## ADDED Requirements

### Requirement: Request target tab is fixed at submission time
The extension SHALL capture the focused tab at request submission and SHALL use that captured tab as the session lease target when approval occurs.

#### Scenario: User changes focus before approval
- **WHEN** a request is submitted on tab A and user switches to tab B before Join approval
- **THEN** the approved session lease binds to tab A

### Requirement: Approved extension request reuses captured tab lease
For extension-originated requests, the extension SHALL bind the approved session to the captured existing tab and MUST NOT create a new background tab for that session.

#### Scenario: Extension-originated request is approved
- **WHEN** waiting-room Join decision is applied for an extension request
- **THEN** the session lease maps to the captured existing tab

### Requirement: Tab close revokes lease and propagates termination signal
If a leased target tab closes after approval, the extension SHALL revoke the lease and propagate closure state so request orchestration can terminate the associated process.

#### Scenario: Leased tab is closed during execution
- **WHEN** the user closes the tab bound to an active session lease
- **THEN** the session lease is revoked and request orchestration is notified of tab-close termination reason
