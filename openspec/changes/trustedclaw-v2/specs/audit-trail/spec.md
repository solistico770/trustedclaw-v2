## ADDED Requirements

### Requirement: Append-Only Audit Log
audit_logs SHALL להיות append-only. אין UPDATE, אין DELETE — מופעל ברמת DB trigger.

#### Scenario: audit entry נוצר
- **WHEN** כל פעולה במערכת (ingest, scan, status change, entity approval, merge)
- **THEN** audit_log record נוצר עם: actor (system/agent/user/scheduler), action_type, target_type (message/case/entity/case_event), target_id, reasoning, metadata

#### Scenario: ניסיון שינוי
- **WHEN** כל קוד מנסה UPDATE או DELETE על audit_logs
- **THEN** DB trigger מונע. error מוחזר.

### Requirement: Audit Search
המערכת SHALL לחשוף GET /api/audit עם filters: actor, action_type, target_type, date_from, date_to.

#### Scenario: חיפוש פעולות agent
- **WHEN** GET /api/audit?actor=agent&date_from=2026-03-29
- **THEN** כל פעולות ה-agent מאותו יום מוחזרות

### Requirement: CaseEvent as Primary Audit
CaseEvents SHALL לשמש כ-audit ראשי לכל LLM interactions. audit_logs משמש לכל השאר (ingest, status changes, entity approvals).

#### Scenario: LLM audit
- **WHEN** רוצים לראות מה agent עשה ב-Case
- **THEN** case_events מכיל תיעוד מלא (in_context, out_raw, api_commands). audit_logs מכיל summary בלבד.
