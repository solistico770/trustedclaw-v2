## ADDED Requirements

### Requirement: Scanner Pass 3 — Ched evaluation
The agent scanner cron SHALL execute a third pass after triage and case review. This pass SHALL find active cheds that are due for evaluation and call the LLM for each one. The pass SHALL respect the existing 55-second time budget — if less than 5 seconds remain after case review, cheds SHALL be skipped for this cycle.

#### Scenario: Interval ched is due
- **WHEN** an interval ched has is_active=true AND next_run_at <= now
- **THEN** the scanner SHALL evaluate it and set next_run_at = now + interval_seconds

#### Scenario: After-LLM-change ched fires
- **WHEN** an after_llm_change ched has is_active=true AND the current scan cycle modified data (triaged signals, updated cases, created tasks)
- **THEN** the scanner SHALL evaluate it

#### Scenario: After-LLM-change ched does NOT fire when nothing changed
- **WHEN** an after_llm_change ched has is_active=true BUT the current scan cycle made no changes (0 signals triaged, 0 cases scanned)
- **THEN** the scanner SHALL NOT evaluate it

#### Scenario: Time budget exhausted
- **WHEN** less than 5 seconds remain in the scan budget after case review
- **THEN** all ched evaluations SHALL be skipped for this cycle

### Requirement: Change tracking in scanner
The scan route SHALL track whether the current cycle made any changes. A `changesOccurred` boolean SHALL be true if any of: signals were triaged (totalTriaged > 0), cases were scanned (allResults.length > 0). This flag SHALL be passed to the ched evaluation function.

#### Scenario: Changes detected
- **WHEN** totalTriaged > 0 OR cases scanned > 0
- **THEN** changesOccurred SHALL be true

### Requirement: Ched LLM evaluation prompt
Each ched evaluation SHALL call Gemini with a prompt containing: (1) the ched's title and context as primary instructions, (2) a system state summary including counts of open cases by status, pending signals count, and recent scan activity, (3) for after_llm_change trigger: a summary of what changed in this cycle (signals triaged, cases created/updated), (4) current date/time. The LLM SHALL return JSON with: `report` (text — the check result/findings), `commands` (array — optional actions like create_task), `reasoning` (brief explanation).

#### Scenario: Ched evaluation returns a report
- **WHEN** the LLM returns { report: "All invoices are up to date", commands: [], reasoning: "..." }
- **THEN** the report text SHALL be stored in ched_runs.result_text and cheds.last_result

#### Scenario: Ched evaluation returns commands
- **WHEN** the LLM returns commands like [{ type: "create_task", title: "Follow up invoice #123" }]
- **THEN** the commands SHALL be executed (task created) and logged in ched_runs.commands_executed

### Requirement: Scan log extended for cheds
The scan_logs table entry SHALL include a `cheds_evaluated` count alongside existing signals_triaged and cases_scanned.

#### Scenario: Scan log with ched count
- **WHEN** a scan cycle evaluates 2 cheds
- **THEN** the scan_log entry SHALL include cheds_evaluated=2
