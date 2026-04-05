## ADDED Requirements

### Requirement: Entity timeline assembles all activity chronologically
The system SHALL provide an API endpoint or query function that returns a chronological timeline for any entity, combining signals, cases, and tasks into a unified ordered list.

#### Scenario: Entity with mixed activity
- **WHEN** the timeline is requested for entity X
- **AND** entity X has 5 linked signals, 2 linked cases, and 1 task
- **THEN** the result SHALL contain 8 entries, each with `event_type` (signal/case/task), `id`, `timestamp`, `content` preview, and `case_id` where applicable
- **AND** entries SHALL be ordered by timestamp descending

#### Scenario: Timeline respects limit parameter
- **WHEN** the timeline is requested with `limit=10`
- **AND** the entity has 50 signals, 5 cases, and 3 tasks
- **THEN** the result SHALL contain only the 10 most recent events

### Requirement: Timeline includes case events for richer context
The system SHALL include `case_events` (LLM scan results) in the entity timeline when the case is linked to the entity, so the LLM can see its own prior reasoning.

#### Scenario: Case event appears in entity timeline
- **WHEN** entity X is linked to Case #5
- **AND** Case #5 has a case_event from a scan that set status to "action_needed"
- **THEN** the timeline for entity X SHALL include that case_event with the scan's reasoning text

### Requirement: Timeline API endpoint
The system SHALL expose `GET /api/entities/[id]/timeline` returning the timeline as JSON, with optional query params `limit` (default 50) and `since` (ISO8601 datetime filter).

#### Scenario: API returns timeline JSON
- **WHEN** `GET /api/entities/{id}/timeline?limit=20` is called with valid auth
- **THEN** the response SHALL be `200` with JSON body `{ timeline: [...], entity_id: "...", count: N }`

#### Scenario: Timeline filtered by date
- **WHEN** `GET /api/entities/{id}/timeline?since=2026-03-01T00:00:00Z` is called
- **THEN** only events after March 1 2026 SHALL be included
