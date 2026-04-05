## ADDED Requirements

### Requirement: Entity connections API
The system SHALL provide an API endpoint that returns entities connected to a given entity through shared case participation.

#### Scenario: Fetching connections for an entity
- **WHEN** a client calls `GET /api/entities/{id}/connections`
- **THEN** the response SHALL include an array of connected entities with: entity id, name, type, shared case count, and the list of shared case IDs
- **AND** results SHALL be sorted by shared case count descending (strongest connections first)

#### Scenario: Entity with no connections
- **WHEN** an entity has no shared cases with other entities
- **THEN** the endpoint SHALL return an empty connections array

### Requirement: Connection badges on entity mentions
Throughout the app, wherever an entity name appears (in case details, signal views, etc.), it SHALL display as an interactive badge showing the entity type icon and name.

#### Scenario: Hovering an entity badge
- **WHEN** the user hovers over an entity badge
- **THEN** a tooltip SHALL appear showing: entity type, number of connected entities, number of related cases

#### Scenario: Clicking an entity badge
- **WHEN** the user clicks an entity badge anywhere in the app
- **THEN** the entity detail drawer SHALL open showing the full entity view with connections

### Requirement: Entity detail connection panel
The entity detail drawer SHALL include a "Connections" section displaying related entities grouped by relationship strength.

#### Scenario: Viewing entity connections
- **WHEN** a user opens an entity detail drawer for a person entity
- **THEN** the Connections section SHALL display all connected entities
- **AND** each connection SHALL show: entity name, type badge, shared case count, and the most recent shared case title
- **AND** connections SHALL be grouped: Strong (3+ shared cases), Related (1-2 shared cases)

#### Scenario: Navigating to a connected entity
- **WHEN** the user clicks on a connected entity in the connections panel
- **THEN** a nested drawer SHALL open showing that entity's detail view

### Requirement: Case entity network view
The case detail drawer SHALL display a visual summary of how entities in that case relate to each other.

#### Scenario: Viewing case entity relationships
- **WHEN** a user opens a case detail drawer and navigates to the Entities tab
- **THEN** the view SHALL show all case entities with connection lines between entities that also share OTHER cases
- **AND** each entity SHALL be rendered as a type-colored node with name label

#### Scenario: Case with single entity
- **WHEN** a case has only one associated entity
- **THEN** the entity SHALL be shown as a standalone badge without connection visualization
