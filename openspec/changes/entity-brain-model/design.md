## Context

TrustedClaw's entity model currently stores basic identity (canonical_name, phone, email, whatsapp_number, telegram_handle) and links to cases via the `case_entities` junction table. Signals link to cases via `case_id`, but there is no direct signal-to-entity link. The LLM sees entity names during case scan but cannot query "all activity for person X" — it only sees the signals attached to the current case.

The ingestion pipeline (`/api/signals/ingest`) saves `sender_identifier` (WA JID like `972501234567@c.us` or TG user IDs) on each signal, but this isn't matched to entities until the LLM runs triage — meaning entity resolution is manual, LLM-driven, and happens after the fact. The LLM also lacks conversation-level context: if a person has 3 open cases and sends a new message, triage doesn't know about the other cases because entity lookup isn't part of the triage context.

Key constraint: Gemini 2.5 Flash has ~1M token context but triage batches run with 50 signals + open cases. Entity dossiers need to be concise — we're adding context, not dumping everything.

## Goals / Non-Goals

**Goals:**
- Entity auto-resolution: incoming signals automatically link to known entities by channel identifier before triage
- Entity as memory hub: any entity can surface its full timeline (signals, cases, tasks) for LLM consumption
- LLM-ready context: structured dossier format that gives the LLM enough history to make good decisions without overwhelming token budget
- Searchable identifiers: WA JID, TG user ID as indexed columns for fast lookup

**Non-Goals:**
- Entity merge/dedup UI — that's a separate UX concern
- Cross-user entity sharing — entities remain per-user
- Real-time entity streaming — batch/cron resolution is fine
- Full conversation reconstruction from channel APIs — we work with what signals we have

## Decisions

### 1. Channel identifiers as columns, not JSONB

Add `wa_jid` (text, nullable, unique per user) and `tg_user_id` (text, nullable, unique per user) as real columns on `entities`. Currently `whatsapp_number` and `telegram_handle` exist but aren't stable identifiers — WA JID (`972501234567@c.us` or LID format `33436521762932@lid`) is the stable key that appears on every signal.

**Why not keep in metadata JSONB?** Can't create unique indexes, can't do fast lookups during ingestion, can't JOIN efficiently. These are the primary keys for entity resolution — they must be real columns.

**Migration:** Populate `wa_jid` from existing `whatsapp_number` by appending `@c.us` where the number looks like a phone. Existing `whatsapp_number`/`telegram_handle` stay for display purposes.

### 2. `signal_entities` junction table

```sql
CREATE TABLE signal_entities (
  signal_id uuid REFERENCES signals(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES entities(id) ON DELETE CASCADE,
  resolution_method text CHECK (resolution_method IN ('auto', 'triage', 'scan', 'manual')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (signal_id, entity_id)
);
CREATE INDEX idx_signal_entities_entity ON signal_entities(entity_id);
```

**Why a junction, not a FK on signals?** A signal can involve multiple entities (sender + mentioned people). And we need to query both directions: "signals for entity" and "entities for signal."

`resolution_method` tracks HOW the link was created — `auto` (ingestion matcher), `triage` (LLM triage), `scan` (case scan), `manual` (user action). This lets us measure auto-resolution accuracy.

### 3. Auto-resolve on ingest (lightweight, pre-triage)

In `/api/signals/ingest`, after dedup check and before returning:

```
1. Extract sender_jid from raw_payload (already available)
2. SELECT id FROM entities WHERE wa_jid = sender_jid AND user_id = ?
3. If found → INSERT INTO signal_entities (signal_id, entity_id, 'auto')
4. If not found → no-op (triage will handle entity creation)
```

**Why at ingest, not a separate cron?** Ingestion already has the sender_jid. One extra query per signal is cheap (~1ms). By the time triage runs, signals already have entity links — the LLM can then see "this person has 3 open cases" in its context.

**TG signals:** Same pattern with `tg_user_id` extracted from `raw_payload.from.id`.

### 4. Entity timeline query (not a materialized view)

A server-side function that builds the timeline on demand:

```sql
-- Signals involving entity
SELECT 'signal' as event_type, s.id, s.occurred_at, s.raw_payload->>'content' as content, s.case_id
FROM signals s
JOIN signal_entities se ON se.signal_id = s.id
WHERE se.entity_id = $1
UNION ALL
-- Cases involving entity
SELECT 'case' as event_type, c.id, c.created_at, c.title as content, c.id as case_id
FROM cases c
JOIN case_entities ce ON ce.case_id = c.id
WHERE ce.entity_id = $1
UNION ALL
-- Tasks for entity
SELECT 'task' as event_type, t.id, t.created_at, t.title as content, t.case_id
FROM tasks t
WHERE t.entity_id = $1
ORDER BY occurred_at DESC
LIMIT 50;
```

**Why not materialized view?** Timeline is per-entity, read-rarely (only when LLM needs it or user views entity). Materialized views would need constant refreshing and consume storage. A query with proper indexes is fast enough (<50ms).

### 5. Entity dossier format for LLM context

When triage or case scan needs entity context, build a concise dossier:

```
ENTITY: חיים כהן (person) [active]
  Phone: 972501234567 | WA: 972501234567@c.us | TG: @chaim
  Company: ABC בע"מ | Role: מנכ"ל
  Open Cases: 3 (Case #12 "תשלום חשבונית", Case #18 "פגישה יום שלישי", Case #25 "הזמנה חדשה")
  Recent Signals (last 7 days): 12 messages
  Last Contact: 2 hours ago
  Related Entities: דני (employee), ABC בע"מ (company)
```

**Token budget:** ~100 tokens per entity dossier. During triage (50 signals), we inject dossiers for matched entities only — typically 5-15 entities = 500-1500 tokens. Negligible vs the full prompt.

**When to inject:**
- **Triage:** For each auto-resolved entity in the pending signals batch
- **Case scan:** For all entities linked to the case being scanned
- **Threshold:** Only entities with >1 signal or >1 case (skip single-mention entities to save tokens)

### 6. Triage prompt enhancement

Add a new section after EXISTING OPEN CASES:

```
KNOWN ENTITIES IN THIS BATCH:
[Entity dossiers for auto-resolved entities]
```

This gives the LLM the key insight it's missing: "this person already has open cases, assign to one of them" instead of creating duplicates.

## Risks / Trade-offs

**[Extra query on every ingest] →** One SELECT per signal during ingestion. Mitigated by unique index on `(user_id, wa_jid)`. At current volume (<1000 signals/day), this is negligible.

**[Entity dossier staleness] →** Dossier is built at scan/triage time, not cached. Signals arriving between dossier build and LLM response won't be reflected. Acceptable — the LLM already works with batched, slightly-stale data.

**[Auto-resolve false positives] →** If a WA JID is wrongly assigned to an entity, all future signals auto-link to the wrong person. Mitigated by: (1) JIDs are stable and unique per phone, (2) `resolution_method` tracking lets us audit, (3) LLM triage can override/correct.

**[Migration for existing signals] →** Existing signals have no `signal_entities` rows. A one-time backfill script matches `sender_identifier` against `entities.wa_jid` to create historical links. Signals that can't be matched remain unlinked (they still have `case_id`).

**[Token budget creep] →** As entities accumulate history, dossiers could grow. Mitigated by fixed limits: last 5 cases, last 7 days of signals, max 100 tokens per dossier.
