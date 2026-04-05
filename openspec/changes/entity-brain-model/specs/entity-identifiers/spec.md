## ADDED Requirements

### Requirement: Entities store channel-native identifiers as indexed columns
The system SHALL store `wa_jid` (WhatsApp JID) and `tg_user_id` (Telegram user ID) as dedicated text columns on the `entities` table, with a unique constraint per `(user_id, wa_jid)` and per `(user_id, tg_user_id)`.

#### Scenario: WhatsApp JID stored on entity creation
- **WHEN** the LLM creates an entity with a phone number extracted from a WA signal sender_identifier (e.g., `972501234567@c.us`)
- **THEN** the system SHALL populate the `wa_jid` column with the full JID string
- **AND** the `wa_jid` SHALL be queryable via index for fast lookup

#### Scenario: Telegram user ID stored on entity creation
- **WHEN** the LLM creates an entity from a Telegram signal containing `from.id`
- **THEN** the system SHALL populate the `tg_user_id` column with the Telegram numeric user ID as text

#### Scenario: Unique constraint prevents duplicate JIDs per user
- **WHEN** an entity is created with a `wa_jid` that already exists for the same `user_id`
- **THEN** the system SHALL reject the insert with a unique constraint violation
- **AND** the caller SHALL receive an error indicating the duplicate identifier

### Requirement: Migration populates wa_jid from existing data
The system SHALL include a migration that backfills `wa_jid` from existing `whatsapp_number` values by appending `@c.us` to numbers matching phone format (digits only, 10-15 chars).

#### Scenario: Existing entities with whatsapp_number get wa_jid
- **WHEN** the migration runs
- **THEN** entities with a valid `whatsapp_number` (digits only, 10-15 chars) SHALL have `wa_jid` set to `{whatsapp_number}@c.us`
- **AND** entities without `whatsapp_number` or with non-phone formats SHALL have `wa_jid` remain NULL

### Requirement: create_entity command accepts channel identifiers
The LLM's `create_entity` command type SHALL accept optional `wa_jid` and `tg_user_id` fields, which the agent scanner SHALL persist to the corresponding entity columns.

#### Scenario: LLM creates entity with wa_jid
- **WHEN** the LLM returns a `create_entity` command with `wa_jid: "972501234567@c.us"`
- **THEN** the agent scanner SHALL create the entity with the `wa_jid` column populated
- **AND** if an entity with that `wa_jid` already exists for the user, the scanner SHALL link the existing entity instead of creating a duplicate
