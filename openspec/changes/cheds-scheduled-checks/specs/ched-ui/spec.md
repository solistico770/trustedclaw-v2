## ADDED Requirements

### Requirement: Cheds page at /cheds
The system SHALL provide an admin page at `/cheds` that lists all cheds for the current user. Each ched card SHALL display: title, trigger type badge (interval/after_llm_change), active/paused status badge, interval (human-readable like "every 1h"), last_run_at (relative time), next_run_at (relative time), and a truncated last_result preview.

#### Scenario: View cheds list
- **WHEN** the admin navigates to /cheds
- **THEN** all cheds SHALL be listed sorted by created_at descending

#### Scenario: Empty state
- **WHEN** no cheds exist
- **THEN** a helpful empty state SHALL be shown with a "Create your first ched" prompt

### Requirement: Create/edit ched form
The page SHALL include an inline form (or modal) for creating and editing cheds. Fields: title (text input), context (textarea — LLM instructions), trigger_type (radio: interval / after LLM change), interval (number input + unit selector: minutes/hours/days — only shown for interval type). Editing SHALL pre-populate all fields.

#### Scenario: Create interval ched
- **WHEN** the admin fills the form with trigger_type=interval, interval=1 hour
- **THEN** the ched SHALL be created with interval_seconds=3600

#### Scenario: Edit existing ched
- **WHEN** the admin clicks edit on a ched
- **THEN** the form SHALL pre-populate with current values and submit as PUT

### Requirement: Toggle active/inactive
Each ched card SHALL have a toggle switch to activate/deactivate. Toggling SHALL call POST /api/cheds/[id]/toggle and update the UI optimistically.

#### Scenario: Toggle ched off
- **WHEN** the admin toggles a ched to inactive
- **THEN** the ched card SHALL show a "Paused" badge and the scanner SHALL skip it

### Requirement: Run Now button
Each ched card SHALL have a "Run Now" button that triggers POST /api/cheds/[id]/run. While running, the button SHALL show a loading state. After completion, the last_result SHALL update.

#### Scenario: Manual run
- **WHEN** the admin clicks "Run Now"
- **THEN** the ched SHALL be evaluated immediately and the result displayed

### Requirement: Run history display
Each ched card SHALL be expandable to show recent runs from ched_runs (last 10). Each run entry SHALL show: ran_at, trigger_reason badge, result_text (expandable), duration_ms, commands_executed count.

#### Scenario: View run history
- **WHEN** the admin expands a ched card
- **THEN** the last 10 runs SHALL be shown with trigger reason and result

### Requirement: Navigation entry
The workspace toolbar SHALL include a "Cheds" tab with a ClipboardCheck (or similar) icon, positioned after Tasks and before Entities.

#### Scenario: Navigate to cheds
- **WHEN** the admin clicks the Cheds tab in the toolbar
- **THEN** the /cheds page SHALL load
