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
