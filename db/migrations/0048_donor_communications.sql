-- Migration: Donor Communications Table and View
-- Description: Creates donor_communications table and v_contribution_with_donor view.
--              Fixes Dr-B1.
-- Date: 2026-06-02

-- ---------------------------------------------------------------------------
-- donor_communications — interaction log for donor CRM
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.donor_communications (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  donor_id             uuid        NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,
  org_id               uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  direction            text        NOT NULL DEFAULT 'outbound'
                                   CHECK (direction IN ('inbound', 'outbound')),
  comm_type            text        NOT NULL
                                   CHECK (comm_type IN (
                                     'email', 'call', 'meeting', 'letter',
                                     'text', 'event', 'note', 'other'
                                   )),
  subject              text,
  summary              text,
  occurred_at          timestamptz NOT NULL DEFAULT now(),
  logged_by            uuid        REFERENCES auth.users(id),

  follow_up_required   boolean     NOT NULL DEFAULT false,
  follow_up_date       date,
  follow_up_completed  boolean     NOT NULL DEFAULT false,

  linked_contribution_id uuid      REFERENCES public.contributions_received(id) ON DELETE SET NULL,
  tags                 text[]      NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_donor_comms_donor_id  ON public.donor_communications (donor_id);
CREATE INDEX IF NOT EXISTS idx_donor_comms_org_id    ON public.donor_communications (org_id);
CREATE INDEX IF NOT EXISTS idx_donor_comms_occurred  ON public.donor_communications (org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_donor_comms_followup  ON public.donor_communications (org_id, follow_up_date)
  WHERE follow_up_required = true AND follow_up_completed = false;

ALTER TABLE public.donor_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "donor_communications: org members can view"
  ON public.donor_communications FOR SELECT TO authenticated
  USING (public.can_view_org(org_id));

CREATE POLICY "donor_communications: org admins can manage"
  ON public.donor_communications FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "donor_communications: service role full access"
  ON public.donor_communications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.donor_communications TO authenticated;
GRANT ALL ON public.donor_communications TO service_role;

CREATE TRIGGER set_donor_communications_updated_at
  BEFORE UPDATE ON public.donor_communications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- v_contribution_with_donor — enriched contribution rows for reporting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_contribution_with_donor
  WITH (security_invoker = true)
AS
SELECT
  cr.id                                                         AS contribution_id,
  cr.org_id,
  d.id                                                          AS donor_id,
  COALESCE(
    NULLIF(TRIM(d.first_name || ' ' || d.last_name), ''),
    d.organization_name,
    'Unknown Donor'
  )                                                             AS donor_name,
  d.email                                                       AS donor_email,
  cr.amount,
  cr.contribution_date,
  cr.gift_type,
  cr.receipt_number,
  cr.receipt_sent_at,
  CASE WHEN cr.receipt_sent_at IS NOT NULL THEN 'sent' ELSE 'pending' END
                                                                AS receipt_status,
  CASE WHEN cr.acknowledgment_sent_at IS NOT NULL THEN 'sent' ELSE 'pending' END
                                                                AS acknowledgment_status,
  cr.acknowledgment_sent_at,
  cr.is_pledge,
  cr.campaign,
  cr.notes
FROM public.contributions_received cr
JOIN public.donors                  d  ON d.id = cr.donor_id;

GRANT SELECT ON public.v_contribution_with_donor TO authenticated, service_role;
