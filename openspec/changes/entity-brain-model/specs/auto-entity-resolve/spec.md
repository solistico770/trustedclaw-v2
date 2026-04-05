## ADDED Requirements

### Requirement: Signal ingestion auto-resolves sender to entity
The signal ingestion endpoint SHALL, after dedup check and before returning, attempt to match the signal's sender identifier against known entities by `wa_jid` or `tg_user_id` and create a `signal_entities` link if found.

#### Scenario: WhatsApp signal matches known entity
- **WHEN** a WA signal arrives with `sender_jid = "972501234567@c.us"`
- **AND** an active entity exists with `wa_jid = "972501234567@c.us"` for this user
- **THEN** the system SHALL insert a `signal_entities` row with `resolution_method = 'auto'`
- **AND** the ingestion response SHALL include `entity_id` in the result

#### Scenario: Telegram signal matches known entity
- **WHEN** a TG signal arrives with `raw_payload.from.id = "123456789"`
- **AND** an active entity exists with `tg_user_id = "123456789"` for this user
- **THEN** the system SHALL insert a `signal_entities` row with `resolution_method = 'auto'`

#### Scenario: No matching entity found
- **WHEN** a signal arrives with a sender identifier that matches no entity
- **THEN** the system SHALL NOT create a `signal_entities` row
- **AND** ingestion SHALL proceed normally (the LLM will handle entity creation during triage)

#### Scenario: Duplicate signal skips entity resolution
- **WHEN** a signal arrives that matches an existing `dedup_hash`
- **THEN** the system SHALL NOT attempt entity resolution
- **AND** SHALL return the existing signal's ID with `dedup: true`

### Requirement: Auto-resolve is fast and non-blocking
The auto-resolve step SHALL add no more than 10ms to the ingestion response time under normal conditions (single indexed SELECT query).

#### Scenario: High-volume ingestion performance
- **WHEN** 100 signals are ingested sequentially
- **THEN** the average additional latency from auto-resolve SHALL be under 10ms per signal

### Requirement: Auto-resolve handles LID format JIDs
WhatsApp LID-format JIDs (`33436521762932@lid`) SHALL be matched against `wa_jid` the same way as phone-format JIDs (`972501234567@c.us`). The system SHALL treat `wa_jid` as an opaque string match.

#### Scenario: LID-format JID matches entity
- **WHEN** a signal arrives with `sender_jid = "33436521762932@lid"`
- **AND** an entity has `wa_jid = "33436521762932@lid"`
- **THEN** the system SHALL create the `signal_entities` link
