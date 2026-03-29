## Context

v2 is functionally complete but UX is broken. Entity duplication, pending limbo, no dashboard, flat boring list. This is a fix+polish release, not new architecture.

## Goals / Non-Goals

**Goals:**
- Zero duplicate entities per case
- Dashboard that tells you what's happening in 2 seconds
- Cases sorted by actual priority (not just importance number)
- Case age visible everywhere
- Compact cards that show more cases on screen
- Clean status lifecycle: open ↔ closed (no pending)

**Non-Goals:**
- New features (skills, labels, gates are fine as-is)
- Schema redesign (same tables, just fixes)
- New API routes (just fix existing)

## Decisions

### 1. Entity Dedup Strategy
- DB: add unique index on `(entity_id, case_id)` in case_entities (already exists)
- Agent: before proposing, query existing entities for this case AND check by canonical_name
- Migration: delete duplicate entity rows, deduplicate case_entities

### 2. Kill Pending
- Remove "pending" from status enum in UI (keep in DB for backward compat)
- New cases created with status="open" + next_scan_at=now
- Scanner query: status != closed AND status != merged AND next_scan_at <= now

### 3. Dashboard Header
Static component at top of cases page:
```
┌─────────┬──────────┬──────────┬──────────┬──────────┐
│  OPEN   │ ACTION   │ CRITICAL │  OLDEST  │NEXT SCAN │
│   12    │ NEEDED 3 │    1     │  2d ago  │  in 4m   │
└─────────┴──────────┴──────────┴──────────┴──────────┘
```

### 4. Smart Sort
Priority score = (6 - urgency) * 10 + (6 - importance) * 5 + age_bonus
- action_needed/escalated cases get +100 bonus
- Older cases get small age bonus (max +10)

### 5. Compact Case Cards
```
┌──────────────────────────────────────────────────────┐
│ [1][1] Title of the case                    2d ago   │
│ Summary text here...              3 msgs · 2 entities│
│ [Action Needed]                    next scan: in 4m  │
└──────────────────────────────────────────────────────┘
```
One line per metric, not a grid. Urgency+Importance as compact [U][I] badges.

## Risks
- Entity dedup migration might miss edge cases
- Changing default sort might confuse returning users (mitigated: it's better)
