## ADDED Requirements

### Requirement: Grid-based workspace layout
The system SHALL provide a workspace shell layout using CSS Grid with regions: sidebar (collapsible), toolbar (sticky top), main content area, and optional side panel.

#### Scenario: Default workspace layout on desktop
- **WHEN** the workspace loads on a viewport wider than 1024px
- **THEN** the layout SHALL display as a grid with sidebar (collapsed or expanded), sticky toolbar bar, and main content area filling remaining space
- **AND** the main content area SHALL have internal scrolling (overflow-y: auto) with a fixed height (100vh minus toolbar)

#### Scenario: Workspace on mobile
- **WHEN** the viewport is narrower than 768px
- **THEN** the sidebar SHALL be hidden behind a hamburger toggle
- **AND** the main content area SHALL be full width

### Requirement: Workspace tab navigation
The system SHALL provide tab-based navigation within the workspace for switching between domain views (Dashboard, Cases, Signals, Tasks, Entities) without full page navigation.

#### Scenario: Switching workspace tabs
- **WHEN** the user clicks a tab in the workspace toolbar (e.g., from Cases to Signals)
- **THEN** the main content area SHALL update to show the selected domain view
- **AND** the URL SHALL update to reflect the active tab (e.g., `/signals`)
- **AND** the transition SHALL NOT cause a full page reload

#### Scenario: Preserving tab state
- **WHEN** the user switches from Cases (with active filters) to Signals and back to Cases
- **THEN** the Cases view SHALL retain its filter state within the session

### Requirement: Workspace toolbar
The system SHALL display a fixed toolbar at the top of the workspace containing: workspace tabs, global search input, system status indicators (live pulse, scanner status), and user menu.

#### Scenario: Toolbar remains visible during scroll
- **WHEN** the user scrolls the main content area
- **THEN** the toolbar SHALL remain fixed at the top of the viewport
- **AND** the toolbar SHALL NOT move or resize

#### Scenario: Global search
- **WHEN** the user types in the toolbar search input or presses `/` anywhere in the workspace
- **THEN** a command-palette-style search SHALL appear allowing search across cases, entities, and signals
- **AND** results SHALL be navigable via keyboard (arrow keys + Enter)

### Requirement: Active workspace tab persistence
The system SHALL remember the last active workspace tab across sessions.

#### Scenario: Returning to the app
- **WHEN** the user closes the browser and returns to the app
- **THEN** the workspace SHALL open to the last active tab (stored in localStorage)
- **AND** if the stored tab is invalid, it SHALL default to Dashboard
