## ADDED Requirements

### Requirement: Bounded scroll containers
All content areas SHALL use bounded-height containers with internal scrolling. The viewport itself SHALL NOT scroll.

#### Scenario: Long case list
- **WHEN** the cases list contains more items than fit in the viewport
- **THEN** the case list container SHALL scroll internally
- **AND** the workspace toolbar and filter bar SHALL remain visible and fixed
- **AND** the browser viewport scroll position SHALL remain at 0

#### Scenario: Window resize
- **WHEN** the user resizes the browser window
- **THEN** all bounded containers SHALL adjust their height to fill available space
- **AND** no layout shift or scroll jump SHALL occur

### Requirement: Sticky toolbar and filter headers
Within each workspace view, the toolbar and filter bar SHALL be sticky at the top of their container. List content scrolls beneath them.

#### Scenario: Scrolling a list with active filters
- **WHEN** the user scrolls through a long list of signals
- **THEN** the filter bar with search input and filter pills SHALL remain pinned at the top of the content area
- **AND** list items SHALL scroll underneath the sticky header

### Requirement: No scroll-to-top on data load
When new data loads or refreshes, the content SHALL update in place without resetting the scroll position.

#### Scenario: Real-time signal arriving while scrolled
- **WHEN** a new signal arrives via Supabase subscription while the user is scrolled down in the signal feed
- **THEN** the new signal SHALL be prepended to the list
- **AND** the user's current scroll position SHALL be maintained (no jump to top)
- **AND** an optional "New signals" indicator MAY appear at the top

#### Scenario: Filter change
- **WHEN** the user changes a filter
- **THEN** the list SHALL update in place
- **AND** the scroll position SHALL reset to top only for the content container (not the viewport)

### Requirement: Full-height workspace
The workspace shell SHALL use `100dvh` (dynamic viewport height) to fill the entire browser viewport. No body scroll.

#### Scenario: Loading the workspace
- **WHEN** the dashboard loads
- **THEN** the `body` and `html` elements SHALL have `overflow: hidden`
- **AND** the workspace grid SHALL be exactly `100dvh` tall
- **AND** all scrollable regions SHALL be explicitly defined with `overflow-y: auto`
