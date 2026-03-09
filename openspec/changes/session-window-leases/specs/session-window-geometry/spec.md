## ADDED Requirements

### Requirement: Approved session window uses deterministic inset geometry
The extension SHALL create a normal browser window for each approved session using deterministic insets derived from the currently focused browser window bounds at approval time: left +200 pixels, top +400 pixels, width -400 pixels, and height -600 pixels.

#### Scenario: Approval creates window with fixed insets
- **WHEN** a pending session receives an operator Join decision
- **THEN** the extension creates one normal browser window for that session using the configured inset geometry relative to the active browser window bounds

### Requirement: Approved session window remains in normal state
The extension MUST create approved-session windows in normal state and MUST NOT auto-minimize them.

#### Scenario: Window opens in normal state
- **WHEN** the extension creates the approved session window
- **THEN** the window state is normal and visible, allowing the operator to minimize it manually