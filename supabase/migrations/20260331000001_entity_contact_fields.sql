-- Add contact info columns to entities (used by AI agent to store phone, email, etc.)
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS telegram_handle text;
