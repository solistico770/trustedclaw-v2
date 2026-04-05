## ADDED Requirements

### Requirement: Cases master list
The cases workspace SHALL display a compact master list of all cases with columns: case number, urgency/importance badges, status dot, title, entity badges, signal count, time, and scan timer.

#### Scenario: Viewing the case list
- **WHEN** the user navigates to the Cases workspace tab
- **THEN** a compact list of cases SHALL be rendered with all columns visible
- **AND** each row SHALL be a single line (no wrapping) for maximum density
- **AND** the list SHALL support the smart-filters system (filter pills, sort, search)

#### Scenario: Case list with attention cases
- **WHEN** there are cases with status "action_needed" or "escalated"
- **THEN** those cases SHALL appear at the top of the list in a visually distinct group with a red accent

### Requirement: Case detail drawer
Clicking a case in the master list SHALL open a detail drawer showing the full case view with tabs.

#### Scenario: Opening a case
- **WHEN** the user clicks a case row in the master list
- **THEN** a drawer SHALL slide open showing the case detail
- **AND** the drawer SHALL contain tabs: Signals, Tasks, Entities, Agent, History
- **AND** the master list SHALL remain visible and interactive behind the drawer

#### Scenario: Quick actions from case drawer
- **WHEN** a case drawer is open
- **THEN** the drawer header SHALL display action buttons: Scan Now, Mark Addressed, Close Case, Change Status
- **AND** actions SHALL execute immediately and refresh the drawer content

### Requirement: Inline signal preview in case drawer
The Signals tab within the case drawer SHALL display messages in a chat-like format with sender avatars, timestamps, and AI decisions.

#### Scenario: Viewing case signals
- **WHEN** the user opens the Signals tab in a case drawer
- **THEN** signals SHALL be rendered as a chat thread with incoming messages on one side and outgoing on the other
- **AND** each message SHALL show sender name, time, content, and status dot
- **AND** AI processing decisions SHALL appear as distinct system messages

### Requirement: Task management in case drawer
The Tasks tab SHALL display case tasks with inline creation and completion toggle.

#### Scenario: Creating a task from case drawer
- **WHEN** the user types a task title in the inline input and presses Enter
- **THEN** a new task SHALL be created for the current case
- **AND** the task SHALL appear in the list immediately

#### Scenario: Completing a task
- **WHEN** the user clicks the checkbox on a task
- **THEN** the task status SHALL toggle between open and closed
- **AND** the visual state SHALL update immediately (strikethrough for closed)

### Requirement: Entity badges in case drawer
The Entities tab SHALL display case entities as interactive badges with type coloring and connection indicators.

#### Scenario: Viewing case entities
- **WHEN** the user opens the Entities tab in a case drawer
- **THEN** entities SHALL be displayed as colored badges grouped by type
- **AND** entities that share connections with other case entities SHALL show a connection indicator

#### Scenario: Opening entity detail from case
- **WHEN** the user clicks an entity badge in the case drawer
- **THEN** a nested entity detail drawer SHALL open on top of the case drawer
