## ADDED Requirements

### Requirement: Hub spawns request-backed opencode processes
The hub SHALL spawn `opencode run` processes for extension-originated requests using request-specific workspace directories under `/tmp/partybrowser/requests/<requestId>`. The hub SHALL start title preflight and main agent execution as defined by request flow contracts.

#### Scenario: Extension submits new request
- **WHEN** the hub accepts a valid extension-originated request
- **THEN** the hub creates the request workspace and starts the configured opencode process lifecycle for that request

### Requirement: Waiting-room approval gates automation execution window
The hub SHALL require explicit waiting-room Join approval before treating a request as actively executing browser work. The 5-minute execution timeout SHALL start at approval time.

#### Scenario: Request remains pending in waiting room
- **WHEN** request process is running but Join has not been approved
- **THEN** the execution timeout is not started

### Requirement: Hub enforces hard termination conditions
The hub SHALL terminate the request process immediately on any of: user cancel, waiting-room reject, bound-tab-close signal after approval, or execution timeout expiration. If a session exists at termination time, the hub SHALL revoke it.

#### Scenario: Request exceeds execution timeout
- **WHEN** five minutes elapse after waiting-room approval without completion
- **THEN** the hub kills the request process, revokes any active session, and records timeout outcome

### Requirement: Startup cleanup removes stale request workspaces
On hub startup, the hub SHALL delete request workspaces older than seven days under `/tmp/partybrowser/requests` and MUST NOT delete paths outside that root.

#### Scenario: Hub starts with stale request directories
- **WHEN** startup cleanup runs and finds request directories older than seven days
- **THEN** only directories under `/tmp/partybrowser/requests` that exceed retention are removed
