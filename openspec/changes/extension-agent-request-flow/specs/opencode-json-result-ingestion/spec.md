## ADDED Requirements

### Requirement: Opencode runs emit JSON event streams for parsing
The system SHALL invoke both title preflight and main agent runs with `opencode run --format json` and SHALL consume structured JSON events from stdout as the canonical output stream.

#### Scenario: Opencode emits mixed non-JSON noise
- **WHEN** stdout contains non-JSON lines alongside JSON events
- **THEN** only valid JSON events are considered for output extraction

### Requirement: Canonical textual output is last assistant text event
For both title and summary extraction, the system SHALL use the last assistant text event in the parsed JSON stream as canonical output.

#### Scenario: Multiple assistant text events are emitted
- **WHEN** the JSON stream contains several assistant text events
- **THEN** the final assistant text event is selected as canonical output

### Requirement: Title preflight has bounded latency and deterministic fallback
Title preflight SHALL run with a lightweight model and SHALL time out after 30 seconds. On timeout or parse failure, the title SHALL fall back to `prompt.trim().slice(0, 80)`.

#### Scenario: Title preflight times out
- **WHEN** preflight does not produce a canonical title output within 30 seconds
- **THEN** the request continues with fallback title derived from the first 80 trimmed prompt characters

### Requirement: Summary markdown is sanitized before rendering
The system SHALL preserve markdown formatting while stripping unsafe raw HTML/script content prior to inline or popout rendering.

#### Scenario: Summary contains raw script tag
- **WHEN** canonical summary markdown includes raw HTML script content
- **THEN** rendered output excludes unsafe script content while retaining safe markdown text and links
