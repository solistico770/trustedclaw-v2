## 1. Entity Dedup Fix

- [ ] 1.1 Migration: delete duplicate entities (same user_id + canonical_name), keep oldest
- [ ] 1.2 Migration: delete duplicate case_entities rows
- [ ] 1.3 Agent scanner: check existing entities by canonical_name before proposing
- [ ] 1.4 Agent scanner: check existing case_entities before linking

## 2. Kill Pending Status

- [ ] 2.1 Change ingest: new cases start as "open" (not "pending")
- [ ] 2.2 Remove "pending" from UI filter options
- [ ] 2.3 Migration: update all pending cases to "open"

## 3. Dashboard Header

- [ ] 3.1 API: GET /api/cases/stats — returns {open, action_needed, critical, oldest_age_hours, next_scan_in_seconds}
- [ ] 3.2 UI: Dashboard stats bar at top of cases page

## 4. Cases Board Redesign

- [ ] 4.1 Compact case cards — title + [U][I] badges + age + summary on one card
- [ ] 4.2 Smart sort: action_needed first, then priority score, then age
- [ ] 4.3 Entity display: deduped, max 3 shown
- [ ] 4.4 Case age: "2d ago", "3h ago" shown prominently
- [ ] 4.5 Message count + entity count as small indicators

## 5. Case Detail Fixes

- [ ] 5.1 Dedup entities in case detail view
- [ ] 5.2 Add "Reopen" button for closed cases
- [ ] 5.3 Show case age in header

## 6. Deploy

- [ ] 6.1 Run migrations
- [ ] 6.2 Build + deploy
- [ ] 6.3 Test: send message → case opens (not pending) → scan → entities not duplicated
