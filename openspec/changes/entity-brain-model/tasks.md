## 1. Database Schema — Entity Identifiers

- [x] 1.1 Create migration adding `wa_jid` (text, nullable) and `tg_user_id` (text, nullable) columns to `entities` table
- [x] 1.2 Add unique indexes: `(user_id, wa_jid)` WHERE wa_jid IS NOT NULL, `(user_id, tg_user_id)` WHERE tg_user_id IS NOT NULL
- [x] 1.3 Write backfill SQL: populate `wa_jid` from `whatsapp_number` by appending `@c.us` for valid phone-format numbers

## 2. Database Schema — signal_entities Junction Table

- [x] 2.1 Create migration for `signal_entities` table: (signal_id uuid FK, entity_id uuid FK, resolution_method text CHECK, created_at timestamptz, PK(signal_id, entity_id))
- [x] 2.2 Add index on `signal_entities(entity_id)` for reverse lookups
- [x] 2.3 Write backfill script matching existing `signals.sender_identifier` to `entities.wa_jid` and inserting `signal_entities` rows with `resolution_method = 'auto'`

## 3. Auto-Entity-Resolve on Ingestion

- [x] 3.1 Update `/api/signals/ingest/route.ts`: after dedup check, query `entities` by `wa_jid` matching `raw_payload.sender_jid` (or `tg_user_id` for TG signals)
- [x] 3.2 If entity found, insert into `signal_entities` with `resolution_method = 'auto'`
- [x] 3.3 Return `entity_id` in ingestion response when auto-resolved
- [x] 3.4 Skip entity resolution for duplicate signals (dedup=true)

## 4. Entity Context Assembler

- [x] 4.1 Create `src/lib/entity-dossier.ts` with `buildEntityDossier(supabase, entityId)` function
- [x] 4.2 Implement dossier format: identity line, contact fields, open cases (limit 5), signal count (last 7d), last contact time, related entities (limit 5)
- [x] 4.3 Create `buildBatchDossiers(supabase, entityIds[])` using batch queries (single round-trip)
- [x] 4.4 Add token budget enforcement: cap dossier at ~150 tokens per entity

## 5. Triage Prompt Enhancement

- [x] 5.1 In `agent-scanner.ts` triage flow: collect unique entity IDs from auto-resolved signals in the batch
- [x] 5.2 Call `buildBatchDossiers` for resolved entities
- [x] 5.3 Inject `KNOWN ENTITIES IN THIS BATCH` section into triage prompt in `gemini-agent.ts` after EXISTING OPEN CASES

## 6. Case Scan Prompt Enhancement

- [x] 6.1 In `agent-scanner.ts` case scan flow: fetch entity IDs linked to the case via `case_entities`
- [x] 6.2 Call `buildBatchDossiers` for case entities
- [x] 6.3 Inject entity dossiers into case scan prompt in `gemini-agent.ts`

## 7. Agent Command Updates

- [x] 7.1 Add `wa_jid` and `tg_user_id` to `AgentCommand` type for `create_entity`
- [x] 7.2 Update agent scanner's `create_entity` handler to persist `wa_jid`/`tg_user_id` columns
- [x] 7.3 On `create_entity`: check if entity with same `wa_jid` already exists — if so, link existing instead of creating duplicate
- [x] 7.4 On `create_entity` and `attach_entity`: create `signal_entities` rows for case signals with `resolution_method = 'triage'` or `'scan'`

## 8. Entity Timeline API

- [x] 8.1 Create `GET /api/entities/[id]/timeline` route with `limit` and `since` query params
- [x] 8.2 Implement UNION query: signals (via signal_entities) + cases (via case_entities) + tasks (via entity_id) + case_events, ordered by timestamp DESC
- [x] 8.3 Return JSON: `{ timeline: [...], entity_id, count }`

## 9. Skill Updates

- [x] 9.1 Update `entity` skill instructions: mention wa_jid extraction from sender_identifier, auto-resolve behavior
- [x] 9.2 Update `entity-data` skill instructions: include wa_jid and tg_user_id as fields to extract and store
- [x] 9.3 Update `signal-triage` skill: mention KNOWN ENTITIES section and how to use entity history for assign vs create decisions
