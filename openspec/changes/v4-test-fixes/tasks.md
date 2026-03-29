## 1. Fix executeCommands DB write

- [x] 1.1 In `agent-scanner.ts` `executeCommands`: capture `{ error }` from final `db.from("cases").update(updates)` call
- [x] 1.2 If error: log it, push to results array as `{type: "db_update", status: "error", detail: error.message}`
- [x] 1.3 After update: re-read the case to verify title/summary were actually saved. Log mismatch if found.

## 2. Fix merge context

- [x] 2.1 In `agent-scanner.ts` `scanCase`: change open cases query to include first message via join: `messages(raw_payload, sender_identifier)`
- [x] 2.2 In `gemini-agent.ts`: update the `openCases` type to include messages
- [x] 2.3 In `gemini-agent.ts` prompt: show each open case as `Case #X: "title" — first message: "content"` instead of just title

## 3. Fix entity context

- [x] 3.1 In `agent-scanner.ts` `scanCase`: fetch existing case_entities with entity names before calling agent
- [x] 3.2 Pass existing entity names to `callAgent` function
- [x] 3.3 In `gemini-agent.ts`: add `existingEntities` parameter, include in prompt as "ALREADY CONNECTED: [list]. Do NOT re-propose."

## 4. Fix entity dedup

- [x] 4.1 In `agent-scanner.ts` `executeCommands` propose_entity: trim + normalize name before ilike check
- [x] 4.2 Use `or` filter to also match partial (contains) — catches "עו״ד רונן" vs "רונן"
- [x] 4.3 Dedup migration: delete duplicate entities in DB (same user, same lowercase name)

## 5. Update skills in DB

- [x] 5.1 Delete all existing skills
- [x] 5.2 Create "First Contact" (AUTO) — strengthen: MUST set title+summary, case is USELESS without them
- [x] 5.3 Create "Entity Attachment" (AUTO) — add blocklist: no generic words, no re-proposing connected entities
- [x] 5.4 Create "Urgency & Importance" (AUTO) — add de-escalation: "paid"/"resolved"/"thanks" → lower urgency+importance
- [x] 5.5 Create "Scan Scheduling" (AUTO) — unchanged
- [x] 5.6 Create "Case Merge" (AUTO, was PULL) — runs on every scan, not just when pulled
- [x] 5.7 Create "Escalation & De-escalation" (AUTO, was PULL) — evaluates direction every scan
- [x] 5.8 Create "Handle Financial Matter" (PULL)
- [x] 5.9 Create "Handle Personal Request" (PULL)
- [x] 5.10 Create "Handle Customer Service" (PULL)

## 6. Test & Deploy

- [x] 6.1 Reset test data (delete all cases, entities, events)
- [x] 6.2 Build + deploy
- [x] 6.3 Test: send message → scan → verify title+summary are SET ✓ "Overdue Invoice #4521 (15,000 ILS) from David Cohen"
- [x] 6.4 Test: send follow-up message → scan → verify MERGE happens ✓ merged into case #1
- [x] 6.5 Test: send "paid, all good" → scan → verify DE-ESCALATION ✓ U=1→3, I=1→2, merged + de-escalated
- [x] 6.6 Test: verify no duplicate entities ✓ only 2 entities, zero dupes
- [x] 6.7 Test: verify no generic entities like "dashboard" ✓ only "דוד כהן" and "Invoice #4521"
