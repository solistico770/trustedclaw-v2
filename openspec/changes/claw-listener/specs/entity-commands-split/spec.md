## ADDED Requirements

### Requirement: Separate create_entity command
The AI agent SHALL have a `create_entity` command that creates a NEW entity and links it to the current case. This replaces the "create" path of the old `propose_entity` command. The command SHALL accept: `name`, `entity_type`, `role` (primary|related|mentioned), and optional metadata fields (`phone`, `email`, `whatsapp_number`, `telegram_handle`).

#### Scenario: AI creates a new entity
- **WHEN** the AI agent identifies a new person/company/project not yet in the system
- **THEN** it issues `{ "type": "create_entity", "name": "John Doe", "entity_type": "person", "role": "primary", "phone": "+972501234567" }`
- **THEN** the system creates the entity with status "active" and links it to the case with the specified role

#### Scenario: Duplicate prevention
- **WHEN** the AI issues `create_entity` with a name that already exists for this user (case-insensitive match)
- **THEN** the system links the existing entity instead of creating a duplicate
- **THEN** the result reports `status: "linked_existing"` (not "created")

### Requirement: Separate attach_entity command
The AI agent SHALL have an `attach_entity` command that links an EXISTING entity to the current case without creating anything new. The command SHALL accept: `entity_id` or `name` (for lookup), and `role`.

#### Scenario: AI attaches an existing entity by name
- **WHEN** the AI recognizes an entity already in the system
- **THEN** it issues `{ "type": "attach_entity", "name": "Acme Corp", "role": "related" }`
- **THEN** the system finds the entity by canonical_name (case-insensitive) and links it to the case

#### Scenario: AI attaches by entity_id
- **WHEN** the AI has the entity_id from the existing entities list provided in context
- **THEN** it issues `{ "type": "attach_entity", "entity_id": "uuid", "role": "mentioned" }`
- **THEN** the system links the entity directly without name lookup

#### Scenario: Entity not found
- **WHEN** `attach_entity` is called with a name that doesn't match any existing entity
- **THEN** the result reports `status: "not_found"` and the entity is NOT created
- **THEN** the AI should use `create_entity` instead if it wants to create a new one

### Requirement: Replace propose_entity with create_entity
The current `propose_entity` command SHALL be renamed to `create_entity`. There is no proposal/approval workflow — entities are created directly as active. The agent prompt SHALL only reference `create_entity` and `attach_entity`.
