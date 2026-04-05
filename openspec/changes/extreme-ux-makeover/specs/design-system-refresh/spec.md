## ADDED Requirements

### Requirement: Dark-first color defaults
The design system SHALL use dark mode as the default theme. Light mode SHALL remain supported as an opt-in toggle.

#### Scenario: First-time user load
- **WHEN** a user visits the app for the first time (no stored preference)
- **THEN** the app SHALL render in dark mode

#### Scenario: Theme persistence
- **WHEN** a user switches to light mode
- **THEN** the preference SHALL be persisted in localStorage
- **AND** subsequent visits SHALL use the stored preference

### Requirement: Glass-morphism panel style
The system SHALL provide a glass-morphism CSS utility for elevated panels (drawers, popovers, command palette) featuring translucent backgrounds with backdrop blur.

#### Scenario: Drawer panel rendering
- **WHEN** a drawer opens
- **THEN** its background SHALL use `backdrop-filter: blur(16px)` with a semi-transparent background color
- **AND** the effect SHALL be visible when content is behind the panel

### Requirement: Micro-animation tokens
The design system SHALL define animation duration tokens: `--duration-fast` (100ms), `--duration-normal` (200ms), `--duration-slow` (350ms) and easing tokens: `--ease-out-expo` for exits, `--ease-in-out` for transitions.

#### Scenario: Drawer open animation
- **WHEN** a drawer opens
- **THEN** it SHALL animate using `--duration-normal` with `--ease-out-expo` easing

#### Scenario: Filter pill activation
- **WHEN** a filter pill is activated
- **THEN** its background color SHALL transition using `--duration-fast`

### Requirement: Density spacing scale
The system SHALL provide compact spacing tokens for data-dense layouts: `--space-row` (8px for table rows), `--space-cell` (6px 12px for cell padding), `--space-section` (16px between sections).

#### Scenario: Case list row height
- **WHEN** cases are rendered in the list view
- **THEN** each row SHALL use `--space-row` vertical padding
- **AND** the row height SHALL be compact enough to show 12+ items without scrolling on a 1080p screen

### Requirement: Typography density
The system SHALL use a tighter type scale for data views: body text at 13px, secondary text at 11px, labels at 10px uppercase tracking-wider.

#### Scenario: Case row text
- **WHEN** a case is rendered in the list
- **THEN** the title SHALL be 13px semibold
- **AND** metadata (signal count, time) SHALL be 11px muted
- **AND** column headers SHALL be 10px uppercase

### Requirement: Status color consistency
The system SHALL define a canonical status color map used consistently across all views: cases, signals, tasks, and entity types.

#### Scenario: "action_needed" status across views
- **WHEN** the status "action_needed" is rendered anywhere (case list, drawer, dashboard metric)
- **THEN** it SHALL use the same red-500 based color (dot, text, and background variant)
