## ADDED Requirements

### Requirement: Entity grid and list views
The entities workspace SHALL support two display modes: grid view (cards) and list view (compact rows), toggleable via a view switcher.

#### Scenario: Grid view
- **WHEN** the user selects grid view
- **THEN** entities SHALL be displayed as cards in a responsive grid (3 columns on desktop, 2 on tablet, 1 on mobile)
- **AND** each card SHALL show: type icon, name, type badge, phone/email, creation date, and connection count badge

#### Scenario: List view
- **WHEN** the user selects list view
- **THEN** entities SHALL be displayed as compact single-line rows
- **AND** each row SHALL show: type icon, name, type, phone, email, case count, connection count, creation date

#### Scenario: View persistence
- **WHEN** the user switches between grid and list view
- **THEN** the preference SHALL be saved to localStorage
- **AND** subsequent visits SHALL use the saved preference

### Requirement: Entity type filter pills
The entities view SHALL display type filter pills showing counts per type.

#### Scenario: Filtering by type
- **WHEN** the user clicks a type filter pill (e.g., "Person")
- **THEN** the list/grid SHALL show only entities of that type
- **AND** the pill SHALL show its active state

### Requirement: Entity detail drawer
Clicking an entity SHALL open a drawer with full entity details and connections.

#### Scenario: Opening entity detail
- **WHEN** the user clicks an entity in the grid or list
- **THEN** a drawer SHALL open showing: entity profile (name, type, phone, email, website, telegram, whatsapp), related cases list, connections panel, and recent signals involving this entity

#### Scenario: Entity editing
- **WHEN** the user clicks "Edit" in the entity drawer
- **THEN** the profile fields SHALL become editable inline
- **AND** changes SHALL be saved on blur or Enter

### Requirement: Connection count badges
Each entity display (grid card, list row) SHALL show a badge indicating how many other entities it's connected to.

#### Scenario: Entity with connections
- **WHEN** an entity has 5 connections (entities sharing cases)
- **THEN** a badge SHALL display "5 connections" on the entity card/row

#### Scenario: Entity with no connections
- **WHEN** an entity has no connections
- **THEN** no connection badge SHALL be shown

### Requirement: Entity search
The entities view SHALL support type-ahead search across entity names, phone numbers, and emails.

#### Scenario: Searching by phone
- **WHEN** the user types a phone number fragment in the search
- **THEN** entities with matching phone numbers SHALL be shown
- **AND** the matching portion SHALL be visually highlighted in results
