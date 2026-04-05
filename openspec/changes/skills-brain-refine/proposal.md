## Why

Skills are the LLM's instruction manual — they tell it HOW to think about entities, cases, triage, and memory. Right now, all 5 skills are auto-attached to every prompt (burning tokens), they're too broad (one "entity" skill covers creation, dedup, linking, enrichment), and critical operations are missing (no skill for "recall entity history", "decide importance vs urgency", "when to rescan", "classify conversation topics across multiple messages"). The LLM needs fine-grained, task-specific skills — one per atomic operation — so it can be precise about entity lifecycle, memory management, and conversation threading. Skills should also teach the LLM WHEN to pull context (entity dossiers, conversation history) and HOW to decide what's important enough to track.

## What Changes

- **Decompose existing skills** into atomic, single-responsibility skills (e.g., "entity" splits into "entity-create", "entity-recall", "entity-enrich")
- **Add conversation threading skill** — teaches LLM to recognize multi-message conversations spanning the same topic, group them properly, and handle topic switches within one chat
- **Add memory importance skill** — teaches LLM to classify what's worth remembering vs noise, and when to schedule rescans based on context (not just urgency matrix)
- **Add entity recall skill** — teaches LLM to request and interpret entity dossiers, use history to make better assign/create decisions
- **Convert most skills from auto-attach to pull-on-demand** — reduce base prompt token usage, only inject skills when needed
- **Add skill dependency hints** — skills can suggest other skills to pull (e.g., "entity-create" suggests "entity-recall" for dedup checking)

## Capabilities

### New Capabilities
- `skill-decomposition`: Split existing monolithic skills into atomic single-responsibility skills with clear trigger conditions
- `conversation-threading-skill`: New skill teaching LLM to handle multi-message conversations, topic detection, and message grouping across a single chat
- `memory-importance-skill`: New skill teaching LLM to classify signal/case importance, decide what to track, and set intelligent rescan schedules
- `entity-recall-skill`: New skill teaching LLM to request entity dossiers, interpret history, and use it for assign/create decisions
- `skill-activation-model`: Change from all-auto-attach to selective activation — only signal-triage and case-management auto-attach, rest are pull-on-demand with trigger hints

### Modified Capabilities

## Impact

- **Skills table**: No schema change needed — existing `auto_attach` field handles the activation model
- **Seed script** (`scripts/create-skills.js`): Complete rewrite with new decomposed skills
- **Agent scanner** (`agent-scanner.ts`): Update skill injection logic to include dependency hints
- **Gemini agent** (`gemini-agent.ts`): Update prompt to show skill trigger conditions, not just summaries
- **Token budget**: Expect ~40% reduction in base prompt tokens by moving most skills to pull-on-demand
