## ADDED Requirements

### Requirement: Entity recall skill teaches LLM to use entity dossiers
The system SHALL include an `entity-recall` skill that instructs the LLM on how to interpret entity dossiers (from the entity-context-assembler) and use entity history to make better triage and scan decisions.

#### Scenario: LLM uses entity history to assign signal
- **WHEN** triage processes a signal from a known entity with 3 open cases
- **AND** the entity dossier shows Case #12 is about the same topic
- **AND** the entity-recall skill is active
- **THEN** the LLM SHALL assign the signal to Case #12 instead of creating a new case

#### Scenario: LLM detects entity pattern from history
- **WHEN** a case scan runs for entity "חיים" who contacts every month about invoices
- **AND** the entity dossier shows 5 previous invoice-related cases
- **THEN** the LLM SHALL note the recurring pattern in the entity's metadata via entity-enrich

### Requirement: Entity recall skill teaches cross-case awareness
The skill SHALL instruct the LLM to consider an entity's full case portfolio when making decisions, not just the current case.

#### Scenario: High-activity entity gets priority consideration
- **WHEN** an entity has 5+ open cases
- **THEN** the LLM SHALL consider whether cases can be merged or whether the entity needs escalation

#### Scenario: New entity vs known entity different handling
- **WHEN** a signal comes from a sender with no entity match (no dossier available)
- **THEN** the LLM SHALL create a new entity
- **WHEN** a signal comes from a sender with an existing entity and dossier
- **THEN** the LLM SHALL review the dossier before deciding assign vs create

### Requirement: Entity recall skill is pull-on-demand
The skill SHALL have `auto_attach: false` with trigger "when a known entity appears in signals (dossier available in KNOWN ENTITIES section)."

#### Scenario: Triage with all unknown senders doesn't need recall skill
- **WHEN** no signals in the batch auto-resolved to known entities
- **THEN** the KNOWN ENTITIES section is empty and the recall skill is not needed
