## Context

TrustedClaw uses a skills system where each skill is a text instruction block injected into the LLM prompt. Currently 5 skills exist, all `auto_attach: true`, meaning they're ALL injected into every triage and case scan call. This wastes tokens (~2000 tokens of skill instructions per call) and gives the LLM too many instructions at once — it can't focus.

The 2-pass pull mechanism already exists: the LLM can call `pull_skill` to request a skill, then the agent scanner re-runs with that skill's instructions injected. But this is rarely used because everything is auto-attached.

Current skills and their problems:
- `signal-triage` (auto) — Good, but doesn't teach conversation threading
- `create-entity-group` (auto) — Rarely needed, wastes tokens on every call
- `entity` (auto) — Too broad: covers creation, linking, dedup, identification all in one
- `entity-data` (auto) — Good for enrichment but should only activate when processing entities
- `case-management` (auto) — Good, but doesn't teach rescan intelligence

## Goals / Non-Goals

**Goals:**
- Reduce base prompt tokens by ~40% through selective skill activation
- Give LLM precise, focused instructions per task type
- Teach LLM conversation threading (10 messages = 1 conversation, not 10 cases)
- Teach LLM memory importance (what to track, what to ignore, when to rescan)
- Enable skill chaining: one skill can suggest pulling another

**Non-Goals:**
- Dynamic skill generation — skills are still hand-authored
- User-facing skill editor UI — that's a separate change
- Changing the 2-pass pull mechanism — it works, just underused
- Per-signal skill selection — skills apply at the triage/scan level, not per-signal

## Decisions

### 1. New skill decomposition (from 5 → 10 skills)

**Auto-attach (always in prompt):**
- `signal-triage` — Core triage rules (refined with conversation threading)
- `case-management` — Status/urgency/importance lifecycle

**Pull-on-demand (injected when LLM requests or trigger matches):**
- `entity-create` — How to create entities, fields, dedup rules. Trigger: "when creating new entities"
- `entity-recall` — How to request and use entity dossiers/history. Trigger: "when a known entity appears in signals"
- `entity-enrich` — How to extract and update entity metadata. Trigger: "when signals contain contact info, addresses, relationships"
- `entity-group-create` — How to create new entity type categories. Trigger: "when encountering entities that don't fit existing types"
- `conversation-threading` — How to recognize multi-message conversations, handle topic changes. Trigger: "when multiple signals from same sender or same group"
- `memory-importance` — How to classify importance, set rescans, decide what to remember. Trigger: "when setting urgency/importance or deciding rescan timing"
- `task-management` — How to create, close, update tasks (extracted from case-management). Trigger: "when follow-up actions are identified"
- `merge-detection` — How to detect and execute case merges. Trigger: "when signals overlap with existing cases or same entity appears across cases"

**Why this split?** The LLM always needs triage rules and case lifecycle. But entity operations, threading, and importance classification are situational. A triage batch of 50 spam signals doesn't need entity-enrich instructions. A case scan for a simple "call me back" doesn't need merge-detection.

### 2. Skill trigger conditions replace simple summaries

Current: `SKILL "entity": How to create, identify, and link entities`
New: 
```
SKILL "entity-create" [PULL when creating new entities]:
  Creates person/company/project entities with dedup. Suggests: entity-recall
SKILL "entity-recall" [PULL when a known entity appears]:
  Interprets entity dossiers and history for better decisions. Suggests: entity-enrich
```

The trigger condition tells the LLM WHEN to pull, and `Suggests:` creates a lightweight dependency chain. The LLM doesn't need to know the full instructions until it pulls — just when to ask.

### 3. Conversation threading skill — the key missing piece

This is the biggest gap. Currently if someone sends 10 messages about 3 topics in WhatsApp, triage creates 10 separate decisions. The threading skill teaches:

```
CONVERSATION THREADING:
- Multiple messages from same sender within 30 minutes = ONE conversation
- Use group_key to batch conversation messages into one case
- TOPIC DETECTION: If messages shift topic, split into separate group_keys
  Example: 3 messages about "invoice" then 2 about "meeting" = 2 group_keys
- GROUP CHATS: Multiple senders on same topic = one case
  Group by topic, not by sender in group chats
- CONTINUATION: If sender has an open case on the same topic, ASSIGN don't create
- VOICE MESSAGES: Treat as text (content field has transcription or "[voice message]")
```

### 4. Memory importance skill — teaching the LLM to manage its own attention

Currently the LLM sets urgency/importance as numbers but doesn't have a framework for WHY. The importance skill teaches:

```
IMPORTANCE CLASSIFICATION:
- Money involved (payments, invoices, debts) → importance ≤ 2
- Legal/contractual → importance ≤ 2  
- Relationship maintenance (check-ins, greetings) → importance 3-4
- Informational only → importance 4-5

RESCAN INTELLIGENCE:
- Don't use default matrix blindly. Think about WHEN something will change:
  - "I'll send the document tomorrow" → rescan tomorrow morning
  - "Meeting next Tuesday" → rescan Monday evening
  - Case addressed, nothing pending → rescan in 3 days
  - Urgent but you just classified it → rescan in 2 hours (not 5 minutes)
- Use set_next_scan with ISO8601 when you have specific timing intelligence
- Default matrix is fallback — your judgment is better when you have context

WHAT TO REMEMBER (create entity/task for):
- Names, phone numbers, dates, amounts — always
- Promises ("I'll do X by Y") — create task
- Recurring patterns ("every month he asks about...") — note in entity metadata
WHAT TO SKIP:
- Greetings, small talk — don't create entities for "שלום" senders unless business follows
```

### 5. Auto-attach budget tracking

Add a simple token estimation in the prompt builder:
```typescript
const autoSkills = skills.filter(s => s.auto_attach);
const autoTokenEstimate = autoSkills.reduce((sum, s) => sum + s.instructions.length / 4, 0);
// Log if > 1500 tokens — indicates too many auto-attach skills
```

This is monitoring only — no runtime behavior change. Just helps us track whether the 40% reduction goal is met.

## Risks / Trade-offs

**[LLM might not pull needed skills] →** If triage encounters a complex entity situation but doesn't pull `entity-create`, it might make worse decisions. Mitigated by: (1) trigger conditions are explicit, (2) the 2-pass mechanism already handles this — if the LLM's first pass is weak, it can still pull skills, (3) `signal-triage` auto-attach includes basic entity extraction rules.

**[More skills = more complexity in seed script] →** Going from 5 to 10 skills doubles the maintenance surface. Mitigated by: each skill is smaller and more focused, making them easier to iterate on individually.

**[Pull latency] →** When the LLM pulls a skill, the 2-pass mechanism adds a full LLM call. Mitigated by: most cases will be handled by auto-attach skills, pull is for edge cases. And we're saving tokens on the base call, so the occasional extra call is worth it.

**[Conversation threading is heuristic] →** "30 minutes" and "topic detection" are fuzzy. The LLM will need to use judgment. Mitigated by: the skill is guidance, not a hard rule. The LLM already handles ambiguity well — we're giving it a framework instead of leaving it implicit.
