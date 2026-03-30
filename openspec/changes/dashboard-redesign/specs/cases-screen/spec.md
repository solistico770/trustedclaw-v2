## ADDED Requirements

### Requirement: Cases page at dedicated route
The cases list SHALL be accessible at `/cases` as a dedicated page, separate from the dashboard.

#### Scenario: Navigate to cases
- **WHEN** the owner clicks "Cases" in the sidebar
- **THEN** the browser navigates to `/cases` and displays the full case list

### Requirement: Cases page displays filterable case list
The cases page SHALL display all cases with:
- Search by title, summary, case number, or entity name
- Status filter dropdown (All Open, Action Needed, Open, In Progress, Addressed, Closed)
- Case count display
- Cases sorted by priority score (status weight + urgency + importance + age)

#### Scenario: Default view
- **WHEN** the owner navigates to `/cases` with no query parameters
- **THEN** all open cases (non-closed) are displayed sorted by priority

#### Scenario: Filter by status
- **WHEN** the owner selects "Action Needed" from the status filter
- **THEN** only cases with status `action_needed` or `escalated` are displayed

#### Scenario: Search cases
- **WHEN** the owner types "דני" in the search field
- **THEN** only cases matching "דני" in title, summary, case number, or entity names are shown

### Requirement: Case cards display essential information
Each case card SHALL show:
- Case number (mono font)
- Urgency and importance level badges (color-coded 1-5)
- Title (or fallback "Case #N")
- Status label (colored)
- Summary (truncated, one line)
- Linked entities (up to 2 shown, "+N" for overflow)
- Signal count and age
- Next scan time and scan interval
- Hover actions: "Done" (set addressed) and "Close"

#### Scenario: Case with entities
- **WHEN** a case has 3 linked entities
- **THEN** the card shows the first 2 entity names and "+1"

#### Scenario: Quick action
- **WHEN** the owner hovers a case card and clicks "Done"
- **THEN** the case status is set to "addressed" and the list refreshes

### Requirement: Cases page supports URL query parameters
The cases page SHALL accept query parameters for pre-filtering:
- `?status=action_needed,escalated` — filter by status
- `?filter=critical` — show only urgency ≤ 1 cases

#### Scenario: Linked from dashboard
- **WHEN** the owner clicks "Attention" on the dashboard
- **THEN** the browser navigates to `/cases?status=action_needed,escalated` and cases are pre-filtered

### Requirement: Cases page auto-refreshes
The cases page SHALL auto-refresh every 30 seconds and subscribe to Supabase Realtime on the `cases` table.

#### Scenario: Case status changes externally
- **WHEN** the AI scanner updates a case status
- **THEN** the cases list reflects the change within 30 seconds

### Requirement: Sidebar shows Cases as separate nav item
The sidebar navigation SHALL include both "Dashboard" (at `/`, with home icon) and "Cases" (at `/cases`, with clipboard icon) as separate entries.

#### Scenario: Sidebar navigation
- **WHEN** the owner views the sidebar
- **THEN** "Dashboard" and "Cases" appear as distinct, separate navigation items
- **THEN** the active page is highlighted correctly
