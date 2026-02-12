# type-safe-wait-for-payload Specification

## Purpose
TBD - created by archiving change remove-wait-for-any-cast. Update Purpose after archive.
## Requirements
### Requirement: Wait For Payload Is Type-Safe

The MCP server MUST dispatch `wait_for` messages without using `any` casts, and MUST preserve mode-specific payload shapes.

#### Scenario: Time mode payload dispatch

- **WHEN** `wait_for` is called with `mode` set to `time`
- **THEN** the dispatched payload includes `mode: "time"` and numeric `value`
- **AND** `timeout` remains optional

#### Scenario: Text mode payload dispatch

- **WHEN** `wait_for` is called with `mode` set to `text`
- **THEN** the dispatched payload includes `mode: "text"`, string `value`, and required `timeout`

#### Scenario: Text gone mode payload dispatch

- **WHEN** `wait_for` is called with `mode` set to `text_gone`
- **THEN** the dispatched payload includes `mode: "text_gone"`, string `value`, and required `timeout`

#### Scenario: Existing behavior is preserved

- **WHEN** a valid `wait_for` request is processed
- **THEN** the user-facing completion message format remains unchanged for each mode

