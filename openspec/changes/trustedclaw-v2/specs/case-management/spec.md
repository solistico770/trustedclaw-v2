## ADDED Requirements

### Requirement: Case Status Lifecycle
Case SHALL לעבור בין סטטוסים: pending → open → action_needed → in_progress → addressed → scheduled → closed. בנוסף: merged (סופי) ו-escalated (דורש תשומת לב).

#### Scenario: מעבר סטטוס רגיל
- **WHEN** agent או user משנה status
- **THEN** Status מתעדכן, case_history record נוצר עם old_value, new_value, reasoning

#### Scenario: Case merged
- **WHEN** agent מחליט למזג
- **THEN** status=merged. merged_into_case_id נקבע. messages מועברים. status לא ניתן לשינוי אחרי merge.

#### Scenario: Case closed
- **WHEN** user או agent סוגר Case
- **THEN** status=closed, closed_at=now. next_scan_at=null (לא נסרק יותר).

### Requirement: Urgency and Importance
כל Case SHALL להחזיק urgency (immediate/soon/normal/low) ו-importance (1-10). שניהם מתעדכנים ע"י ה-agent בכל scan.

#### Scenario: importance עולה
- **WHEN** agent מזהה מידע חדש דחוף
- **THEN** importance עולה. case_history מתעד שינוי + reasoning.

#### Scenario: importance יורד
- **WHEN** agent מזהה שהמצב נפתר
- **THEN** importance יורד. case_history מתעד.

#### Scenario: user override
- **WHEN** user משנה importance ידנית
- **THEN** importance מתעדכן. case_history מתעד changed_by=user.

### Requirement: Case Messages View
כל Case SHALL להציג את כל ה-Messages שלו בסדר כרונולוגי.

#### Scenario: צפייה ב-messages של Case
- **WHEN** GET /api/cases/[id]
- **THEN** מוחזרים כל messages עם raw_payload, sorted by occurred_at

### Requirement: Case Detail API
המערכת SHALL לחשוף GET /api/cases/[id] שמחזיר: case metadata, messages, entities, case_events (LLM history), case_history (status changes).

#### Scenario: case detail מלא
- **WHEN** GET /api/cases/[id]
- **THEN** מוחזר: {case, messages[], entities[], case_events[], history[]}

### Requirement: Cases List API
המערכת SHALL לחשוף GET /api/cases שמחזיר cases לא סגורים, sorted by importance desc.

#### Scenario: רשימת cases פתוחים
- **WHEN** GET /api/cases?user_id=X
- **THEN** מוחזרים cases ב-status != closed, sorted by importance desc, עם entity count ו-message count
