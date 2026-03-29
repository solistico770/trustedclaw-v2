## Context

v4 fixed the agent brain. Now the UX needs to match. The owner should feel in control — the dashboard is their cockpit, entities are their network, and the empowerment line is their coach.

## Goals / Non-Goals

**Goals:**
- Dashboard tells a story in 2 seconds: what needs attention, what's handled, how you're doing
- Every dashboard stat is interactive — click to filter
- Empowerment line makes the owner feel good about using the system
- Entities are first-class citizens with full cross-case visibility
- Entity = scope: see everything about a person/company in one place

**Non-Goals:**
- Schema changes beyond one column (empowerment_line on case_events)
- New case processing logic
- Gate connections (still simulator-only)

## Decisions

### 1. Dashboard Layout

```
┌─────────────────────────────────────────────────────────┐
│ "Clean inbox! Only 2 cases need your attention today"   │ ← empowerment line
├───────────┬───────────┬───────────┬───────────┬─────────┤
│ ATTENTION │ CRITICAL  │   OPEN    │  HANDLED  │ENTITIES │ ← clickable
│     2     │     1     │     5     │    12     │   8     │
│  click→   │  click→   │  click→   │  click→   │ click→  │
├───────────┴───────────┴───────────┴───────────┴─────────┤
│ Last scan: 2m ago · 3 cases scanned · Next: in 4m       │
├─────────────────────────────────────────────────────────┤
│ [search] [filter dropdown]                    5 cases   │
├─────────────────────────────────────────────────────────┤
│ Case list (filtered by clicked stat or search)          │
└─────────────────────────────────────────────────────────┘
```

Clicking a stat sets the filter. Clicking again clears it. "HANDLED" shows closed cases. "ENTITIES" navigates to /entities.

Stats API (`GET /api/cases/stats`) expanded to return:
```json
{
  "attention": 2,       // action_needed + escalated
  "critical": 1,        // urgency <= 1
  "open": 5,            // open + in_progress + scheduled
  "handled": 12,        // addressed + closed (last 30 days)
  "entities": 8,        // total active entities
  "last_scan_ago_sec": 120,
  "next_scan_in_sec": 240,
  "cases_scanned_today": 15,
  "latest_empowerment": "Clean inbox! Only 2 cases need your attention today"
}
```

### 2. Empowerment Line

New auto-attached skill. Agent emits `set_empowerment_line` command with a short positive message.

The line should:
- Reference actual numbers (cases, entities, amounts)
- Be specific to what just happened in this scan
- Be encouraging, not generic
- Max 100 chars

Stored as `empowerment_line` column on `case_events` table. Dashboard fetches latest from most recent case_event.

Command flow:
```
Agent scan → response includes set_empowerment_line →
  executeCommands saves it to case_events →
  Dashboard fetches latest via stats API
```

### 3. Entity Standalone Page

**List page (`/entities`):**
- Search by name (debounced)
- Filter by type (person, company, project, invoice, other)
- Each entity card: name, type, case count, last activity
- Sort by: name, case count, last activity

**Detail page (`/entities/[id]`):**
- Profile section: name, type, phone, email, WA, TG, website (editable)
- Connected cases: cards linking to each case, showing status/urgency
- Message log: ALL messages mentioning this entity across all cases, chronological
  - Query: messages through case_entities → cases → messages WHERE entity linked
- Edit button: inline edit name, type, contact fields
- Merge button: select another entity to merge into this one

**Entity detail API (`GET /api/entities/[id]`):**
Already exists but needs expansion:
```json
{
  "entity": { id, canonical_name, type, phone, email, ... },
  "cases": [{ id, case_number, title, status, urgency, importance }],
  "messages": [{ id, content, sender, occurred_at, case_number, case_title }],
  "case_count": 3,
  "message_count": 12
}
```

**Merge API (`POST /api/entities/merge`):**
```json
{ "source_id": "...", "target_id": "...", "user_id": "..." }
```
- All case_entities pointing to source → update to target
- Source entity → status=archived
- Audit log

### 4. Navigation

```
Cases | Entities | Simulate | Scanner | Settings
```

Entities tab removed from Settings. Settings keeps: Context Prompt, Skills, Gates.

## Risks

- Empowerment line adds ~200 tokens per scan (acceptable)
- Entity cross-case message query could be slow with many cases (mitigated: limit 50 messages)
