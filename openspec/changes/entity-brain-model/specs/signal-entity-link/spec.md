## ADDED Requirements

### Requirement: Direct signal-to-entity junction table
The system SHALL maintain a `signal_entities` table with columns `signal_id` (uuid FK), `entity_id` (uuid FK), `resolution_method` (text: auto/triage/scan/manual), and `created_at` (timestamptz), with primary key `(signal_id, entity_id)`.

#### Scenario: Auto-resolved signal creates link
- **WHEN** signal ingestion auto-resolves a sender to an entity
- **THEN** a row SHALL be inserted into `signal_entities` with `resolution_method = 'auto'`

#### Scenario: LLM triage creates entity and links signal
- **WHEN** the LLM creates an entity during triage and associates it with a signal
- **THEN** a row SHALL be inserted into `signal_entities` with `resolution_method = 'triage'`

#### Scenario: LLM case scan creates entity link
- **WHEN** the LLM creates or attaches an entity during case scan
- **THEN** rows SHALL be inserted into `signal_entities` for all signals in that case linked to the entity, with `resolution_method = 'scan'`

### Requirement: Query all signals for an entity
The system SHALL support querying all signals linked to a given entity, ordered by `occurred_at` descending, regardless of which case the signals belong to.

#### Scenario: Entity with signals across multiple cases
- **WHEN** a query requests signals for entity X
- **AND** entity X is linked to signals in Case #1, Case #5, and Case #12
- **THEN** the result SHALL include signals from all three cases, ordered by `occurred_at` descending

#### Scenario: Entity with no linked signals
- **WHEN** a query requests signals for an entity with no `signal_entities` rows
- **THEN** the result SHALL be an empty array

### Requirement: Backfill existing signal-entity links
The system SHALL include a one-time migration script that matches existing `signals.sender_identifier` to `entities.wa_jid` and creates `signal_entities` rows with `resolution_method = 'auto'` for all matches.

#### Scenario: Historical signals matched to entities
- **WHEN** the backfill runs
- **AND** signal S has `sender_identifier = '972501234567@c.us'` and entity E has `wa_jid = '972501234567@c.us'`
- **THEN** a `signal_entities` row SHALL be created linking S to E
