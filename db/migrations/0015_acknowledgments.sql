-- =============================================================================
-- 0015_acknowledgments.sql
-- Donor acknowledgment letters and letter templates.
-- Module-gated: org_has_module(org_id, 'donors').
-- Depends on: 0001, 0002, 0014
-- =============================================================================

-- ---------------------------------------------------------------------------
-- letter_templates — reusable acknowledgment letter templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS letter_templates (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name            text NOT NULL,
  description     text,
  gift_types      text[],         -- null = all types; e.g. ['cash','securities']
  is_default      boolean NOT NULL DEFAULT false,
  body_template   text NOT NULL,  -- Handlebars/mustache template with {{donor.name}} etc.
  subject_template text,
  signature_block text,
  is_active       boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_letter_templates_org_id ON letter_templates (org_id) WHERE is_active;

CREATE TRIGGER trg_letter_templates_updated_at
  BEFORE UPDATE ON letter_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- acknowledgment_letters — generated letters, one per contribution batch or single gift
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acknowledgment_letters (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  donor_id        uuid NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES letter_templates(id) ON DELETE SET NULL,

  -- Linked contributions (one letter can cover multiple gifts)
  contribution_ids uuid[] NOT NULL DEFAULT '{}',

  -- Content (rendered from template at generation time)
  subject         text,
  body            text NOT NULL,
  letter_date     date NOT NULL DEFAULT CURRENT_DATE,

  -- Delivery
  delivery_method text NOT NULL DEFAULT 'email',  -- 'email', 'print', 'both'
  sent_at         timestamptz,
  sent_by         uuid REFERENCES auth.users(id),
  recipient_email text,

  -- Storage (for PDF version)
  storage_path    text,
  storage_bucket  text DEFAULT 'letters',

  status          text NOT NULL DEFAULT 'draft',  -- 'draft', 'ready', 'sent', 'failed'

  notes           text
);

CREATE INDEX idx_ack_letters_org_id    ON acknowledgment_letters (org_id);
CREATE INDEX idx_ack_letters_donor_id  ON acknowledgment_letters (donor_id);
CREATE INDEX idx_ack_letters_status    ON acknowledgment_letters (org_id, status);

CREATE TRIGGER trg_ack_letters_updated_at
  BEFORE UPDATE ON acknowledgment_letters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE letter_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "letter_templates: org members can view"
  ON letter_templates FOR SELECT
  USING (can_view_org(org_id) AND org_has_module(org_id, 'donors'));
CREATE POLICY "letter_templates: org admins can manage"
  ON letter_templates FOR ALL
  USING (is_org_admin(org_id) AND org_has_module(org_id, 'donors'))
  WITH CHECK (is_org_admin(org_id) AND org_has_module(org_id, 'donors'));

ALTER TABLE acknowledgment_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ack_letters: org members can view"
  ON acknowledgment_letters FOR SELECT
  USING (can_view_org(org_id) AND org_has_module(org_id, 'donors'));
CREATE POLICY "ack_letters: org members (member+) can manage"
  ON acknowledgment_letters FOR ALL
  USING (can_edit_org(org_id) AND org_has_module(org_id, 'donors'))
  WITH CHECK (can_edit_org(org_id) AND org_has_module(org_id, 'donors'));

CREATE OR REPLACE FUNCTION public.create_contribution_receipt_acknowledgment(
  p_org_id uuid,
  p_contribution_id uuid,
  p_actor_id uuid,
  p_subject text,
  p_body text,
  p_send_immediately boolean DEFAULT false,
  p_recipient_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_contribution public.contributions_received%ROWTYPE;
  v_letter public.acknowledgment_letters%ROWTYPE;
  v_send boolean := COALESCE(p_send_immediately, false) AND p_recipient_email IS NOT NULL;
  v_receipt_number text;
BEGIN
  SELECT *
  INTO v_contribution
  FROM public.contributions_received cr
  WHERE cr.id = p_contribution_id
    AND cr.org_id = p_org_id
  FOR UPDATE;

  IF v_contribution.id IS NULL THEN
    RAISE EXCEPTION 'Contribution not found';
  END IF;

  v_receipt_number := COALESCE(v_contribution.receipt_number, public.generate_receipt_number(p_org_id));

  INSERT INTO public.acknowledgment_letters (
    org_id,
    donor_id,
    contribution_ids,
    subject,
    body,
    status,
    delivery_method,
    sent_at,
    sent_by,
    recipient_email
  )
  VALUES (
    p_org_id,
    v_contribution.donor_id,
    ARRAY[p_contribution_id],
    p_subject,
    p_body,
    CASE WHEN v_send THEN 'sent' ELSE 'draft' END,
    'email',
    CASE WHEN v_send THEN v_now ELSE NULL END,
    CASE WHEN v_send THEN p_actor_id ELSE NULL END,
    p_recipient_email
  )
  RETURNING * INTO v_letter;

  UPDATE public.contributions_received
  SET
    acknowledgment_sent = v_send,
    acknowledged_at = v_now,
    receipt_status = CASE WHEN v_send THEN 'sent' ELSE 'generated' END,
    receipt_number = v_receipt_number,
    receipt_generated_at = v_now,
    receipt_sent_at = CASE WHEN v_send THEN v_now ELSE NULL END,
    updated_at = v_now
  WHERE id = p_contribution_id
    AND org_id = p_org_id
  RETURNING * INTO v_contribution;

  RETURN jsonb_build_object(
    'letter', to_jsonb(v_letter),
    'contribution', to_jsonb(v_contribution),
    'sent', v_send,
    'receipt_number', v_receipt_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_contribution_receipt_acknowledgment(
  uuid, uuid, uuid, text, text, boolean, text
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_contribution_receipt_acknowledgment(
  uuid, uuid, uuid, text, text, boolean, text
) TO service_role;
