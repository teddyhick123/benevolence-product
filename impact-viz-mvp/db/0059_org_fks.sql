-- Add org_id to portfolios (nullable first for backward compat)
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_portfolios_org_id ON public.portfolios(org_id);

-- Add org_id to quickbooks_connections
ALTER TABLE public.quickbooks_connections
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_qb_connections_org_id ON public.quickbooks_connections(org_id);

-- Add org_id to import_jobs and import_mapping_profiles
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.import_mapping_profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create a default organization for existing demo data
DO $$
DECLARE
  v_org_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  INSERT INTO public.organizations (id, name, ein, org_type, modules)
  VALUES (
    v_org_id,
    'Demo Organization',
    '00-0000000',
    'private_foundation',
    '{"portfolio": true, "tax": true, "grants": true, "compliance": true, "donors": true, "quickbooks": true}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  -- Link existing demo portfolios to the default org
  UPDATE public.portfolios SET org_id = v_org_id WHERE org_id IS NULL;
END;
$$;
