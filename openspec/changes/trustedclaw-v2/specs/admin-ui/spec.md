## ADDED Requirements

### Requirement: Cases Board (דף ראשי)
ה-UI SHALL להציג Cases Board כדף ברירת מחדל. מציג cases לא-סגורים ממוינים לפי importance. עדכונים ב-Realtime.

#### Scenario: Cases Board עם cases
- **WHEN** יש cases פתוחים
- **THEN** מוצגים cards: title, status badge, importance bar (1-10), urgency badge, entity badges, message count, last activity. Actions: Addressed, Schedule, Close.

#### Scenario: Cases Board ריק
- **WHEN** אין cases פתוחים
- **THEN** הודעה: "הכל תחת שליטה — אין cases פתוחים"

#### Scenario: filter לפי status
- **WHEN** user בוחר status filter
- **THEN** רק cases בסטטוס שנבחר מוצגים

#### Scenario: click על case
- **WHEN** user לוחץ על case card
- **THEN** מנווט ל-/cases/[id] — case detail page

### Requirement: Case Detail Page
ה-UI SHALL לכלול דף case detail עם: header (title, status, importance, urgency, entities), messages timeline, CaseEvents history, case history (status changes), action bar.

#### Scenario: messages timeline
- **WHEN** user פותח case detail
- **THEN** כל messages מוצגים כרונולוגית. כל message: sender, content, timestamp.

#### Scenario: CaseEvents timeline
- **WHEN** user פותח tab "Agent History"
- **THEN** כל CaseEvents מוצגים: event_type, api_commands summary, reasoning from out_raw, timestamp, tokens used

#### Scenario: status change from detail
- **WHEN** user לוחץ "Start Working" / "Mark Addressed" / "Close"
- **THEN** POST /api/cases/[id]/status. UI מתעדכן.

#### Scenario: manual scan
- **WHEN** user לוחץ "Scan Now"
- **THEN** POST /api/agent/scan/[caseId]. spinner. תוצאה מוצגת כ-CaseEvent חדש.

### Requirement: Entity Browser
ה-UI SHALL לכלול Entity Browser עם tabs: Pending (proposed), Active, All. Pending tab מציג entities שממתינים לאישור עם Approve/Reject buttons.

#### Scenario: אישור entity
- **WHEN** user לוחץ Approve על proposed entity
- **THEN** POST /api/entities/[id]/approve. entity עובר ל-Active tab.

#### Scenario: batch actions
- **WHEN** user בוחר מספר entities ולוחץ "Approve Selected"
- **THEN** POST /api/entities/batch. כולם מעודכנים.

### Requirement: Simulator Panel
ה-UI SHALL לכלול Simulator Panel לשליחת messages לצורך בדיקה.

#### Scenario: שליחת message מ-simulator
- **WHEN** user ממלא form ולוחץ Send
- **THEN** POST /api/simulate. result מציג message_id + case_id עם link ל-case detail.

### Requirement: Context Prompt Editor
ה-UI SHALL לכלול editor ל-context prompt — הטקסט שמוזרק לתחילת כל LLM call.

#### Scenario: עדכון context prompt
- **WHEN** user עורך את ה-prompt ולוחץ Save
- **THEN** POST /api/settings/context-prompt. ה-prompt החדש ישמש בכל scan עתידי.

### Requirement: Agent Scan Monitor
ה-UI SHALL לכלול monitor שמציג: scan אחרון, cases scanned, next scheduled scans, manual trigger button.

#### Scenario: scan monitor
- **WHEN** user מנווט ל-Scan Monitor
- **THEN** מוצגים: last scan time, cases scanned count, pending cases count, button "Run Scan Now"

### Requirement: Navigation
Sidebar עם: Cases (badge count), Entities, Simulate, Scan Monitor, Settings. RTL Hebrew. Dark mode. Shadcn/ui.

#### Scenario: badge count
- **WHEN** יש 5 cases פתוחים
- **THEN** Sidebar מציג "Cases (5)" עם badge. Realtime update.
