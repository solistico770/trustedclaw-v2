## ADDED Requirements

### Requirement: Filter pill bar
Every list view SHALL display a horizontal bar of filter pills that allow instant filtering by predefined categories. Active filters SHALL be visually distinct (filled/colored).

#### Scenario: Activating a filter pill
- **WHEN** the user clicks a filter pill (e.g., "Action Needed" on cases)
- **THEN** the list SHALL instantly filter to show only matching items
- **AND** the pill SHALL show a filled/active visual state
- **AND** the count on the pill SHALL update to reflect filtered results

#### Scenario: Combining multiple filters
- **WHEN** the user activates multiple filter pills
- **THEN** the list SHALL show items matching ANY of the active filters (OR logic within same category)
- **AND** all active pills SHALL show their active state

#### Scenario: Clearing filters
- **WHEN** the user clicks an active filter pill again or clicks "Clear"
- **THEN** the filter SHALL be deactivated
- **AND** the list SHALL update immediately

### Requirement: Multi-column sort
Every list view SHALL support sorting by multiple columns. Users SHALL be able to set primary and secondary sort.

#### Scenario: Sorting by a column
- **WHEN** the user clicks a column header or sort control
- **THEN** the list SHALL sort by that column (ascending on first click, descending on second, remove on third)
- **AND** a sort indicator (arrow) SHALL appear on the active sort column

#### Scenario: Multi-sort
- **WHEN** the user holds Shift and clicks a second column header
- **THEN** that column SHALL become the secondary sort
- **AND** both sort indicators SHALL be visible with numbered priority

### Requirement: Type-ahead search with keyboard focus
Every list view SHALL provide a search input that filters items as the user types, with keyboard shortcut access.

#### Scenario: Focusing search via keyboard
- **WHEN** the user presses `/` while not focused on any input
- **THEN** the search input for the current list SHALL receive focus

#### Scenario: Clearing search via Escape
- **WHEN** the search input is focused and the user presses Escape
- **THEN** the search text SHALL be cleared
- **AND** focus SHALL return to the list

#### Scenario: Type-ahead filtering
- **WHEN** the user types in the search input
- **THEN** the list SHALL filter in real-time (debounced 150ms) matching against relevant text fields (title, name, content, etc.)

### Requirement: Saveable filter presets
The system SHALL allow users to save the current filter+sort configuration as a named preset, persisted to localStorage.

#### Scenario: Saving a preset
- **WHEN** the user clicks "Save filter" with active filters/sort
- **THEN** a prompt SHALL appear for a preset name
- **AND** the preset SHALL be saved to localStorage keyed by view name

#### Scenario: Loading a preset
- **WHEN** the user selects a saved preset from the preset dropdown
- **THEN** the filters and sort SHALL be applied instantly

#### Scenario: Deleting a preset
- **WHEN** the user clicks the delete icon on a preset
- **THEN** the preset SHALL be removed from localStorage

### Requirement: URL-synced active filters
Active filter and sort state SHALL be reflected in URL search parameters.

#### Scenario: Sharing a filtered view
- **WHEN** a user has active filters and copies the URL
- **THEN** the URL SHALL contain search params encoding the active filters and sort
- **AND** when another user opens that URL, the same filters SHALL be applied
