## ADDED Requirements

### Requirement: Signals page at /signals
The system SHALL have a dedicated `/signals` page accessible from the sidebar navigation. It SHALL display all signals for the current user with filtering and search.

#### Scenario: Page loads with all signals
- **WHEN** user navigates to /signals
- **THEN** the page displays signals ordered by received_at descending, showing: content preview (truncated), gate type, sender, status badge, linked case number (if any), received timestamp

### Requirement: Signal status filter
The signals page SHALL have a status filter with options: All, Pending, Processed, Ignored.

#### Scenario: Filter by pending
- **WHEN** user selects "Pending" filter
- **THEN** only signals with status=pending are shown

#### Scenario: Default filter
- **WHEN** user first loads /signals
- **THEN** the default filter shows "All" signals

### Requirement: Signal gate filter
The signals page SHALL have a gate/source filter showing available gate types.

#### Scenario: Filter by gate type
- **WHEN** user selects "WhatsApp" gate filter
- **THEN** only signals from WhatsApp gates are shown

### Requirement: Signal assignment filter
The signals page SHALL have an assignment filter: All, Assigned (has case_id), Unassigned (case_id is NULL).

#### Scenario: Filter unassigned signals
- **WHEN** user selects "Unassigned" filter
- **THEN** only signals where case_id IS NULL are shown

### Requirement: Signal search
The signals page SHALL support text search across signal content and sender identifier.

#### Scenario: Search by content
- **WHEN** user types "invoice" in search box
- **THEN** only signals whose raw_payload content or sender_identifier contains "invoice" are shown

### Requirement: Signal detail expansion
Each signal row SHALL be expandable to show the full signal content and processing decision (if processed/ignored).

#### Scenario: Expand processed signal
- **WHEN** user clicks on a processed signal row
- **THEN** the full raw_payload content is shown, along with the AI's processing_decision reasoning and the linked case link

#### Scenario: Expand ignored signal
- **WHEN** user clicks on an ignored signal row
- **THEN** the full content is shown along with the AI's reasoning for ignoring it

### Requirement: Signal-to-case navigation
Processed signals SHALL link to their associated case.

#### Scenario: Click case link
- **WHEN** user clicks the case number on a processed signal
- **THEN** user is navigated to /cases/[id] for that case

### Requirement: Real-time signal updates
The signals page SHALL subscribe to real-time changes on the signals table (same pattern as dashboard).

#### Scenario: New signal arrives
- **WHEN** a new signal is ingested while user is on /signals page
- **THEN** the signal appears in the list without page refresh
