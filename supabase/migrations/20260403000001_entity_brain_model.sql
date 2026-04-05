-- Entity Brain Model: channel identifiers + signal_entities junction table

-- 1. Add channel-native identifiers to entities
ALTER TABLE entities ADD COLUMN IF NOT EXISTS wa_jid text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS tg_user_id text;

-- Unique indexes (per user, partial — only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_user_wa_jid
  ON entities(user_id, wa_jid) WHERE wa_jid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_user_tg_user_id
  ON entities(user_id, tg_user_id) WHERE tg_user_id IS NOT NULL;

-- Backfill wa_jid from whatsapp_number (phone-format numbers only: 10-15 digits)
UPDATE entities
SET wa_jid = whatsapp_number || '@c.us'
WHERE whatsapp_number IS NOT NULL
  AND wa_jid IS NULL
  AND whatsapp_number ~ '^\d{10,15}$';

-- 2. signal_entities junction table
CREATE TABLE IF NOT EXISTS signal_entities (
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  resolution_method text NOT NULL CHECK (resolution_method IN ('auto', 'triage', 'scan', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (signal_id, entity_id)
);

-- Index for "all signals for entity X" lookups
CREATE INDEX IF NOT EXISTS idx_signal_entities_entity
  ON signal_entities(entity_id);

-- RLS: match parent tables
ALTER TABLE signal_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_entities_user_access" ON signal_entities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM signals s WHERE s.id = signal_entities.signal_id AND s.user_id = auth.uid())
  );

-- Service role bypass
CREATE POLICY "signal_entities_service" ON signal_entities
  FOR ALL USING (auth.role() = 'service_role');
