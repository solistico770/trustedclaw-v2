-- Structured identity for "who am I" context
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS identity JSONB DEFAULT '{}';

-- Entity group context: each entity_type can have context/instructions
ALTER TABLE public.entity_types ADD COLUMN IF NOT EXISTS context TEXT;
