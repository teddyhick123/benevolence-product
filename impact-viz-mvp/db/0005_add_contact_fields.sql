-- Add phone and photo fields to holdings table for primary contact
ALTER TABLE public.holdings
ADD COLUMN IF NOT EXISTS primary_contact_phone text,
ADD COLUMN IF NOT EXISTS primary_contact_photo text;