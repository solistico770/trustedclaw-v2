## ADDED Requirements

### Requirement: Case detail Signals tab
The case detail page SHALL have a "Signals" tab (replacing the previous "Messages" tab) showing all signals linked to this case.

#### Scenario: Signals tab content
- **WHEN** user views /cases/[id] and clicks the Signals tab
- **THEN** all signals where case_id matches are displayed, ordered by occurred_at ascending, showing sender, content, gate type, and timestamp

### Requirement: Case detail Tasks tab
The case detail page SHALL have a "Tasks" tab showing all tasks for this case.

#### Scenario: Tasks tab content
- **WHEN** user views /cases/[id] and clicks the Tasks tab
- **THEN** all tasks where case_id matches are displayed, showing title, status, scheduled_at, due_at, with open/close toggle per task

#### Scenario: Create task from case
- **WHEN** user clicks "Add Task" button on the Tasks tab
- **THEN** an inline form appears to create a task pre-filled with this case_id (user provides title, optional dates)

### Requirement: Case detail tab order
The case detail page tabs SHALL be ordered: Signals, Tasks, Entities, Agent, Log.

#### Scenario: Tab layout
- **WHEN** user views any case detail page
- **THEN** five tabs are visible in this order: Signals, Tasks, Entities, Agent, Log

### Requirement: Entities promoted to tab
The entities section (currently shown as a sidebar/section) SHALL become a dedicated "Entities" tab on the case detail page.

#### Scenario: Entities tab
- **WHEN** user clicks the Entities tab on case detail
- **THEN** all entities linked to this case via case_entities are shown with type badges and roles

### Requirement: Dashboard pending signals stat
The dashboard SHALL show the count of pending signals (status=pending) as a stat card.

#### Scenario: Pending signals displayed
- **WHEN** user views the dashboard and there are 5 pending signals
- **THEN** a stat card shows "5" with label "Pending Signals" (or similar)

#### Scenario: Zero pending signals
- **WHEN** there are no pending signals
- **THEN** the stat card shows "0"

### Requirement: Dashboard overdue tasks stat
The dashboard SHALL show the count of overdue tasks (open + due_at < now) as a stat card.

#### Scenario: Overdue tasks displayed
- **WHEN** user views the dashboard and there are 3 overdue tasks
- **THEN** a stat card shows "3" with label "Overdue Tasks"

### Requirement: Dashboard signal count on cases
Each case card on the dashboard SHALL show the count of signals linked to it.

#### Scenario: Case shows signal count
- **WHEN** a case has 4 signals
- **THEN** the case card displays "4 signals" (replacing the previous "4 messages" display)

### Requirement: Sidebar navigation updated
The sidebar SHALL include links to /signals and /tasks pages.

#### Scenario: Sidebar links
- **WHEN** user views the sidebar
- **THEN** navigation items include: Dashboard, Cases, Signals (new), Tasks (new), Entities, Settings

### Requirement: Case merge updates signals
When cases are merged, signals from the source case SHALL be moved to the target case (same as current message merge behavior).

#### Scenario: Merge moves signals
- **WHEN** case A is merged into case B
- **THEN** all signals with case_id=A are updated to case_id=B, and tasks from case A are re-assigned to case B
