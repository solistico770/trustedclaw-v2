## ADDED Requirements

### Requirement: Entity dossier builder produces LLM-ready context
The system SHALL provide a function `buildEntityDossier(entityId)` that returns a structured text block summarizing the entity's identity, recent activity, open cases, and relationships — formatted for direct injection into LLM prompts.

#### Scenario: Full dossier for active entity
- **WHEN** `buildEntityDossier` is called for entity "חיים כהן" who has phone, wa_jid, 3 open cases, 12 recent signals, and 2 related entities
- **THEN** the output SHALL follow this format:
  ```
  ENTITY: חיים כהן (person) [active]
    Phone: 972501234567 | WA: 972501234567@c.us
    Open Cases: 3 (Case #12 "title", Case #18 "title", Case #25 "title")
    Recent Signals (last 7d): 12 messages
    Last Contact: 2 hours ago
    Related Entities: דני (employee), ABC בע"מ (company)
  ```
- **AND** the dossier SHALL be under 150 tokens

#### Scenario: Minimal entity with no history
- **WHEN** `buildEntityDossier` is called for an entity with only a name and type
- **THEN** the output SHALL contain only the identity line with no activity sections

### Requirement: Dossier respects token budget
The system SHALL cap each individual dossier at 150 tokens. Open cases SHALL be limited to the 5 most recent. Signal count SHALL be summarized (not listed individually). Related entities SHALL be limited to 5.

#### Scenario: Entity with extensive history stays within budget
- **WHEN** entity has 20 open cases, 500 signals, and 15 related entities
- **THEN** the dossier SHALL show only 5 most recent cases, signal count summary, and 5 related entities
- **AND** total token count SHALL not exceed 150

### Requirement: Batch dossier builder for triage context
The system SHALL provide `buildBatchDossiers(entityIds[])` that builds dossiers for multiple entities in a single database round-trip, returning a formatted text block of all dossiers.

#### Scenario: Triage batch with 10 resolved entities
- **WHEN** `buildBatchDossiers` is called with 10 entity IDs
- **THEN** the result SHALL be a single string with all 10 dossiers separated by newlines
- **AND** the total query count SHALL be O(1) not O(N) — using batch queries

### Requirement: Dossier injection in triage prompt
The triage prompt SHALL include a `KNOWN ENTITIES IN THIS BATCH` section containing dossiers for all entities auto-resolved from the pending signals batch.

#### Scenario: Triage sees entity history
- **WHEN** triage runs with 50 pending signals
- **AND** 8 signals auto-resolved to 5 distinct entities
- **THEN** the triage prompt SHALL include dossiers for those 5 entities after the EXISTING OPEN CASES section

### Requirement: Dossier injection in case scan prompt
The case scan prompt SHALL include dossiers for all entities linked to the case being scanned.

#### Scenario: Case scan sees entity context
- **WHEN** case scan runs for Case #12 which has 2 linked entities
- **THEN** the case scan prompt SHALL include dossiers for both entities
