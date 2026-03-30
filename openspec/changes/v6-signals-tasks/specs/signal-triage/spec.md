## ADDED Requirements

### Requirement: Signal triage pass
The cron scan SHALL run a signal triage pass BEFORE the existing case review pass. The triage pass SHALL gather all pending signals (limit 20) and all open case summaries, then call the AI to decide per signal.

#### Scenario: Triage with pending signals
- **WHEN** the cron fires and there are pending signals
- **THEN** the system calls the AI with all pending signals + open case summaries and processes the returned decisions

#### Scenario: Triage with no pending signals
- **WHEN** the cron fires and there are zero pending signals
- **THEN** the triage pass is skipped and the cron proceeds directly to case review (pass 2)

#### Scenario: Runtime budget split
- **WHEN** the cron runs both passes
- **THEN** Pass 1 (triage) SHALL use at most 25 seconds, and Pass 2 (case review) SHALL use the remaining budget up to 55 seconds total

### Requirement: Triage AI prompt and response
The triage function SHALL send a single AI call with all pending signals and open case context. The AI SHALL return a decisions array with one entry per signal.

#### Scenario: AI assigns signal to existing case
- **WHEN** the AI returns `{ signal_id, action: "assign", case_id, reasoning }` for a signal
- **THEN** the signal's case_id is set, status becomes "processed", processing_decision stores the reasoning, and the case's signal_count and last_signal_at are updated

#### Scenario: AI creates new case from signal
- **WHEN** the AI returns `{ signal_id, action: "create_case", reasoning }` for a signal
- **THEN** a new case is created (status=open, urgency=3, importance=3, next_scan_at=now), the signal is linked to it, and signal status becomes "processed"

#### Scenario: AI batches multiple signals into one new case
- **WHEN** the AI returns `action: "create_case"` for multiple signals with the same `group_key`
- **THEN** a single case is created and all grouped signals are linked to it

#### Scenario: AI ignores signal
- **WHEN** the AI returns `{ signal_id, action: "ignore", reasoning }` for a signal
- **THEN** signal status becomes "ignored", case_id remains NULL, processing_decision stores the reasoning

### Requirement: Triage case event logging
Each triage pass SHALL create a case_event with event_type "signal_triage" on a system-level record. The event SHALL store the full AI input context, raw response, and execution results.

#### Scenario: Triage event recorded
- **WHEN** the triage pass completes
- **THEN** a case_event is created with event_type="signal_triage", in_context containing the signals and case summaries sent to AI, out_raw containing the AI response, and commands_executed containing the per-signal results

### Requirement: Triage audit trail
Each signal decision SHALL be logged in audit_logs.

#### Scenario: Signal assignment audited
- **WHEN** a signal is assigned to a case (existing or new)
- **THEN** an audit_log entry is created with actor="agent", action_type="signal_triaged", target_type="signal", target_id=signal.id, and reasoning from the AI

### Requirement: Case review reads signals
The existing case review pass (scanCase) SHALL read from the `signals` table instead of `messages`. All query references to messages SHALL be updated.

#### Scenario: Case scan fetches signals
- **WHEN** scanCase runs for a case
- **THEN** it fetches the last 20 signals for that case from the signals table (ordered by occurred_at)

### Requirement: Scan log tracks triage
The scan_logs table SHALL track triage results alongside case review results.

#### Scenario: Scan log includes triage stats
- **WHEN** a cron cycle completes
- **THEN** the scan_log entry includes signals_triaged count, signals_assigned count, signals_ignored count, and cases_created count from triage
