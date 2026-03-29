## Context

Test report from 2026-03-30 found 5 bugs. Root causes are: (1) silent DB update failures, (2) insufficient context sent to LLM, (3) wrong skill auto_attach settings. No architecture changes needed — just fixes to agent-scanner, gemini-agent prompt, and skill definitions.

## Goals / Non-Goals

**Goals:**
- Every scan MUST update the case (title, summary, urgency, importance) or log why it didn't
- Agent has enough context to detect merges (sees first message of other cases)
- Agent knows what entities are already connected (won't re-propose)
- De-escalation happens automatically on positive signals
- No generic nouns as entities

**Non-Goals:**
- UI changes (backend only)
- Schema changes
- New features

## Decisions

### 1. Fix executeCommands — verify DB write

Current: `await db.from("cases").update(updates).eq("id", caseId)` — no error check.

Fix:
```typescript
const { error: updateError } = await db.from("cases").update(updates).eq("id", caseId);
if (updateError) {
  console.error("[scanner] DB update failed:", updateError.message);
  results.push({ type: "db_update", status: "error", detail: updateError.message });
}
```

### 2. Fix merge context — include first message

Current: `openCases` sent as `{id, title, summary, importance, message_count}`. Title is often null.

Fix: Also fetch first message for each open case:
```typescript
const { data: openCases } = await db.from("cases")
  .select("id, title, summary, importance, message_count, messages!inner(raw_payload, sender_identifier)")
  .eq("user_id", userId)
  .not("status", "in", '("closed","merged")')
  .order("importance", { ascending: false })
  .limit(10);
```

Then in prompt: show `title || first_message_content` for each case.

### 3. Fix entity context — send existing list

Before calling agent, fetch existing entities for this case:
```typescript
const { data: existingEntities } = await db.from("case_entities")
  .select("entities(canonical_name, type)")
  .eq("case_id", caseId);
```

Add to prompt: `ALREADY CONNECTED ENTITIES: [list]. Do NOT re-propose these.`

### 4. Fix entity dedup — normalize before check

Current: `ilike("canonical_name", cmd.name)` — doesn't catch Hebrew variations.

Fix: trim + lowercase both sides. Also check with the name reversed (for "עו״ד רונן" vs "רונן עו״ד"):
```typescript
const normalized = cmd.name.trim();
const { data: existing } = await db.from("entities")
  .select("id")
  .eq("user_id", userId)
  .or(`canonical_name.ilike.${normalized},canonical_name.ilike.%${normalized}%`)
  .limit(1);
```

### 5. Skills rebalance

**6 AUTO-ATTACHED:**
1. First Contact (strengthened: MUST set title+summary)
2. Entity Attachment (strengthened: blocklist, no re-proposing)
3. Urgency & Importance (strengthened: de-escalation rules added)
4. Scan Scheduling (unchanged)
5. **Case Merge** (moved from PULL → AUTO)
6. **Escalation & De-escalation** (moved from PULL → AUTO)

**3 PULL-ON-DEMAND:**
7. Handle Financial Matter
8. Handle Personal Request
9. Handle Customer Service

## Risks

- More auto-attached skills = larger prompt = more tokens per scan (~500 more tokens)
- Acceptable trade-off: better results > token savings
