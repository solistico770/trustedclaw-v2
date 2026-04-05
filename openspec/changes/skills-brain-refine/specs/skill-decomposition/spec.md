## ADDED Requirements

### Requirement: Existing skills decomposed into atomic single-responsibility skills
The system SHALL replace the current 5 monolithic skills with 10 focused skills, each covering exactly one operation domain.

#### Scenario: Entity skill split into create, recall, and enrich
- **WHEN** the skills are seeded for a user
- **THEN** there SHALL be separate skills named `entity-create`, `entity-recall`, and `entity-enrich`
- **AND** the old monolithic `entity` and `entity-data` skills SHALL NOT exist

#### Scenario: Case management split into case-management and task-management
- **WHEN** skills are seeded
- **THEN** `case-management` SHALL focus on status/urgency/importance lifecycle
- **AND** `task-management` SHALL be a separate skill covering task creation, closing, and updates

#### Scenario: New skills for conversation threading, memory importance, and merge detection
- **WHEN** skills are seeded
- **THEN** skills named `conversation-threading`, `memory-importance`, and `merge-detection` SHALL exist
- **AND** each SHALL have instructions specific to its domain

### Requirement: Each skill has a trigger condition
Every skill SHALL have a `summary` field that includes a clear trigger condition describing WHEN the LLM should pull it (e.g., "PULL when creating new entities").

#### Scenario: Skill summary includes trigger
- **WHEN** skills are listed in the AVAILABLE SKILLS section of the prompt
- **THEN** each non-auto-attach skill SHALL show as: `SKILL "name" [PULL when <trigger>]: summary. Suggests: <other-skill>`

### Requirement: Skills can suggest related skills
Each skill's instructions MAY include a `SUGGESTS:` section listing other skill names the LLM should consider pulling alongside this one.

#### Scenario: entity-create suggests entity-recall
- **WHEN** the LLM pulls the `entity-create` skill
- **THEN** the skill instructions SHALL include `SUGGESTS: entity-recall` to encourage dedup checking via entity history
