## ADDED Requirements

### Requirement: Task data model
The system SHALL have a `tasks` table with: id, user_id, case_id (required FK to cases), entity_id (FK to entities), title, description (nullable), status (open/closed), scheduled_at (nullable timestamptz), due_at (nullable timestamptz), closed_at (nullable timestamptz), created_at, updated_at.

#### Scenario: Task created with all fields
- **WHEN** a task is created with title, case_id, scheduled_at, and due_at
- **THEN** a tasks row is created with status='open', the provided dates, and an auto-created entity row (type="task", canonical_name=title)

#### Scenario: Task created with no dates
- **WHEN** a task is created with only title and case_id
- **THEN** a tasks row is created with scheduled_at=NULL and due_at=NULL

### Requirement: Task status lifecycle
A task's status SHALL be one of: `open`, `closed`. Tasks start as open.

#### Scenario: Task closed
- **WHEN** a task is closed (via API or AI command)
- **THEN** task.status becomes "closed" and task.closed_at is set to current timestamp

#### Scenario: Task reopened
- **WHEN** a closed task is reopened via API
- **THEN** task.status becomes "open" and task.closed_at is set to NULL

### Requirement: Task-entity auto-creation
When a task is created, the system SHALL auto-create an entity row with type="task" and canonical_name equal to the task title. The task.entity_id SHALL reference this entity. A case_entities row SHALL link the entity to the task's case with role="related".

#### Scenario: Entity created for new task
- **WHEN** a task is created for case #5
- **THEN** an entity (type=task, status=active) is created, a case_entities row links it to case #5 with role="related", and task.entity_id points to the entity

### Requirement: Task belongs to exactly one case
Each task SHALL have a required case_id. A task MUST NOT be moved between cases.

#### Scenario: Task case assignment
- **WHEN** a task is created with case_id
- **THEN** the task is permanently associated with that case

### Requirement: Task API endpoints
The system SHALL expose CRUD endpoints for tasks.

#### Scenario: Create task
- **WHEN** `POST /api/tasks` is called with `{ case_id, title, description?, scheduled_at?, due_at? }`
- **THEN** a task is created, entity auto-created, and response contains the task with its ID

#### Scenario: List tasks with filters
- **WHEN** `GET /api/tasks?status=open&due=overdue` is called
- **THEN** the response contains only open tasks where due_at < now, ordered by due_at ascending

#### Scenario: Close task
- **WHEN** `POST /api/tasks/[id]/close` is called
- **THEN** task status becomes "closed", closed_at is set

#### Scenario: Reopen task
- **WHEN** `POST /api/tasks/[id]/open` is called
- **THEN** task status becomes "open", closed_at is set to NULL

#### Scenario: Update task
- **WHEN** `PUT /api/tasks/[id]` is called with updated fields
- **THEN** the task is updated (title, description, scheduled_at, due_at)

### Requirement: AI task commands
The AI agent SHALL be able to create, close, and update tasks during case review scans via new commands.

#### Scenario: AI creates task
- **WHEN** the AI returns `{ type: "create_task", title, description?, scheduled_at?, due_at? }` during case review
- **THEN** a task is created for the current case with the specified fields

#### Scenario: AI closes task
- **WHEN** the AI returns `{ type: "close_task", task_id }` during case review
- **THEN** the specified task is closed

#### Scenario: AI updates task
- **WHEN** the AI returns `{ type: "update_task", task_id, title?, scheduled_at?, due_at? }` during case review
- **THEN** the specified task fields are updated

### Requirement: Tasks included in case review context
When the AI reviews a case, it SHALL receive the list of open tasks for that case as part of its input context.

#### Scenario: Case scan includes tasks
- **WHEN** scanCase runs for a case that has 3 open tasks and 1 closed task
- **THEN** the AI prompt includes the 3 open tasks with their titles, scheduled_at, and due_at

### Requirement: Task RLS
Tasks SHALL be protected by row-level security. Users SHALL only see their own tasks.

#### Scenario: RLS enforcement
- **WHEN** a user queries tasks
- **THEN** only tasks where user_id matches the authenticated user are returned
