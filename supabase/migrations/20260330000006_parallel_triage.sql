-- Allow 'triaging' status for parallel signal processing
ALTER TABLE public.signals DROP CONSTRAINT IF EXISTS signals_status_check;
ALTER TABLE public.signals ADD CONSTRAINT signals_status_check
  CHECK (status IN ('pending', 'triaging', 'processed', 'ignored'));
