## ADDED Requirements

### Requirement: Extension request form captures freeform prompt for current tab
The extension SHALL provide a request action in popup UI that opens a multi-line freeform prompt form. The extension SHALL bind the request to the currently focused tab at submission time.

#### Scenario: User submits request from popup
- **WHEN** the user enters a prompt and confirms request submission
- **THEN** the extension creates a request payload containing the full prompt and the focused tab context at submission time

### Requirement: Request history persists last 10 entries
The extension SHALL persist request history entries with `requestId`, immutable title, original prompt, and markdown result. The extension SHALL retain at most 10 entries and MUST evict the oldest entry when adding an 11th entry.

#### Scenario: New request exceeds history capacity
- **WHEN** a new request entry is persisted while 10 entries already exist
- **THEN** the oldest entry is removed and the new entry is stored

### Requirement: History UI shows in-progress placeholder and popout access
The popup SHALL include a History tab that lists entries newest-first without auto-scrolling. In-progress entries SHALL render body preview text "In progress" until replaced by a final outcome, and each entry SHALL offer a popout link to a dedicated extension page for that request.

#### Scenario: Request has not completed yet
- **WHEN** a request entry is created and no final summary is available
- **THEN** the History tab displays the generated title with preview text "In progress"

### Requirement: Cancel action is available for in-progress requests
The extension SHALL expose Cancel actions in Waiting Room and History for in-progress requests only. Completed, failed, rejected, canceled, or timed-out entries MUST NOT show active Cancel controls.

#### Scenario: User views completed request in history
- **WHEN** a request entry is already completed
- **THEN** no actionable Cancel control is shown for that entry
