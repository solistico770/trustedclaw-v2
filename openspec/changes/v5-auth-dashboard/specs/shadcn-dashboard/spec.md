## ADDED Requirements

### Requirement: shadcn dashboard layout
The dashboard SHALL use a shadcn dashboard template with collapsible sidebar, header, and main content area.

#### Scenario: Dashboard loads with sidebar
- **WHEN** admin user visits the dashboard
- **THEN** they see a sidebar with navigation items (Cases, Entities, Scanner, Simulate, Settings) and a main content area

#### Scenario: Sidebar collapses
- **WHEN** user collapses the sidebar
- **THEN** it minimizes to icon-only mode, preserving screen space

### Requirement: Responsive layout
The dashboard SHALL be responsive — sidebar becomes a sheet/drawer on mobile.

#### Scenario: Mobile viewport
- **WHEN** the viewport is below 768px
- **THEN** the sidebar is hidden and accessible via a hamburger menu that opens a sheet

### Requirement: RTL support
The dashboard layout SHALL maintain RTL (right-to-left) direction for Hebrew content.

#### Scenario: RTL rendering
- **WHEN** the dashboard renders
- **THEN** the HTML has `dir="rtl"` and the sidebar appears on the right side

### Requirement: User menu
The dashboard header SHALL include a user avatar/dropdown with logout option.

#### Scenario: User menu interaction
- **WHEN** user clicks their avatar in the header
- **THEN** a dropdown appears with their display name/email and a logout button

### Requirement: Dark mode
The dashboard SHALL support dark mode via shadcn's theme system.

#### Scenario: Dark mode toggle
- **WHEN** user toggles dark mode
- **THEN** the entire dashboard switches themes without page reload
