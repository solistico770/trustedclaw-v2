## ADDED Requirements

### Requirement: Tasks page at /tasks
The system SHALL have a dedicated `/tasks` page accessible from the sidebar navigation. It SHALL display all tasks for the current user with filtering and search.

#### Scenario: Page loads with all tasks
- **WHEN** user navigates to /tasks
- **THEN** the page displays tasks ordered by due_at ascending (NULLs last), showing: title, case number (linked), status badge, scheduled_at, due_at, created_at

### Requirement: Task status filter
The tasks page SHALL have a status filter with options: All, Open, Closed.

#### Scenario: Filter by open
- **WHEN** user selects "Open" filter
- **THEN** only tasks with status=open are shown

#### Scenario: Default filter
- **WHEN** user first loads /tasks
- **THEN** the default filter shows "Open" tasks

### Requirement: Task due date filter
The tasks page SHALL have a due date filter with options: All, Overdue, Today, This Week, No Due Date.

#### Scenario: Filter overdue
- **WHEN** user selects "Overdue" filter
- **THEN** only open tasks where due_at < now are shown

#### Scenario: Filter today
- **WHEN** user selects "Today" filter
- **THEN** only tasks where due_at is today (local timezone) are shown

### Requirement: Task scheduled filter
The tasks page SHALL have a scheduled date filter with options: All, Past, Today, Upcoming, Unscheduled.

#### Scenario: Filter upcoming scheduled
- **WHEN** user selects "Upcoming" filter
- **THEN** only tasks where scheduled_at > now are shown

### Requirement: Task search
The tasks page SHALL support text search across task title and case number.

#### Scenario: Search by title
- **WHEN** user types "call" in search box
- **THEN** only tasks whose title contains "call" are shown

### Requirement: Task open/close toggle
Each task row SHALL have a toggle to open/close the task inline.

#### Scenario: Close task from list
- **WHEN** user clicks the close toggle on an open task
- **THEN** the task status becomes "closed" and the UI updates immediately

#### Scenario: Reopen task from list
- **WHEN** user clicks the open toggle on a closed task
- **THEN** the task status becomes "open" and the UI updates immediately

### Requirement: Create task from tasks page
The tasks page SHALL have a "Create Task" button that opens a form to create a task.

#### Scenario: Create task with case selection
- **WHEN** user clicks "Create Task" and fills in title, selects a case, optionally sets scheduled_at and due_at
- **THEN** the task is created and appears in the list

### Requirement: Task-to-case navigation
Each task SHALL link to its associated case.

#### Scenario: Click case link
- **WHEN** user clicks the case number on a task
- **THEN** user is navigated to /cases/[id]

### Requirement: Overdue visual indicator
Tasks that are overdue (open + due_at < now) SHALL be visually distinguished.

#### Scenario: Overdue task display
- **WHEN** a task is open and due_at is in the past
- **THEN** the task row shows a red/destructive visual indicator on the due date

### Requirement: Real-time task updates
The tasks page SHALL subscribe to real-time changes on the tasks table.

#### Scenario: Task updated by AI
- **WHEN** the AI closes a task during a scan while user is on /tasks page
- **THEN** the task status updates without page refresh
