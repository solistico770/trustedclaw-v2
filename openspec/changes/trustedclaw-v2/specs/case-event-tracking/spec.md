## ADDED Requirements

### Requirement: Full LLM Interaction Record
כל LLM call SHALL לייצר CaseEvent עם תיעוד מלא: מה נשלח, מה חזר, מה הוחלט.

#### Scenario: CaseEvent נשמר אחרי scan
- **WHEN** agent מסיים scan של Case
- **THEN** CaseEvent נוצר עם: event_type (initial_scan/scheduled_scan/manual_scan/merge_decision), in_context (JSONB — prompt מלא), out_raw (JSONB — תגובת LLM מלאה), api_commands (JSONB — רשימת פעולות), tokens_used, model_used, duration_ms

### Requirement: API Commands Structure
api_commands SHALL להיות array מובנה של פעולות שה-LLM הורה לבצע.

#### Scenario: api_commands של standalone decision
- **WHEN** agent מחליט standalone
- **THEN** api_commands כולל: [{type: "set_status", value: "open"}, {type: "set_urgency", value: "soon"}, {type: "set_importance", value: 7}, {type: "set_title", value: "..."}, {type: "set_next_scan", value: "2026-03-30T10:00:00Z"}, {type: "propose_entity", name: "דוד כהן", entity_type: "person"}]

#### Scenario: api_commands של merge
- **WHEN** agent מחליט merge
- **THEN** api_commands כולל: [{type: "merge_into", target_case_id: "..."}]

### Requirement: CaseEvent Timeline
CaseEvents של Case SHALL להיות זמינים ב-API כ-timeline ממוין לפי created_at.

#### Scenario: צפייה ב-CaseEvents
- **WHEN** GET /api/cases/[id] מבוקש
- **THEN** case_events מוחזרים sorted by created_at desc. כל record כולל in_context, out_raw, api_commands.

### Requirement: Token Tracking
כל CaseEvent SHALL לתעד tokens_used ו-model_used לצורך ניטור עלויות.

#### Scenario: ניטור tokens
- **WHEN** admin רוצה לראות צריכת tokens
- **THEN** SUM(tokens_used) מ-case_events ניתן לחישוב לפי תקופה, לפי case, לפי model
