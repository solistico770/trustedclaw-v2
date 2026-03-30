## ADDED Requirements

### Requirement: Dashboard displays key metrics
The dashboard (`/`) SHALL display the following metrics in clickable stat tiles:
- Pending signals count (links to `/signals?status=pending`)
- 24h signal volume
- Cases needing attention (action_needed + escalated status, links to `/cases?status=action_needed,escalated`)
- Critical cases count (urgency ≤ 1, links to `/cases?filter=critical`)
- Total open cases (links to `/cases`)
- Overdue tasks count (links to `/tasks?due=overdue`)
- Active entities count (links to `/entities`)

#### Scenario: Dashboard loads with metrics
- **WHEN** the owner navigates to `/`
- **THEN** all metric tiles display current counts from the database
- **THEN** tiles with non-zero attention/critical values use red/amber highlight colors

#### Scenario: Metric tile clicked
- **WHEN** the owner clicks a metric tile
- **THEN** the browser navigates to the corresponding filtered page

### Requirement: Dashboard displays gate health
The dashboard SHALL show the status of each configured gate (WhatsApp, Telegram, etc.) including:
- Connection status (connected/disconnected/reconnecting)
- Last heartbeat time with online/offline indicator
- Connected phone number or bot username
- Message count

#### Scenario: All gates connected
- **WHEN** all gates have heartbeats within 10 minutes
- **THEN** each gate shows a green "online" indicator

#### Scenario: Gate offline
- **WHEN** a gate's last heartbeat is older than 30 minutes
- **THEN** that gate shows a red "offline" indicator

### Requirement: Dashboard displays recent AI activity
The dashboard SHALL show the 10 most recent AI decisions from `case_events`, displaying:
- Case number and title
- AI action taken (empowerment line or key decision)
- Time ago
- Entities involved

#### Scenario: Recent activity loads
- **WHEN** the dashboard loads
- **THEN** the latest 10 case events with non-null AI data are displayed in reverse chronological order

#### Scenario: Activity item clicked
- **WHEN** the owner clicks an activity item
- **THEN** the browser navigates to `/cases/{case_id}`

### Requirement: Dashboard displays empowerment line
The dashboard SHALL prominently show the latest empowerment line from the most recent case scan at the top of the page.

#### Scenario: Empowerment line exists
- **WHEN** a recent case scan produced an empowerment line
- **THEN** it is displayed in a highlighted banner at the top of the dashboard

#### Scenario: No empowerment line
- **WHEN** no case scans have produced empowerment lines
- **THEN** no banner is shown

### Requirement: Dashboard displays system status bar
The dashboard SHALL show a system status bar with:
- Live indicator
- Last scan time (time ago)
- Scans completed today
- Next scheduled scan (time until)
- Total signal count

#### Scenario: Scanner active
- **WHEN** scans are running normally
- **THEN** the status bar shows green live indicator, recent scan time, and next scan countdown

### Requirement: Dashboard auto-refreshes
The dashboard SHALL auto-refresh data every 30 seconds and subscribe to Supabase Realtime changes on `cases`, `signals`, and `case_events` tables.

#### Scenario: New signal arrives
- **WHEN** a new signal is ingested
- **THEN** the dashboard metrics update within 30 seconds without page reload

### Requirement: Dashboard API endpoint
The system SHALL provide a `GET /api/dashboard` endpoint that returns all dashboard data in a single response, including:
- Metric counts (pending signals, 24h signals, open cases, attention cases, critical cases, overdue tasks, entities)
- Gate list with metadata (status, heartbeat, phone, message count)
- Recent AI activity (last 10 case events with case details)
- Scanner status (last scan ago, next scan in, scans today)
- Latest empowerment line

#### Scenario: Dashboard API called
- **WHEN** an authenticated admin calls `GET /api/dashboard`
- **THEN** all dashboard data is returned in a single JSON response

#### Scenario: Unauthenticated request
- **WHEN** an unauthenticated request calls `GET /api/dashboard`
- **THEN** a 401 error is returned
