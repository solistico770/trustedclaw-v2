## ADDED Requirements

### Requirement: Signal data model
The system SHALL store incoming data as signals in a `signals` table (renamed from `messages`). Each signal SHALL have: id, user_id, gate_id, case_id (nullable), channel_id (nullable), raw_payload (JSONB, immutable), sender_identifier, channel_identifier, occurred_at, received_at, status, processing_decision (JSONB).

#### Scenario: Signal created from ingest
- **WHEN** a message arrives through any gate via the ingest API
- **THEN** a signal row is created with `status = 'pending'` and `case_id = NULL`

#### Scenario: Raw payload immutability preserved
- **WHEN** a signal is created
- **THEN** the raw_payload column SHALL be immutable (existing trigger carries over from messages table rename)

### Requirement: Signal status lifecycle
A signal's status SHALL be one of: `pending`, `processed`, `ignored`. Transitions: pending → processed (when assigned to a case or new case created), pending → ignored (when AI decides to discard).

#### Scenario: Signal assigned to existing case
- **WHEN** the AI triage assigns a pending signal to an existing case
- **THEN** signal.status becomes `processed`, signal.case_id is set to the case ID, and signal.processing_decision stores the AI reasoning

#### Scenario: Signal triggers new case creation
- **WHEN** the AI triage creates a new case from a pending signal
- **THEN** a new case is created, signal.status becomes `processed`, signal.case_id is set to the new case ID

#### Scenario: Signal ignored
- **WHEN** the AI triage decides a signal is noise/spam
- **THEN** signal.status becomes `ignored`, signal.case_id remains NULL, signal.processing_decision stores the reasoning

### Requirement: Ingest no longer creates cases
The ingest endpoint SHALL save the signal and return immediately. It SHALL NOT create a case. The response SHALL return `{ signal_id }` instead of `{ message_id, case_id }`.

#### Scenario: Ingest API response
- **WHEN** `POST /api/signals/ingest` is called with valid content and user_id
- **THEN** a signal is saved with status=pending, case_id=NULL, and the response contains `{ signal_id }` with HTTP 200

#### Scenario: Gate auto-creation preserved
- **WHEN** ingest is called without a gate_id
- **THEN** the system SHALL find or create a gate by type (unchanged behavior)

### Requirement: Migration from messages to signals
Existing message rows SHALL be migrated in-place via table rename. All existing rows SHALL be backfilled with `status = 'processed'` (since they already have case_id values).

#### Scenario: Existing data preserved
- **WHEN** the migration runs
- **THEN** all existing message rows exist in the signals table with status='processed' and their original case_id intact

#### Scenario: Nullable case_id
- **WHEN** the migration runs
- **THEN** the case_id column on signals SHALL allow NULL values (for pending signals)

### Requirement: Signal API endpoints
The system SHALL expose `GET /api/signals` (list with filters) and `GET /api/signals/[id]` (single signal detail).

#### Scenario: List signals with status filter
- **WHEN** `GET /api/signals?status=pending` is called by an authenticated admin
- **THEN** the response contains only signals with status=pending, ordered by received_at descending

#### Scenario: List signals with gate filter
- **WHEN** `GET /api/signals?gate_id=<uuid>` is called
- **THEN** the response contains only signals from that gate

#### Scenario: List signals with case assignment filter
- **WHEN** `GET /api/signals?assigned=false` is called
- **THEN** the response contains only signals where case_id IS NULL
