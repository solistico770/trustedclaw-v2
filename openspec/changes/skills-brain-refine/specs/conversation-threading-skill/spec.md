## ADDED Requirements

### Requirement: Conversation threading skill teaches multi-message grouping
The system SHALL include a `conversation-threading` skill that instructs the LLM to recognize multi-message conversations and group them into single cases using `group_key`.

#### Scenario: Multiple messages from same sender grouped
- **WHEN** triage processes 5 messages from the same sender within 30 minutes about the same topic
- **AND** the LLM has pulled or is using the conversation-threading skill
- **THEN** all 5 signals SHALL receive the same `group_key` in the triage decision
- **AND** they SHALL result in ONE case, not five

#### Scenario: Topic switch within same sender creates separate cases
- **WHEN** sender sends 3 messages about "invoice payment" then 2 messages about "meeting schedule"
- **THEN** the LLM SHALL assign two different `group_key` values
- **AND** two separate cases SHALL be created

#### Scenario: Group chat messages grouped by topic not sender
- **WHEN** a group chat contains messages from 3 different senders all discussing "project delivery"
- **THEN** the LLM SHALL use one `group_key` for all messages on that topic
- **AND** one case SHALL be created with all senders as entities

### Requirement: Conversation threading skill handles continuation
The skill SHALL instruct the LLM to check open cases for the same sender/topic before creating new cases, preferring `assign` over `create_case` for ongoing conversations.

#### Scenario: Follow-up message assigned to existing case
- **WHEN** sender has an open case about "invoice #123"
- **AND** a new signal from the same sender mentions "the invoice" or "the payment"
- **THEN** the LLM SHALL assign the signal to the existing case, not create a new one

### Requirement: Conversation threading is pull-on-demand
The `conversation-threading` skill SHALL have `auto_attach: false` with trigger condition "when multiple signals from same sender or same group appear in the batch."

#### Scenario: Single isolated signal doesn't need threading skill
- **WHEN** triage runs with signals from 50 unique senders (no sender appears twice)
- **THEN** the LLM SHALL NOT need to pull the conversation-threading skill
