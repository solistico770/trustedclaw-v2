## Why

Entities are the brain's long-term memory — but right now they're disconnected fragments. An entity has a name and maybe a phone number, but no continuity: you can't pull "everything about this person" (their signals, cases, tasks, conversation threads) in one query. The LLM triages signals and scans cases in isolation — it doesn't see the full picture of who someone is, what their history looks like, or how conversations thread across time. WhatsApp/Telegram conversation IDs and stable JIDs aren't first-class entity identifiers, so the same person across channels looks like strangers. The entity model needs to become the connective tissue that turns isolated signals into a coherent memory the LLM can reason over.

## What Changes

- Add **channel identifiers** as first-class entity fields: `wa_jid`, `tg_chat_id`, `tg_user_id` — enabling automatic entity resolution from incoming signals
- Add **`signal_entities`** junction table linking signals directly to entities (not just via cases), so the LLM can query "all signals involving entity X" regardless of case
- Add **entity timeline** — a materialized view or query pattern that assembles signals + cases + tasks for an entity in chronological order, ready for LLM context injection
- Add **entity context assembler** — a function that builds a structured "entity dossier" (identity, history, open cases, relationships) for the LLM to consume during triage and case scan
- Refine **entity metadata schema** — move ad-hoc JSONB fields to structured columns where they matter for joins/search (phone, email already done; now wa_jid, tg identifiers, company affiliation)
- Add **auto-resolve on ingest** — signal ingestion automatically matches `sender_jid` / `tg_user_id` to existing entities and tags the signal, before triage even runs

## Capabilities

### New Capabilities
- `entity-identifiers`: Channel-native identity fields (wa_jid, tg_chat_id, tg_user_id) as first-class columns with unique constraints and auto-resolution from signals
- `signal-entity-link`: Direct signal-to-entity junction table enabling "all signals for entity X" queries independent of case assignment
- `entity-timeline`: Chronological assembly of all entity activity (signals, cases, tasks, case_events) into a single queryable timeline
- `entity-context-assembler`: Server-side function that builds a structured LLM-ready dossier for any entity — identity, recent signals, open cases, related entities, tasks
- `auto-entity-resolve`: Signal ingestion automatically matches sender identifiers to known entities and creates signal_entities links before triage

### Modified Capabilities

## Impact

- **Database**: New `signal_entities` table, new columns on `entities` (wa_jid, tg_chat_id, tg_user_id), new indexes for identifier lookups
- **Signal ingestion API** (`/api/signals/ingest`): Add auto-entity-resolve step after dedup
- **Agent scanner** (`agent-scanner.ts`): Inject entity dossier into triage and case scan prompts
- **Gemini agent** (`gemini-agent.ts`): Update prompt templates to include entity context
- **Entity API** (`/api/entities`): Add timeline endpoint, dossier endpoint
- **EC2 Listener**: Must forward stable `sender_jid` and `tg_user_id` in signal payloads (already partially done)
