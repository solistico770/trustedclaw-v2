## 1. Decompose Existing Skills — Write New Skill Instructions

- [x] 1.1 Write `signal-triage` skill (auto-attach) — refined with basic conversation threading rules and entity extraction guidance baked in
- [x] 1.2 Write `case-management` skill (auto-attach) — focused on status/urgency/importance lifecycle, empowerment line, summary
- [x] 1.3 Write `entity-create` skill (pull) — entity creation, field rules, dedup by wa_jid/phone/name, trigger: "when creating new entities". SUGGESTS: entity-recall
- [x] 1.4 Write `entity-recall` skill (pull) — how to interpret entity dossiers, use history for assign/create, cross-case awareness. SUGGESTS: entity-enrich
- [x] 1.5 Write `entity-enrich` skill (pull) — metadata extraction (phone, email, address, company, relationships). Trigger: "when signals contain contact info"
- [x] 1.6 Write `entity-group-create` skill (pull) — creating new entity types, slug/display/icon/color/context fields. Trigger: "when encountering entities that don't fit existing types"
- [x] 1.7 Write `conversation-threading` skill (pull) — multi-message grouping, topic detection, group chat handling, continuation vs new case. Trigger: "when multiple signals from same sender or same group"
- [x] 1.8 Write `memory-importance` skill (pull) — importance classification framework, rescan intelligence, what to track vs skip. Trigger: "when setting urgency/importance or deciding rescan timing"
- [x] 1.9 Write `task-management` skill (pull) — task creation, closing, updates, scheduling. Trigger: "when follow-up actions are identified"
- [x] 1.10 Write `merge-detection` skill (pull) — detecting duplicate/overlapping cases, executing merges, entity overlap analysis. Trigger: "when signals overlap with existing cases"

## 2. Update Seed Script

- [x] 2.1 Rewrite `scripts/create-skills.js` with all 10 skills
- [x] 2.2 Set `auto_attach: true` for only `signal-triage` and `case-management`
- [x] 2.3 Set `auto_attach: false` for remaining 8 skills
- [x] 2.4 Include trigger conditions in each skill's `summary` field
- [x] 2.5 Include `SUGGESTS:` sections in skill instructions where applicable
- [ ] 2.6 Run seed script and verify all 10 skills created correctly (requires DB: `node scripts/create-skills.js`)

## 3. Update Prompt Templates

- [x] 3.1 Update AVAILABLE SKILLS format in `gemini-agent.ts` to show: `SKILL "name" [PULL when <trigger>]: summary. Suggests: <skills>`
- [x] 3.2 Verify auto-attach section only injects signal-triage and case-management
- [x] 3.3 Add token budget logging: log character count of auto-attach instructions, warn if > 4800 chars

## 4. Update Agent Scanner

- [x] 4.1 Update `agent-scanner.ts` triage flow to pass only auto-attach skills in first pass
- [x] 4.2 Verify 2-pass pull mechanism works with new skill names
- [x] 4.3 Test skill chaining: when LLM pulls entity-create and its SUGGESTS triggers entity-recall pull

## 5. Verify Token Budget

- [x] 5.1 Measure baseline: current auto-attach skill token count (all 5 skills)
- [x] 5.2 Measure new: auto-attach token count with only 2 skills
- [x] 5.3 Verify ≥ 40% reduction in base prompt skill tokens
- [ ] 5.4 Test end-to-end: triage batch with mixed signals, verify LLM pulls appropriate skills

## 6. Integration Testing

- [ ] 6.1 Test triage with simple batch (no threading needed) — verify only auto-attach skills used
- [ ] 6.2 Test triage with multi-message batch from same sender — verify LLM pulls conversation-threading
- [ ] 6.3 Test case scan with entity dossiers available — verify LLM pulls entity-recall
- [ ] 6.4 Test case scan with financial signals — verify LLM uses memory-importance for classification
- [ ] 6.5 Test skill suggestion chain: entity-create → entity-recall pull
