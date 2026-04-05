## ADDED Requirements

### Requirement: Memory importance skill teaches classification framework
The system SHALL include a `memory-importance` skill that provides the LLM with a structured framework for classifying signal/case importance based on content categories (money, legal, relationship, informational).

#### Scenario: Financial signal classified as high importance
- **WHEN** the LLM scans a case about invoice payment of 50,000 NIS
- **AND** the memory-importance skill is active
- **THEN** the LLM SHALL set importance ≤ 2 following the "money involved" rule

#### Scenario: Greeting message classified as low importance
- **WHEN** the LLM scans a case containing only "שלום, מה שלומך?"
- **THEN** the LLM SHALL set importance 3-4 following the "relationship maintenance" rule

### Requirement: Memory importance skill teaches rescan intelligence
The skill SHALL instruct the LLM to use contextual timing instead of relying on the default urgency x importance matrix for rescans.

#### Scenario: LLM sets context-aware rescan
- **WHEN** a case signal says "I'll send the document tomorrow"
- **AND** the memory-importance skill is active
- **THEN** the LLM SHALL use `set_next_scan` with a datetime of tomorrow morning
- **AND** SHALL NOT rely on the default matrix timing

#### Scenario: Addressed case with nothing pending defers rescan
- **WHEN** a case is set to "addressed" and no tasks or promises are pending
- **THEN** the LLM SHALL set `next_scan` to 3+ days from now

#### Scenario: Urgent case just classified doesn't need immediate rescan
- **WHEN** the LLM just scanned a case and set urgency=1, importance=1
- **AND** no new information is expected soon
- **THEN** the LLM SHALL override default (5 min) with a longer rescan (e.g., 2 hours)

### Requirement: Memory importance skill teaches what to track
The skill SHALL instruct the LLM on what information is worth creating entities/tasks for vs what can be ignored.

#### Scenario: Promise creates a task
- **WHEN** a signal contains "I'll send it by Sunday"
- **THEN** the LLM SHALL create a task with due_at set to the relevant Sunday

#### Scenario: Small talk doesn't create entities
- **WHEN** a signal is pure greeting with no business content
- **THEN** the LLM SHALL NOT create new entities for unknown senders in greeting-only signals

### Requirement: Memory importance skill is pull-on-demand
The skill SHALL have `auto_attach: false` with trigger "when setting urgency/importance or deciding rescan timing."

#### Scenario: Simple triage batch doesn't load importance skill
- **WHEN** triage is only assigning signals to existing cases (no new cases created)
- **THEN** the importance skill need not be pulled
