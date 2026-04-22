-- Migration: Acknowledgment Letters table and RLS

-- ============================================================================
-- 1. ACKNOWLEDGMENT_LETTERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.acknowledgment_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
  contribution_id UUID REFERENCES public.contributions_received(id) ON DELETE SET NULL,

  -- Letter metadata
  letter_type TEXT NOT NULL DEFAULT 'receipt' CHECK (letter_type IN ('year_end', 'receipt', 'qcd', 'non_cash', 'general')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'archived')),

  -- Content
  subject TEXT,
  body TEXT,
  custom_message TEXT,
  org_name TEXT,   -- snapshot at generation time
  org_ein TEXT,    -- snapshot at generation time

  -- Delivery
  sent_via TEXT DEFAULT 'email' CHECK (sent_via IN ('email', 'mail', 'both')),
  sent_at TIMESTAMPTZ,
  pdf_url TEXT,      -- Supabase Storage public URL after generation
  pdf_storage_path TEXT,

  -- Tax year this letter covers (for year_end type)
  tax_year INTEGER,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ack_letters_org ON public.acknowledgment_letters(organization_id);
CREATE INDEX idx_ack_letters_donor ON public.acknowledgment_letters(donor_id);
CREATE INDEX idx_ack_letters_status ON public.acknowledgment_letters(organization_id, status);
CREATE INDEX idx_ack_letters_type ON public.acknowledgment_letters(organization_id, letter_type);

-- ============================================================================
-- 2. TRIGGER
-- ============================================================================
CREATE TRIGGER update_acknowledgment_letters_updated_at BEFORE UPDATE ON public.acknowledgment_letters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.acknowledgment_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_can_read_ack_letters" ON public.acknowledgment_letters;
CREATE POLICY "org_members_can_read_ack_letters" ON public.acknowledgment_letters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = acknowledgment_letters.organization_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_editors_can_insert_ack_letters" ON public.acknowledgment_letters;
CREATE POLICY "org_editors_can_insert_ack_letters" ON public.acknowledgment_letters
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = acknowledgment_letters.organization_id AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "org_editors_can_update_ack_letters" ON public.acknowledgment_letters;
CREATE POLICY "org_editors_can_update_ack_letters" ON public.acknowledgment_letters
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = acknowledgment_letters.organization_id AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "org_admins_can_delete_ack_letters" ON public.acknowledgment_letters;
CREATE POLICY "org_admins_can_delete_ack_letters" ON public.acknowledgment_letters
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = acknowledgment_letters.organization_id AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );
