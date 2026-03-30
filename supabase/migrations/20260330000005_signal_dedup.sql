-- Add dedup hash to signals to prevent duplicate ingestion
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS dedup_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_dedup ON public.signals(dedup_hash) WHERE dedup_hash IS NOT NULL;
