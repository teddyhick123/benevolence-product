-- Add notes field to holdings table for primary contact
ALTER TABLE public.holdings
ADD COLUMN IF NOT EXISTS primary_contact_notes text;
