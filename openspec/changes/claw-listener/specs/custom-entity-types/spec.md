## ADDED Requirements

### Requirement: User-defined entity types
The system SHALL support custom entity types beyond the hardcoded list. Users SHALL be able to create new entity types via the settings UI. Entity types SHALL be stored in a new `entity_types` table and the CHECK constraint on `entities.type` SHALL be removed.

#### Scenario: Default entity types on first use
- **WHEN** the system initializes for a new user
- **THEN** the following default entity types exist: person, company, project, invoice, bank_account, contract, product, bot, task, other
- **THEN** each type has a display name, icon hint, and color

### Requirement: Entity types table
A new `entity_types` table SHALL store: `id` (uuid PK), `user_id` (FK), `slug` (text, unique per user, kebab-case), `display_name` (text), `icon` (text, optional emoji or icon name), `color` (text, optional hex color), `is_default` (bool), `created_at`. RLS: users see own types only.

#### Scenario: Custom type created
- **WHEN** user creates entity type with slug "vendor", display_name "Vendor", icon "truck", color "#3B82F6"
- **THEN** a record is created in `entity_types`
- **THEN** the AI agent can now use `entity_type: "vendor"` in `create_entity` commands

### Requirement: Settings UI for entity types
The settings page SHALL include entity type management — either in a dedicated tab or within the existing settings. Users SHALL be able to add, edit, and remove custom entity types.

#### Scenario: Add new entity type
- **WHEN** user clicks "Add Entity Type" in settings
- **THEN** a form appears for: slug (auto-generated from display name), display name, icon (optional), color (optional)
- **THEN** on save, the new type is available system-wide

#### Scenario: Remove custom entity type
- **WHEN** user removes a custom entity type that has no entities using it
- **THEN** the type is deleted
- **THEN** if entities exist with this type, removal is blocked with a warning

### Requirement: Entity type validation uses database lookup
The `create_entity` command SHALL validate `entity_type` against the `entity_types` table instead of a hardcoded CHECK constraint. Unknown types SHALL fall back to "other".

#### Scenario: AI uses custom entity type
- **WHEN** the AI issues `create_entity` with `entity_type: "vendor"`
- **THEN** the system validates "vendor" exists in `entity_types` for this user
- **THEN** the entity is created with type "vendor"

#### Scenario: AI uses unknown entity type
- **WHEN** the AI issues `create_entity` with `entity_type: "spaceship"` (not in entity_types)
- **THEN** the entity is created with type "other" (fallback)
- **THEN** a warning is logged

### Requirement: Entity types in AI agent context
The agent prompt SHALL include the list of available entity types (including custom ones) so the AI knows which types it can use in `create_entity` commands.

#### Scenario: Custom types shown in agent prompt
- **WHEN** the agent scans a case
- **THEN** the prompt includes: "Available entity types: person, company, project, invoice, vendor, partner, ..."
- **THEN** the AI uses the appropriate type when creating entities

### Requirement: Remove CHECK constraint from entities.type
The Supabase migration SHALL drop the `entities_type_check` constraint and rely on application-level validation via `entity_types` table lookup.

#### Scenario: Migration removes constraint
- **WHEN** the migration runs
- **THEN** `ALTER TABLE entities DROP CONSTRAINT entities_type_check` executes
- **THEN** any text value is allowed in `entities.type`
- **THEN** default entity types are seeded into `entity_types` table
