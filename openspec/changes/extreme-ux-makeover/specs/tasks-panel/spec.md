## ADDED Requirements

### Requirement: Grouped task display
The tasks workspace SHALL display tasks grouped by temporal urgency: Overdue, Due Today, Upcoming, No Due Date, Completed.

#### Scenario: Viewing tasks
- **WHEN** the user navigates to the Tasks workspace tab
- **THEN** tasks SHALL be displayed in collapsible groups: Overdue (red accent), Due Today (amber accent), Upcoming (blue accent), No Due Date (gray accent), Completed (green accent, collapsed by default)
- **AND** each group SHALL show its count in the header
- **AND** empty groups SHALL be hidden

### Requirement: Task quick actions
Each task row SHALL support inline actions without opening a separate view.

#### Scenario: Completing a task
- **WHEN** the user clicks the checkbox on a task
- **THEN** the task SHALL move to the Completed group with a smooth animation
- **AND** the task text SHALL show strikethrough

#### Scenario: Navigating to task case
- **WHEN** the user clicks the case number badge on a task
- **THEN** the case detail drawer SHALL open

### Requirement: Inline task creation
The tasks view SHALL provide inline task creation at the top of the list.

#### Scenario: Creating a task
- **WHEN** the user types a title in the inline input, selects a case, and presses Enter
- **THEN** a new task SHALL be created and appear in the appropriate group
- **AND** the input SHALL clear for the next task

### Requirement: Embeddable tasks panel
The tasks component SHALL be usable both as a standalone workspace view and as an embedded panel within case drawers.

#### Scenario: Tasks within case drawer
- **WHEN** the Tasks tab is shown in a case drawer
- **THEN** the same task component SHALL render, filtered to the current case
- **AND** inline creation SHALL default to the current case (no case selector needed)
