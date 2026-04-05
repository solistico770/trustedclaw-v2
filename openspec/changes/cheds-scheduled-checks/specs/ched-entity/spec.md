## ADDED Requirements

### Requirement: Cheds table schema
The system SHALL store cheds in a `cheds` table with columns: `id` (uuid PK default gen_random_uuid()), `user_id` (uuid FK to auth.users NOT NULL), `title` (text NOT NULL), `context` (text NOT NULL — LLM instructions), `trigger_type` (text NOT NULL CHECK IN ('interval', 'after_llm_change')), `interval_seconds` (integer — required for interval type), `is_active` (boolean default true), `next_run_at` (timestamptz — NULL for after_llm_change type), `last_run_at` (timestamptz), `last_result` (text), `created_at` (timestamptz default now()), `updated_at` (timestamptz default now()). RLS SHALL be enabled with policies matching the existing per-user pattern (user sees own data, service role has full access).

#### Scenario: Create interval ched
- **WHEN** a ched is inserted with trigger_type='interval' and interval_seconds=3600
- **THEN** next_run_at SHALL be set to now() + interval '3600 seconds'

#### Scenario: Create after_llm_change ched
- **WHEN** a ched is inserted with trigger_type='after_llm_change'
- **THEN** next_run_at SHALL be NULL and interval_seconds MAY be NULL

### Requirement: Ched runs table schema
The system SHALL store ched execution history in a `ched_runs` table with columns: `id` (uuid PK default gen_random_uuid()), `ched_id` (uuid FK to cheds NOT NULL), `user_id` (uuid FK to auth.users NOT NULL), `trigger_reason` (text NOT NULL CHECK IN ('scheduled', 'llm_change', 'manual')), `result_text` (text), `commands_executed` (jsonb default '[]'), `duration_ms` (integer), `ran_at` (timestamptz default now()). RLS SHALL match the cheds table pattern.

#### Scenario: Log a ched run
- **WHEN** a ched evaluation completes
- **THEN** a row SHALL be inserted into ched_runs with the ched_id, trigger_reason, result text from LLM, any commands executed, and duration

### Requirement: Cheds CRUD API
The system SHALL expose REST endpoints at `/api/cheds` (GET list, POST create) and `/api/cheds/[id]` (GET detail, PUT update, DELETE). All endpoints SHALL require authentication via the existing `requireAdmin` pattern. GET list SHALL support `?active=true|false` filter. POST/PUT SHALL validate that interval cheds have interval_seconds > 0.

#### Scenario: Create a ched via API
- **WHEN** POST /api/cheds with { title, context, trigger_type, interval_seconds }
- **THEN** the ched SHALL be created and returned with id and next_run_at computed

#### Scenario: Update a ched
- **WHEN** PUT /api/cheds/[id] with updated fields
- **THEN** the ched SHALL be updated and updated_at set to now()

#### Scenario: Delete a ched
- **WHEN** DELETE /api/cheds/[id]
- **THEN** the ched and its ched_runs SHALL be deleted (CASCADE)

### Requirement: Manual ched trigger API
The system SHALL expose POST `/api/cheds/[id]/run` to manually trigger a ched evaluation. This SHALL run the ched immediately regardless of trigger_type or next_run_at, and log the run with trigger_reason='manual'.

#### Scenario: Run now
- **WHEN** POST /api/cheds/[id]/run
- **THEN** the ched SHALL be evaluated immediately and a ched_run created with trigger_reason='manual'

### Requirement: Toggle ched active state API
The system SHALL expose POST `/api/cheds/[id]/toggle` to flip is_active. When deactivated, the ched SHALL NOT be picked up by the scanner. When reactivated with trigger_type='interval', next_run_at SHALL be recalculated from now.

#### Scenario: Deactivate ched
- **WHEN** POST /api/cheds/[id]/toggle on an active ched
- **THEN** is_active SHALL become false
