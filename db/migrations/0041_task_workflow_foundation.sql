-- =============================================================================
-- 0041_task_workflow_foundation.sql
-- Platform task/workflow foundation and grant workflow schema alignment.
-- Depends on: 0001-0040
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Canonical task management
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  deleted_by    uuid REFERENCES auth.users(id),

  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portfolio_id  uuid REFERENCES public.portfolios(id) ON DELETE CASCADE,

  title         text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_progress', 'blocked', 'waiting', 'completed', 'cancelled')),
  priority      text NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  task_type     text NOT NULL DEFAULT 'task'
                CHECK (task_type IN ('task', 'approval', 'reminder', 'follow_up', 'review', 'checklist_step')),
  source        text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'system', 'automation', 'ai', 'template')),
  source_key    text,

  starts_at     timestamptz,
  due_at        timestamptz,
  completed_at  timestamptz,
  completed_by  uuid REFERENCES auth.users(id),
  created_by    uuid REFERENCES auth.users(id),
  assigned_to   uuid REFERENCES auth.users(id),

  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tasks_org_status_due
  ON public.tasks (org_id, status, due_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_org_assignee_status_due
  ON public.tasks (org_id, assigned_to, status, due_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_portfolio_status_due
  ON public.tasks (portfolio_id, status, due_at)
  WHERE portfolio_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_org_source_key_unique
  ON public.tasks (org_id, source_key)
  WHERE source_key IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.task_entity_links (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  task_id       uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  relationship  text NOT NULL DEFAULT 'primary'
);

CREATE INDEX IF NOT EXISTS idx_task_entity_links_task
  ON public.task_entity_links (task_id);
CREATE INDEX IF NOT EXISTS idx_task_entity_links_entity
  ON public.task_entity_links (org_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES auth.users(id),
  body        text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_created
  ON public.task_comments (task_id, created_at);

CREATE TABLE IF NOT EXISTS public.task_events (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  task_id         uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES auth.users(id),
  event_type      text NOT NULL
                  CHECK (event_type IN (
                    'created', 'assigned', 'status_changed', 'due_date_changed',
                    'commented', 'completed', 'cancelled', 'linked', 'notification_sent'
                  )),
  before_values   jsonb,
  after_values    jsonb
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_created
  ON public.task_events (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_events_org_created
  ON public.task_events (org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Grant lifecycle model — canonical table is public.grants (was grant_details)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grants (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portfolio_id         uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id           uuid NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,

  lifecycle_stage      text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_stage IN (
      'draft', 'prospect', 'invited', 'application_received',
      'due_diligence', 'recommended', 'approved', 'agreement',
      'active', 'renewal_review', 'closeout', 'closed',
      'declined', 'cancelled'
    )),

  grant_type           text,
  requested_amount     numeric(20,4),
  approved_amount      numeric(20,4),
  currency             text NOT NULL DEFAULT 'USD',
  grant_period_start   date,
  grant_period_end     date,
  renewal_eligible     boolean NOT NULL DEFAULT false,
  renewal_date         date,
  deliverables         text,
  reporting_frequency  text,
  next_report_due      date,
  purpose              text,
  internal_owner_id    uuid REFERENCES auth.users(id),
  risk_level           text CHECK (risk_level IN ('low', 'medium', 'high')),
  qb_exported_at       timestamptz,
  qb_journal_entry_id  text,
  deleted_at           timestamptz,

  UNIQUE (holding_id)
);

CREATE INDEX IF NOT EXISTS idx_grants_org
  ON public.grants (org_id);
CREATE INDEX IF NOT EXISTS idx_grants_portfolio
  ON public.grants (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_grants_holding
  ON public.grants (holding_id);
CREATE INDEX IF NOT EXISTS idx_grants_stage
  ON public.grants (lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_grants_next_report
  ON public.grants (next_report_due)
  WHERE next_report_due IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_grants_renewal
  ON public.grants (renewal_date)
  WHERE renewal_eligible = true AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_grants_updated_at ON public.grants;
CREATE TRIGGER trg_grants_updated_at
  BEFORE UPDATE ON public.grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.grant_reports (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  grant_id              uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  report_type           text NOT NULL DEFAULT 'progress',
  report_date           date,
  due_date              date,
  received_at           timestamptz,
  report_period_start   date,
  report_period_end     date,
  submitted_date        date,
  document_url          text,
  content               text,
  attachments           jsonb,
  notes                 text
);

CREATE INDEX IF NOT EXISTS idx_grant_reports_grant
  ON public.grant_reports (grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_reports_due
  ON public.grant_reports (due_date)
  WHERE submitted_date IS NULL AND received_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_grant_reports_submitted
  ON public.grant_reports (submitted_date DESC)
  WHERE submitted_date IS NOT NULL;

DROP TRIGGER IF EXISTS trg_grant_reports_updated_at ON public.grant_reports;
CREATE TRIGGER trg_grant_reports_updated_at
  BEFORE UPDATE ON public.grant_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.grant_milestones (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  grant_id        uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  milestone_name  text NOT NULL,
  description     text,
  due_date        date,
  completed_date  date,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  notes           text,

  CHECK (
    (status = 'completed' AND completed_date IS NOT NULL)
    OR (status <> 'completed')
  )
);

CREATE INDEX IF NOT EXISTS idx_grant_milestones_grant
  ON public.grant_milestones (grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_milestones_status
  ON public.grant_milestones (status);
CREATE INDEX IF NOT EXISTS idx_grant_milestones_due
  ON public.grant_milestones (due_date)
  WHERE due_date IS NOT NULL;

DROP TRIGGER IF EXISTS trg_grant_milestones_updated_at ON public.grant_milestones;
CREATE TRIGGER trg_grant_milestones_updated_at
  BEFORE UPDATE ON public.grant_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomically apply a milestone patch and settle any generated tasks that use
-- the milestone source-key prefix. This is service-only so product callers
-- must enter through the scoped grant repository after proving portfolio
-- access; no browser/session caller can invoke the elevated task-event write.
CREATE OR REPLACE FUNCTION public.update_grant_milestone_with_task_sync(
  p_expected_org_id uuid,
  p_expected_portfolio_id uuid,
  p_expected_holding_id uuid,
  p_milestone_id uuid,
  p_actor_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_milestone public.grant_milestones%ROWTYPE;
  v_now timestamptz := now();
  v_task_status text;
  v_reason text;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Milestone patch must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF p_patch - ARRAY[
    'milestone_name', 'description', 'due_date', 'completed_date', 'status', 'notes'
  ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Milestone patch contains unsupported fields'
      USING ERRCODE = '22023';
  END IF;

  SELECT gm.*
  INTO v_milestone
  FROM public.grant_milestones gm
  JOIN public.grants g ON g.id = gm.grant_id
  WHERE gm.id = p_milestone_id
    AND g.org_id = p_expected_org_id
    AND g.portfolio_id = p_expected_portfolio_id
    AND g.holding_id = p_expected_holding_id
    AND g.deleted_at IS NULL
  FOR UPDATE OF gm;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Milestone not found in the expected grant scope'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.grant_milestones
  SET
    milestone_name = CASE
      WHEN p_patch ? 'milestone_name' THEN p_patch ->> 'milestone_name'
      ELSE milestone_name
    END,
    description = CASE
      WHEN p_patch ? 'description' THEN p_patch ->> 'description'
      ELSE description
    END,
    due_date = CASE
      WHEN p_patch ? 'due_date' THEN (p_patch ->> 'due_date')::date
      ELSE due_date
    END,
    status = CASE
      WHEN p_patch ? 'status' THEN p_patch ->> 'status'
      ELSE status
    END,
    completed_date = CASE
      WHEN p_patch ? 'completed_date' THEN (p_patch ->> 'completed_date')::date
      WHEN p_patch ->> 'status' = 'completed' AND completed_date IS NULL THEN v_now::date
      ELSE completed_date
    END,
    notes = CASE
      WHEN p_patch ? 'notes' THEN p_patch ->> 'notes'
      ELSE notes
    END
  WHERE id = p_milestone_id
  RETURNING * INTO v_milestone;

  IF p_patch ->> 'status' IN ('completed', 'cancelled') THEN
    v_task_status := CASE
      WHEN p_patch ->> 'status' = 'completed' THEN 'completed'
      ELSE 'cancelled'
    END;
    v_reason := CASE
      WHEN v_task_status = 'completed' THEN 'Milestone marked completed'
      ELSE 'Milestone cancelled'
    END;

    WITH settled_tasks AS (
      UPDATE public.tasks
      SET
        status = v_task_status,
        completed_at = CASE
          WHEN v_task_status = 'completed' THEN v_now
          ELSE completed_at
        END,
        metadata = metadata || CASE
          WHEN v_task_status = 'completed' THEN jsonb_build_object(
            'completed_by_automation', true,
            'completion_reason', v_reason
          )
          ELSE jsonb_build_object('cancel_reason', v_reason)
        END
      WHERE org_id = p_expected_org_id
        AND source = 'automation'
        AND status IN ('open', 'in_progress', 'blocked', 'waiting')
        AND deleted_at IS NULL
        AND source_key LIKE ('grant_milestone:' || p_milestone_id::text || ':%')
      RETURNING id
    )
    INSERT INTO public.task_events (
      task_id,
      org_id,
      actor_id,
      event_type,
      after_values
    )
    SELECT
      id,
      p_expected_org_id,
      p_actor_id,
      v_task_status,
      CASE
        WHEN v_task_status = 'completed' THEN jsonb_build_object(
          'reason', v_reason,
          'completed_by_automation', true
        )
        ELSE jsonb_build_object('cancel_reason', v_reason)
      END
    FROM settled_tasks;
  END IF;

  RETURN to_jsonb(v_milestone);
END;
$$;

REVOKE ALL ON FUNCTION public.update_grant_milestone_with_task_sync(
  uuid, uuid, uuid, uuid, uuid, jsonb
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.update_grant_milestone_with_task_sync(
  uuid, uuid, uuid, uuid, uuid, jsonb
) TO service_role;

CREATE TABLE IF NOT EXISTS public.grant_payments (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  grant_id          uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  payment_number    int NOT NULL DEFAULT 1,
  payment_type      text NOT NULL DEFAULT 'grant_disbursement',
  amount            numeric(20,4) NOT NULL CHECK (amount >= 0),
  scheduled_date    date,
  actual_date       date,
  paid_date         date,
  status            text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'approved', 'processing', 'completed', 'cancelled', 'returned')),
  payment_method    text,
  reference_number  text,
  conditions_met    boolean NOT NULL DEFAULT false,
  condition_notes   text,
  notes             text,

  -- Payment numbers are per-grant and user visible. The uniqueness is enforced
  -- here so a racing allocation fails loudly instead of silently producing two
  -- "Payment #3" rows that no later read can tell apart.
  UNIQUE (grant_id, payment_number)
);

CREATE INDEX IF NOT EXISTS idx_grant_payments_grant
  ON public.grant_payments (grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_payments_scheduled
  ON public.grant_payments (scheduled_date)
  WHERE status IN ('scheduled', 'approved', 'processing');

CREATE OR REPLACE FUNCTION public.enforce_grant_payment_approved_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_approved_amount numeric(20,4);
  v_total_payments numeric(20,4);
BEGIN
  IF NEW.status IN ('cancelled', 'returned') THEN
    RETURN NEW;
  END IF;

  SELECT approved_amount
  INTO v_approved_amount
  FROM public.grants
  WHERE id = NEW.grant_id
  FOR UPDATE;

  IF v_approved_amount IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_payments
  FROM public.grant_payments
  WHERE grant_id = NEW.grant_id
    AND status NOT IN ('cancelled', 'returned')
    AND id IS DISTINCT FROM NEW.id;

  v_total_payments := v_total_payments + COALESCE(NEW.amount, 0);

  IF v_total_payments > v_approved_amount THEN
    RAISE EXCEPTION 'Grant payments would exceed approved amount'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_payments_approved_amount ON public.grant_payments;
CREATE TRIGGER trg_grant_payments_approved_amount
  BEFORE INSERT OR UPDATE OF amount, status, grant_id ON public.grant_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_grant_payment_approved_amount();

DROP TRIGGER IF EXISTS trg_grant_payments_updated_at ON public.grant_payments;
CREATE TRIGGER trg_grant_payments_updated_at
  BEFORE UPDATE ON public.grant_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Scope check, payment-number allocation and insert in one transaction. Doing
-- the allocation in application code meant two callers could read the same
-- MAX(payment_number) and both insert the next value.
CREATE OR REPLACE FUNCTION public.create_grant_payment(
  p_org_id uuid,
  p_portfolio_id uuid,
  p_grant_id uuid,
  p_amount numeric,
  p_scheduled_date date DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant_id uuid;
  v_payment public.grant_payments%ROWTYPE;
BEGIN
  -- Serialize per grant so the number allocation below cannot interleave.
  PERFORM pg_advisory_xact_lock(hashtext(p_grant_id::text));

  SELECT id INTO v_grant_id
  FROM public.grants
  WHERE id = p_grant_id
    AND org_id = p_org_id
    AND portfolio_id = p_portfolio_id
    AND deleted_at IS NULL;
  IF v_grant_id IS NULL THEN
    RAISE EXCEPTION 'Grant not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.grant_payments (
    grant_id, payment_number, amount, scheduled_date, payment_method, notes, status
  )
  SELECT
    p_grant_id,
    COALESCE(MAX(payment_number), 0) + 1,
    p_amount,
    p_scheduled_date,
    p_payment_method,
    p_notes,
    'scheduled'
  FROM public.grant_payments
  WHERE grant_id = p_grant_id
  RETURNING * INTO v_payment;

  RETURN to_jsonb(v_payment);
END;
$$;

REVOKE ALL ON FUNCTION public.create_grant_payment(
  uuid, uuid, uuid, numeric, date, text, text
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_grant_payment(
  uuid, uuid, uuid, numeric, date, text, text
) TO service_role;

CREATE TABLE IF NOT EXISTS public.qualifying_distributions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  portfolio_id        uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  grant_id            uuid REFERENCES public.grants(id) ON DELETE SET NULL,
  grant_payment_id    uuid REFERENCES public.grant_payments(id) ON DELETE SET NULL,
  tax_year            integer NOT NULL,
  distribution_date   date NOT NULL,
  qualifying_amount   numeric(15,2) NOT NULL CHECK (qualifying_amount > 0),
  distribution_type   text CHECK (distribution_type IN (
                         'grant', 'program_expense', 'asset_purchase',
                         'set_aside', 'other'
                       )),
  description         text,
  notes               text
);

CREATE INDEX IF NOT EXISTS idx_qualifying_distributions_portfolio_id
  ON public.qualifying_distributions (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_qualifying_distributions_tax_year
  ON public.qualifying_distributions (portfolio_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_qualifying_distributions_grant_payment
  ON public.qualifying_distributions (grant_payment_id)
  WHERE grant_payment_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_qualifying_distributions_updated_at ON public.qualifying_distributions;
CREATE TRIGGER trg_qualifying_distributions_updated_at
  BEFORE UPDATE ON public.qualifying_distributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.expenditure_responsibility_grants (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  portfolio_id                uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  grant_id                    uuid NOT NULL UNIQUE REFERENCES public.grants(id) ON DELETE CASCADE,

  grantee_ein                 text,
  grantee_is_public_charity   boolean NOT NULL DEFAULT false,
  grantee_501c3_verified      boolean NOT NULL DEFAULT false,
  grantee_501c3_verified_at   date,

  er_agreement_signed_date    date,
  er_agreement_url            text,

  er_reports_required         boolean NOT NULL DEFAULT true,
  er_report_frequency         text CHECK (er_report_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual')),
  er_reports_required_count   integer NOT NULL DEFAULT 0,
  er_reports_received_count   integer NOT NULL DEFAULT 0,

  terminal_report_required    boolean NOT NULL DEFAULT true,
  terminal_report_received    boolean NOT NULL DEFAULT false,
  terminal_report_date        date,

  er_status                   text NOT NULL DEFAULT 'pending_agreement'
                              CHECK (er_status IN (
                                'pending_agreement', 'active', 'reporting_overdue',
                                'completed', 'terminated'
                              )),
  notes                       text
);

CREATE INDEX IF NOT EXISTS idx_er_grants_portfolio_id
  ON public.expenditure_responsibility_grants (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_er_grants_status
  ON public.expenditure_responsibility_grants (portfolio_id, er_status);

DROP TRIGGER IF EXISTS trg_er_grants_updated_at ON public.expenditure_responsibility_grants;
CREATE TRIGGER trg_er_grants_updated_at
  BEFORE UPDATE ON public.expenditure_responsibility_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.grant_budget_items (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  grant_id         uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  category         text NOT NULL,
  description      text NOT NULL,
  budgeted_amount  numeric(20,4) NOT NULL CHECK (budgeted_amount >= 0),
  actual_amount    numeric(20,4) CHECK (actual_amount IS NULL OR actual_amount >= 0),
  notes            text
);

CREATE INDEX IF NOT EXISTS idx_grant_budget_items_grant
  ON public.grant_budget_items (grant_id);

DROP TRIGGER IF EXISTS trg_grant_budget_items_updated_at ON public.grant_budget_items;
CREATE TRIGGER trg_grant_budget_items_updated_at
  BEFORE UPDATE ON public.grant_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.grant_communications (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  grant_id            uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  direction           text NOT NULL DEFAULT 'outbound'
                      CHECK (direction IN ('inbound', 'outbound', 'internal')),
  comm_type           text NOT NULL DEFAULT 'email',
  subject             text,
  summary             text NOT NULL,
  full_content        text,
  contact_name        text,
  contact_email       text,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  follow_up_required  boolean NOT NULL DEFAULT false,
  follow_up_date      date,
  follow_up_notes     text,
  tags                text[] NOT NULL DEFAULT '{}'::text[]
);

CREATE INDEX IF NOT EXISTS idx_grant_communications_grant
  ON public.grant_communications (grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_communications_follow_up
  ON public.grant_communications (follow_up_date)
  WHERE follow_up_required = true;

DROP TRIGGER IF EXISTS trg_grant_communications_updated_at ON public.grant_communications;
CREATE TRIGGER trg_grant_communications_updated_at
  BEFORE UPDATE ON public.grant_communications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.grant_documents (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  grant_id       uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  document_type  text NOT NULL DEFAULT 'proposal',
  file_name      text NOT NULL,
  file_size      bigint NOT NULL DEFAULT 0,
  mime_type      text,
  storage_path   text NOT NULL,
  uploaded_by    uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_grant_documents_grant
  ON public.grant_documents (grant_id);

DROP TRIGGER IF EXISTS trg_grant_documents_updated_at ON public.grant_documents;
CREATE TRIGGER trg_grant_documents_updated_at
  BEFORE UPDATE ON public.grant_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.grant_contacts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  grant_id      uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  email         text,
  phone         text,
  role          text,
  organization  text,
  is_primary    boolean NOT NULL DEFAULT false,
  notes         text
);

CREATE INDEX IF NOT EXISTS idx_grant_contacts_grant
  ON public.grant_contacts (grant_id);

DROP TRIGGER IF EXISTS trg_grant_contacts_updated_at ON public.grant_contacts;
CREATE TRIGGER trg_grant_contacts_updated_at
  BEFORE UPDATE ON public.grant_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.reminders (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portfolio_id  uuid REFERENCES public.portfolios(id) ON DELETE CASCADE,
  task_id       uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  grant_id      uuid REFERENCES public.grants(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  due_at        timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'dismissed', 'cancelled')),
  channel       text NOT NULL DEFAULT 'in_app'
                CHECK (channel IN ('in_app', 'email', 'digest')),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_reminders_org_due
  ON public.reminders (org_id, status, due_at);

DROP TRIGGER IF EXISTS trg_reminders_updated_at ON public.reminders;
CREATE TRIGGER trg_reminders_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Workflow templates and instances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id         uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name           text NOT NULL,
  workflow_type  text NOT NULL,
  description    text,
  is_system      boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  steps          jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_org_type
  ON public.workflow_templates (org_id, workflow_type)
  WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_templates_system_name
  ON public.workflow_templates (name)
  WHERE org_id IS NULL AND is_system = true;

DROP TRIGGER IF EXISTS trg_workflow_templates_updated_at ON public.workflow_templates;
CREATE TRIGGER trg_workflow_templates_updated_at
  BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.workflow_instances (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portfolio_id   uuid REFERENCES public.portfolios(id) ON DELETE CASCADE,
  template_id    uuid REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  grant_id       uuid REFERENCES public.grants(id) ON DELETE CASCADE,

  name           text NOT NULL,
  workflow_type  text NOT NULL DEFAULT 'custom',
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  due_date       date,
  due_at         timestamptz,
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  created_by     uuid REFERENCES auth.users(id),
  notes          text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_org_status
  ON public.workflow_instances (org_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_portfolio
  ON public.workflow_instances (portfolio_id, status)
  WHERE portfolio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_instances_grant
  ON public.workflow_instances (grant_id)
  WHERE grant_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_workflow_instances_updated_at ON public.workflow_instances;
CREATE TRIGGER trg_workflow_instances_updated_at
  BEFORE UPDATE ON public.workflow_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.workflow_tasks (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  workflow_id          uuid NOT NULL REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  task_id              uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  step_id              text,
  name                 text NOT NULL,
  description          text,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),
  is_required          boolean NOT NULL DEFAULT true,
  sequence_order       int NOT NULL DEFAULT 1,
  due_date             date,
  completed_at         timestamptz,
  completed_by         uuid REFERENCES auth.users(id),
  depends_on_task_id   uuid REFERENCES public.workflow_tasks(id) ON DELETE SET NULL,
  outcome              text CHECK (outcome IS NULL OR outcome IN ('pass', 'fail', 'conditional', 'n/a')),
  outcome_notes        text
);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_workflow_order
  ON public.workflow_tasks (workflow_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_task
  ON public.workflow_tasks (task_id)
  WHERE task_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_workflow_tasks_updated_at ON public.workflow_tasks;
CREATE TRIGGER trg_workflow_tasks_updated_at
  BEFORE UPDATE ON public.workflow_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Durable handoff for completion-triggered configurable automations. The task
-- mutation and this row commit together; a worker may safely retry the event
-- after a process crash because each event is keyed to one task audit row.
CREATE TABLE IF NOT EXISTS public.task_automation_outbox (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  available_at    timestamptz NOT NULL DEFAULT now(),
  claimed_at      timestamptz,
  completed_at    timestamptz,
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_event_id   uuid NOT NULL UNIQUE REFERENCES public.task_events(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type      text NOT NULL CHECK (event_type IN ('task_completed')),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts        int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error      text
);

CREATE INDEX IF NOT EXISTS idx_task_automation_outbox_ready
  ON public.task_automation_outbox (available_at, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_task_automation_outbox_stale
  ON public.task_automation_outbox (claimed_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_task_automation_outbox_org_created
  ON public.task_automation_outbox (org_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_task_automation_outbox_updated_at
  ON public.task_automation_outbox;
CREATE TRIGGER trg_task_automation_outbox_updated_at
  BEFORE UPDATE ON public.task_automation_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.task_automation_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_automation_outbox: org admins read"
  ON public.task_automation_outbox FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY "task_automation_outbox: service role"
  ON public.task_automation_outbox FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.task_automation_outbox TO authenticated;
GRANT ALL ON public.task_automation_outbox TO service_role;

-- Atomically synchronize one workflow step with its linked platform task,
-- audit event, and parent workflow completion state. The function remains
-- service-only: callers must enter through the scoped workflow repository.
CREATE OR REPLACE FUNCTION public.update_workflow_task_with_linked_task(
  p_expected_org_id uuid,
  p_workflow_id uuid,
  p_workflow_task_id uuid,
  p_actor_id uuid,
  p_is_workspace_manager boolean,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow public.workflow_instances%ROWTYPE;
  v_workflow_task public.workflow_tasks%ROWTYPE;
  v_linked_task public.tasks%ROWTYPE;
  v_has_linked_task boolean := false;
  v_now timestamptz := now();
  v_task_status text;
  v_before_task jsonb;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Workflow task actor is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION 'Workflow task updates must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF p_updates - ARRAY['status', 'outcome', 'outcome_notes'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Workflow task updates contain unsupported fields'
      USING ERRCODE = '22023';
  END IF;

  IF p_updates ? 'status'
     AND (jsonb_typeof(p_updates -> 'status') <> 'string'
       OR p_updates ->> 'status' NOT IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked')) THEN
    RAISE EXCEPTION 'Invalid workflow task status'
      USING ERRCODE = '22023';
  END IF;

  IF p_updates ? 'outcome'
     AND jsonb_typeof(p_updates -> 'outcome') <> 'null'
     AND (jsonb_typeof(p_updates -> 'outcome') <> 'string'
       OR p_updates ->> 'outcome' NOT IN ('pass', 'fail', 'conditional', 'n/a')) THEN
    RAISE EXCEPTION 'Invalid workflow task outcome'
      USING ERRCODE = '22023';
  END IF;

  IF p_updates ? 'outcome_notes'
     AND jsonb_typeof(p_updates -> 'outcome_notes') NOT IN ('null', 'string') THEN
    RAISE EXCEPTION 'Invalid workflow task outcome notes'
      USING ERRCODE = '22023';
  END IF;

  IF length(p_updates ->> 'outcome_notes') > 4000 THEN
    RAISE EXCEPTION 'Workflow task outcome notes are too long'
      USING ERRCODE = '22023';
  END IF;

  -- Lock the parent first so concurrent last-step completions serialize and
  -- cannot both observe another required step as unfinished.
  SELECT wi.*
  INTO v_workflow
  FROM public.workflow_instances wi
  WHERE wi.id = p_workflow_id
    AND wi.org_id = p_expected_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow task not found in the expected organization'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT wt.*
  INTO v_workflow_task
  FROM public.workflow_tasks wt
  WHERE wt.id = p_workflow_task_id
    AND wt.workflow_id = p_workflow_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow task not found in the expected workflow'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_workflow_task.task_id IS NOT NULL THEN
    SELECT t.*
    INTO v_linked_task
    FROM public.tasks t
    WHERE t.id = v_workflow_task.task_id
      AND t.org_id = p_expected_org_id
      AND t.deleted_at IS NULL
    FOR UPDATE;
    v_has_linked_task := FOUND;

    IF NOT v_has_linked_task THEN
      RAISE EXCEPTION 'Linked task not found in the expected organization'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF NOT COALESCE(p_is_workspace_manager, false)
     AND (NOT v_has_linked_task OR v_linked_task.assigned_to IS DISTINCT FROM p_actor_id) THEN
    RAISE EXCEPTION 'Not authorized to update this workflow task'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workflow_tasks
  SET
    status = CASE
      WHEN p_updates ? 'status' THEN p_updates ->> 'status'
      ELSE status
    END,
    outcome = CASE
      WHEN p_updates ? 'outcome' THEN p_updates ->> 'outcome'
      ELSE outcome
    END,
    outcome_notes = CASE
      WHEN p_updates ? 'outcome_notes' THEN p_updates ->> 'outcome_notes'
      ELSE outcome_notes
    END,
    completed_at = CASE
      WHEN p_updates ->> 'status' = 'completed' THEN v_now
      WHEN p_updates ? 'status' THEN NULL
      ELSE completed_at
    END,
    completed_by = CASE
      WHEN p_updates ->> 'status' = 'completed' THEN p_actor_id
      WHEN p_updates ? 'status' THEN NULL
      ELSE completed_by
    END
  WHERE id = p_workflow_task_id
  RETURNING * INTO v_workflow_task;

  IF v_has_linked_task AND p_updates ? 'status' THEN
    v_before_task := to_jsonb(v_linked_task);
    v_task_status := CASE p_updates ->> 'status'
      WHEN 'completed' THEN 'completed'
      WHEN 'skipped' THEN 'cancelled'
      WHEN 'blocked' THEN 'blocked'
      WHEN 'in_progress' THEN 'in_progress'
      ELSE 'open'
    END;

    UPDATE public.tasks
    SET
      status = v_task_status,
      completed_at = CASE WHEN v_task_status = 'completed' THEN v_now ELSE NULL END,
      completed_by = CASE WHEN v_task_status = 'completed' THEN p_actor_id ELSE NULL END
    WHERE id = v_workflow_task.task_id
      AND org_id = p_expected_org_id
      AND deleted_at IS NULL
    RETURNING * INTO v_linked_task;

    INSERT INTO public.task_events (
      task_id,
      org_id,
      actor_id,
      event_type,
      before_values,
      after_values
    ) VALUES (
      v_linked_task.id,
      p_expected_org_id,
      p_actor_id,
      CASE WHEN v_task_status = 'completed' THEN 'completed' ELSE 'status_changed' END,
      v_before_task,
      to_jsonb(v_linked_task)
    );
  END IF;

  IF p_updates ->> 'status' IN ('completed', 'skipped')
     AND NOT EXISTS (
       SELECT 1
       FROM public.workflow_tasks wt
       WHERE wt.workflow_id = p_workflow_id
         AND wt.is_required = true
         AND wt.status NOT IN ('completed', 'skipped')
     ) THEN
    UPDATE public.workflow_instances
    SET status = 'completed', completed_at = v_now
    WHERE id = p_workflow_id
      AND org_id = p_expected_org_id;
  END IF;

  RETURN to_jsonb(v_workflow_task);
END;
$$;

REVOKE ALL ON FUNCTION public.update_workflow_task_with_linked_task(
  uuid, uuid, uuid, uuid, boolean, jsonb
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.update_workflow_task_with_linked_task(
  uuid, uuid, uuid, uuid, boolean, jsonb
) TO service_role;

-- Resolve every sanctioned task link type against the canonical organization
-- key. Kept private so only the task transaction functions can use it.
CREATE OR REPLACE FUNCTION public.task_entity_belongs_to_org(
  p_org_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN CASE p_entity_type
    WHEN 'filing' THEN EXISTS (
      SELECT 1 FROM public.filing_calendar WHERE id = p_entity_id AND org_id = p_org_id
    )
    WHEN 'state_registration' THEN EXISTS (
      SELECT 1 FROM public.state_registrations WHERE id = p_entity_id AND org_id = p_org_id
    )
    WHEN 'pledge_installment' THEN EXISTS (
      SELECT 1 FROM public.pledge_installments WHERE id = p_entity_id AND org_id = p_org_id
    )
    WHEN 'pledge' THEN EXISTS (
      SELECT 1 FROM public.pledges WHERE id = p_entity_id AND org_id = p_org_id
    )
    WHEN 'donor' THEN EXISTS (
      SELECT 1 FROM public.donors WHERE id = p_entity_id AND org_id = p_org_id
    )
    WHEN 'grant_milestone' THEN EXISTS (
      SELECT 1
      FROM public.grant_milestones gm
      JOIN public.grants g ON g.id = gm.grant_id
      WHERE gm.id = p_entity_id AND g.org_id = p_org_id
    )
    WHEN 'grant_report' THEN EXISTS (
      SELECT 1
      FROM public.grant_reports gr
      JOIN public.grants g ON g.id = gr.grant_id
      WHERE gr.id = p_entity_id AND g.org_id = p_org_id
    )
    WHEN 'grant_payment' THEN EXISTS (
      SELECT 1
      FROM public.grant_payments gp
      JOIN public.grants g ON g.id = gp.grant_id
      WHERE gp.id = p_entity_id AND g.org_id = p_org_id
    )
    WHEN 'grant' THEN EXISTS (
      SELECT 1 FROM public.grants WHERE id = p_entity_id AND org_id = p_org_id
    )
    WHEN 'holding' THEN EXISTS (
      SELECT 1 FROM public.holdings WHERE id = p_entity_id AND org_id = p_org_id
    )
    WHEN 'portfolio' THEN EXISTS (
      SELECT 1 FROM public.portfolios WHERE id = p_entity_id AND org_id = p_org_id
    )
    WHEN 'import_job' THEN EXISTS (
      SELECT 1 FROM public.import_jobs WHERE id = p_entity_id AND org_id = p_org_id
    )
    WHEN 'workflow_instance' THEN EXISTS (
      SELECT 1 FROM public.workflow_instances WHERE id = p_entity_id AND org_id = p_org_id
    )
    ELSE false
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.task_entity_belongs_to_org(uuid, text, uuid)
  FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_task_completion_automation(
  p_task public.tasks,
  p_task_event_id uuid,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox_id uuid;
BEGIN
  INSERT INTO public.task_automation_outbox (
    org_id,
    task_id,
    task_event_id,
    actor_id,
    event_type,
    payload
  ) VALUES (
    p_task.org_id,
    p_task.id,
    p_task_event_id,
    p_actor_id,
    'task_completed',
    jsonb_build_object(
      'actor_id', p_actor_id,
      'task_type', p_task.task_type,
      'assigned_to', p_task.assigned_to,
      'task_snapshot', to_jsonb(p_task)
    )
  )
  RETURNING id INTO v_outbox_id;

  RETURN v_outbox_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_task_completion_automation(
  public.tasks, uuid, uuid
) FROM PUBLIC, authenticated;

-- Create or refresh one automation-owned task, its links, and its audit events
-- atomically. The advisory lock closes the absent-row race on (org, source_key).
CREATE OR REPLACE FUNCTION public.upsert_generated_task(
  p_org_id uuid,
  p_task jsonb,
  p_entity_links jsonb DEFAULT '[]'::jsonb,
  p_reopen_resolved boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.tasks%ROWTYPE;
  v_task public.tasks%ROWTYPE;
  v_link jsonb;
  v_source_key text;
  v_portfolio_id uuid;
  v_assigned_to uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_metadata jsonb;
  v_now timestamptz := now();
BEGIN
  IF p_org_id IS NULL OR p_task IS NULL OR jsonb_typeof(p_task) <> 'object' THEN
    RAISE EXCEPTION 'Generated task organization and task are required'
      USING ERRCODE = '22023';
  END IF;
  IF p_task - ARRAY[
    'title', 'description', 'priority', 'task_type', 'source_key',
    'portfolio_id', 'due_at', 'assigned_to', 'metadata'
  ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Generated task contains unsupported fields'
      USING ERRCODE = '22023';
  END IF;
  IF p_entity_links IS NULL OR jsonb_typeof(p_entity_links) <> 'array'
     OR jsonb_array_length(p_entity_links) > 8 THEN
    RAISE EXCEPTION 'Generated task entity links must be an array of at most 8 items'
      USING ERRCODE = '22023';
  END IF;

  v_source_key := nullif(btrim(p_task ->> 'source_key'), '');
  IF v_source_key IS NULL OR nullif(btrim(p_task ->> 'title'), '') IS NULL THEN
    RAISE EXCEPTION 'Generated task source key and title are required'
      USING ERRCODE = '22023';
  END IF;

  v_portfolio_id := (p_task ->> 'portfolio_id')::uuid;
  IF v_portfolio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE id = v_portfolio_id AND org_id = p_org_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Portfolio does not belong to this organization'
      USING ERRCODE = '22023';
  END IF;

  v_assigned_to := (p_task ->> 'assigned_to')::uuid;
  IF v_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org_id
      AND user_id = v_assigned_to
      AND deleted_at IS NULL
      AND accepted_at IS NOT NULL
  ) THEN
    v_assigned_to := NULL;
  END IF;

  FOR v_link IN SELECT value FROM jsonb_array_elements(p_entity_links)
  LOOP
    IF jsonb_typeof(v_link) <> 'object'
       OR NOT (v_link ? 'entity_type')
       OR NOT (v_link ? 'entity_id') THEN
      RAISE EXCEPTION 'Invalid generated task entity link' USING ERRCODE = '22023';
    END IF;
    v_entity_type := v_link ->> 'entity_type';
    v_entity_id := (v_link ->> 'entity_id')::uuid;
    IF NOT public.task_entity_belongs_to_org(p_org_id, v_entity_type, v_entity_id) THEN
      RAISE EXCEPTION 'Linked % does not belong to this organization', v_entity_type
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_org_id::text || ':' || v_source_key, 0)
  );

  SELECT * INTO v_existing
  FROM public.tasks
  WHERE org_id = p_org_id
    AND source_key = v_source_key
    AND deleted_at IS NULL
  FOR UPDATE;

  v_metadata := COALESCE(p_task -> 'metadata', '{}'::jsonb)
    || jsonb_build_object('generated_at', v_now);

  IF v_existing.id IS NULL THEN
    INSERT INTO public.tasks (
      org_id, portfolio_id, title, description, status, priority, task_type,
      source, source_key, due_at, assigned_to, metadata
    ) VALUES (
      p_org_id,
      v_portfolio_id,
      p_task ->> 'title',
      p_task ->> 'description',
      'open',
      COALESCE(p_task ->> 'priority', 'normal'),
      COALESCE(p_task ->> 'task_type', 'task'),
      'automation',
      v_source_key,
      (p_task ->> 'due_at')::timestamptz,
      v_assigned_to,
      v_metadata
    )
    RETURNING * INTO v_task;

    INSERT INTO public.task_entity_links (
      task_id, org_id, entity_type, entity_id, relationship
    )
    SELECT
      v_task.id,
      p_org_id,
      value ->> 'entity_type',
      (value ->> 'entity_id')::uuid,
      COALESCE(value ->> 'relationship', 'primary')
    FROM jsonb_array_elements(p_entity_links);

    INSERT INTO public.task_events (
      task_id, org_id, event_type, after_values
    ) VALUES (
      v_task.id,
      p_org_id,
      'created',
      jsonb_build_object(
        'source_key', v_source_key,
        'producer', v_metadata ->> 'producer'
      )
    );

    RETURN 'created';
  END IF;

  IF v_existing.status IN ('completed', 'cancelled')
     AND NOT COALESCE(p_reopen_resolved, false) THEN
    RETURN 'skipped';
  END IF;

  UPDATE public.tasks
  SET
    portfolio_id = v_portfolio_id,
    title = p_task ->> 'title',
    description = p_task ->> 'description',
    priority = COALESCE(p_task ->> 'priority', priority),
    task_type = COALESCE(p_task ->> 'task_type', task_type),
    due_at = (p_task ->> 'due_at')::timestamptz,
    assigned_to = v_assigned_to,
    metadata = COALESCE(v_existing.metadata, '{}'::jsonb) || v_metadata
  WHERE id = v_existing.id
  RETURNING * INTO v_task;

  IF v_existing.due_at IS DISTINCT FROM v_task.due_at THEN
    INSERT INTO public.task_events (
      task_id, org_id, event_type, before_values, after_values
    ) VALUES (
      v_task.id,
      p_org_id,
      'due_date_changed',
      jsonb_build_object('due_at', v_existing.due_at),
      jsonb_build_object('due_at', v_task.due_at)
    );
  END IF;

  IF v_existing.assigned_to IS DISTINCT FROM v_task.assigned_to THEN
    INSERT INTO public.task_events (
      task_id, org_id, event_type, before_values, after_values
    ) VALUES (
      v_task.id,
      p_org_id,
      'assigned',
      jsonb_build_object('assigned_to', v_existing.assigned_to),
      jsonb_build_object('assigned_to', v_task.assigned_to)
    );
  END IF;

  INSERT INTO public.task_entity_links (
    task_id, org_id, entity_type, entity_id, relationship
  )
  SELECT
    v_task.id,
    p_org_id,
    value ->> 'entity_type',
    (value ->> 'entity_id')::uuid,
    COALESCE(value ->> 'relationship', 'primary')
  FROM jsonb_array_elements(p_entity_links) requested
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_entity_links existing_link
    WHERE existing_link.task_id = v_task.id
      AND existing_link.org_id = p_org_id
      AND existing_link.entity_type = requested.value ->> 'entity_type'
      AND existing_link.entity_id = (requested.value ->> 'entity_id')::uuid
  );

  RETURN 'updated';
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_generated_task(uuid, jsonb, jsonb, boolean)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_generated_task(uuid, jsonb, jsonb, boolean)
  TO service_role;

-- Settle all generated tasks selected by one source key in a single database
-- transaction. Completion audit events and their automation outbox entries are
-- committed with the task updates, never as best-effort follow-up writes.
CREATE OR REPLACE FUNCTION public.settle_generated_tasks(
  p_org_id uuid,
  p_source_key text,
  p_match_prefix boolean,
  p_status text,
  p_reason text,
  p_actor_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.tasks%ROWTYPE;
  v_task public.tasks%ROWTYPE;
  v_event_id uuid;
  v_count integer := 0;
  v_now timestamptz := now();
BEGIN
  IF p_org_id IS NULL OR nullif(btrim(p_source_key), '') IS NULL
     OR p_status NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Valid generated task settlement inputs are required'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_match_prefix, false)
     AND length(p_source_key) - length(replace(p_source_key, ':', '')) < 2 THEN
    RAISE EXCEPTION 'Generated task source prefix must contain at least 2 colons'
      USING ERRCODE = '22023';
  END IF;

  FOR v_existing IN
    SELECT *
    FROM public.tasks
    WHERE org_id = p_org_id
      AND source = 'automation'
      AND status IN ('open', 'in_progress', 'blocked', 'waiting')
      AND deleted_at IS NULL
      AND (
        (COALESCE(p_match_prefix, false) AND source_key LIKE p_source_key || '%')
        OR (NOT COALESCE(p_match_prefix, false) AND source_key = p_source_key)
      )
    ORDER BY id
    FOR UPDATE
  LOOP
    UPDATE public.tasks
    SET
      status = p_status,
      completed_at = CASE WHEN p_status = 'completed' THEN v_now ELSE NULL END,
      completed_by = CASE WHEN p_status = 'completed' THEN p_actor_id ELSE NULL END,
      metadata = COALESCE(v_existing.metadata, '{}'::jsonb) || CASE
        WHEN p_status = 'completed' THEN jsonb_build_object(
          'completed_by_automation', true,
          'completion_reason', p_reason
        )
        ELSE jsonb_build_object('cancel_reason', p_reason)
      END
    WHERE id = v_existing.id
    RETURNING * INTO v_task;

    INSERT INTO public.task_events (
      task_id, org_id, actor_id, event_type, before_values, after_values
    ) VALUES (
      v_task.id,
      p_org_id,
      p_actor_id,
      p_status,
      to_jsonb(v_existing),
      to_jsonb(v_task)
    ) RETURNING id INTO v_event_id;

    IF p_status = 'completed' THEN
      PERFORM public.enqueue_task_completion_automation(
        v_task, v_event_id, p_actor_id
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_generated_tasks(
  uuid, text, boolean, text, text, uuid
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_generated_tasks(
  uuid, text, boolean, text, text, uuid
) TO service_role;

-- Create the task, its validated entity links, and its audit event atomically.
CREATE OR REPLACE FUNCTION public.create_task_with_relations(
  p_expected_org_id uuid,
  p_actor_id uuid,
  p_task jsonb,
  p_entity_links jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_link jsonb;
  v_portfolio_id uuid;
  v_assigned_to uuid;
  v_entity_type text;
  v_entity_id uuid;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Task actor is required' USING ERRCODE = '22023';
  END IF;
  IF p_task IS NULL OR jsonb_typeof(p_task) <> 'object' THEN
    RAISE EXCEPTION 'Task must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_task - ARRAY[
    'title', 'description', 'status', 'priority', 'task_type', 'source',
    'source_key', 'portfolio_id', 'starts_at', 'due_at', 'assigned_to', 'metadata'
  ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Task contains unsupported fields' USING ERRCODE = '22023';
  END IF;
  IF p_entity_links IS NULL OR jsonb_typeof(p_entity_links) <> 'array'
     OR jsonb_array_length(p_entity_links) > 8 THEN
    RAISE EXCEPTION 'Task entity links must be an array of at most 8 items'
      USING ERRCODE = '22023';
  END IF;

  v_portfolio_id := (p_task ->> 'portfolio_id')::uuid;
  IF v_portfolio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE id = v_portfolio_id AND org_id = p_expected_org_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Portfolio does not belong to this organization'
      USING ERRCODE = '22023';
  END IF;

  v_assigned_to := (p_task ->> 'assigned_to')::uuid;
  IF v_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_expected_org_id
      AND user_id = v_assigned_to
      AND deleted_at IS NULL
      AND accepted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Assignee is not a member of this organization'
      USING ERRCODE = '22023';
  END IF;

  FOR v_link IN SELECT value FROM jsonb_array_elements(p_entity_links)
  LOOP
    IF jsonb_typeof(v_link) <> 'object'
       OR NOT (v_link ? 'entity_type')
       OR NOT (v_link ? 'entity_id') THEN
      RAISE EXCEPTION 'Invalid task entity link' USING ERRCODE = '22023';
    END IF;
    v_entity_type := v_link ->> 'entity_type';
    v_entity_id := (v_link ->> 'entity_id')::uuid;
    IF NOT public.task_entity_belongs_to_org(
      p_expected_org_id, v_entity_type, v_entity_id
    ) THEN
      RAISE EXCEPTION 'Linked % does not belong to this organization', v_entity_type
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.tasks (
    org_id, portfolio_id, title, description, status, priority, task_type,
    source, source_key, starts_at, due_at, assigned_to, created_by, metadata
  ) VALUES (
    p_expected_org_id,
    v_portfolio_id,
    p_task ->> 'title',
    p_task ->> 'description',
    COALESCE(p_task ->> 'status', 'open'),
    COALESCE(p_task ->> 'priority', 'normal'),
    COALESCE(p_task ->> 'task_type', 'task'),
    COALESCE(p_task ->> 'source', 'manual'),
    p_task ->> 'source_key',
    (p_task ->> 'starts_at')::timestamptz,
    (p_task ->> 'due_at')::timestamptz,
    v_assigned_to,
    p_actor_id,
    COALESCE(p_task -> 'metadata', '{}'::jsonb)
  )
  RETURNING * INTO v_task;

  INSERT INTO public.task_entity_links (
    task_id, org_id, entity_type, entity_id, relationship
  )
  SELECT
    v_task.id,
    p_expected_org_id,
    value ->> 'entity_type',
    (value ->> 'entity_id')::uuid,
    COALESCE(value ->> 'relationship', 'primary')
  FROM jsonb_array_elements(p_entity_links);

  INSERT INTO public.task_events (
    task_id, org_id, actor_id, event_type, after_values
  ) VALUES (
    v_task.id, p_expected_org_id, p_actor_id, 'created', to_jsonb(v_task)
  );

  RETURN to_jsonb(v_task);
END;
$$;

REVOKE ALL ON FUNCTION public.create_task_with_relations(
  uuid, uuid, jsonb, jsonb
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_task_with_relations(
  uuid, uuid, jsonb, jsonb
) TO service_role;

-- Apply an allowlisted task patch and its audit event in one transaction. The
-- role flag is derived by the scoped repository; assignee authorization and
-- organization ownership are re-checked while the row is locked.
CREATE OR REPLACE FUNCTION public.update_task_with_event(
  p_expected_org_id uuid,
  p_task_id uuid,
  p_actor_id uuid,
  p_is_workspace_manager boolean,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.tasks%ROWTYPE;
  v_task public.tasks%ROWTYPE;
  v_patch jsonb;
  v_event_id uuid;
  v_outbox_id uuid;
  v_event_type text;
  v_now timestamptz := now();
  v_portfolio_id uuid;
  v_assigned_to uuid;
  v_milestone_id uuid;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Task actor is required' USING ERRCODE = '22023';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION 'Task updates must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_updates - ARRAY[
    'title', 'description', 'status', 'priority', 'task_type', 'portfolio_id',
    'starts_at', 'due_at', 'assigned_to', 'metadata'
  ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Task updates contain unsupported fields' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.tasks
  WHERE id = p_task_id
    AND org_id = p_expected_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE(p_is_workspace_manager, false)
     AND v_existing.assigned_to IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Not authorized to update this task' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_is_workspace_manager, false) THEN
    v_patch := p_updates;
  ELSE
    v_patch := '{}'::jsonb;
    IF p_updates ? 'status' THEN
      v_patch := v_patch || jsonb_build_object('status', p_updates -> 'status');
    END IF;
    IF p_updates ? 'metadata' THEN
      v_patch := v_patch || jsonb_build_object('metadata', p_updates -> 'metadata');
    END IF;
  END IF;

  IF v_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'No valid fields to update' USING ERRCODE = '22023';
  END IF;

  IF v_patch ? 'portfolio_id' THEN
    v_portfolio_id := (v_patch ->> 'portfolio_id')::uuid;
    IF v_portfolio_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.portfolios
      WHERE id = v_portfolio_id AND org_id = p_expected_org_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Portfolio does not belong to this organization'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_patch ? 'assigned_to' THEN
    v_assigned_to := (v_patch ->> 'assigned_to')::uuid;
    IF v_assigned_to IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = p_expected_org_id
        AND user_id = v_assigned_to
        AND deleted_at IS NULL
        AND accepted_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Assignee is not a member of this organization'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.tasks
  SET
    title = CASE WHEN v_patch ? 'title' THEN v_patch ->> 'title' ELSE title END,
    description = CASE WHEN v_patch ? 'description' THEN v_patch ->> 'description' ELSE description END,
    status = CASE WHEN v_patch ? 'status' THEN v_patch ->> 'status' ELSE status END,
    priority = CASE WHEN v_patch ? 'priority' THEN v_patch ->> 'priority' ELSE priority END,
    task_type = CASE WHEN v_patch ? 'task_type' THEN v_patch ->> 'task_type' ELSE task_type END,
    portfolio_id = CASE WHEN v_patch ? 'portfolio_id' THEN v_portfolio_id ELSE portfolio_id END,
    starts_at = CASE WHEN v_patch ? 'starts_at' THEN (v_patch ->> 'starts_at')::timestamptz ELSE starts_at END,
    due_at = CASE WHEN v_patch ? 'due_at' THEN (v_patch ->> 'due_at')::timestamptz ELSE due_at END,
    assigned_to = CASE WHEN v_patch ? 'assigned_to' THEN v_assigned_to ELSE assigned_to END,
    metadata = CASE WHEN v_patch ? 'metadata' THEN v_patch -> 'metadata' ELSE metadata END,
    completed_at = CASE
      WHEN v_patch ->> 'status' = 'completed' AND v_existing.status <> 'completed' THEN v_now
      WHEN v_patch ->> 'status' = 'completed' THEN completed_at
      WHEN v_patch ? 'status' THEN NULL
      ELSE completed_at
    END,
    completed_by = CASE
      WHEN v_patch ->> 'status' = 'completed' AND v_existing.status <> 'completed' THEN p_actor_id
      WHEN v_patch ->> 'status' = 'completed' THEN completed_by
      WHEN v_patch ? 'status' THEN NULL
      ELSE completed_by
    END
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  IF v_patch ->> 'status' = 'completed'
     AND v_existing.status <> 'completed'
     AND v_task.metadata ->> 'producer' = 'grant_obligations' THEN
    SELECT gm.id INTO v_milestone_id
    FROM public.task_entity_links tel
    JOIN public.grant_milestones gm ON gm.id = tel.entity_id
    JOIN public.grants g ON g.id = gm.grant_id
    WHERE tel.task_id = p_task_id
      AND tel.org_id = p_expected_org_id
      AND tel.entity_type = 'grant_milestone'
      AND g.org_id = p_expected_org_id
    LIMIT 1
    FOR UPDATE OF gm;

    IF v_milestone_id IS NULL AND EXISTS (
      SELECT 1 FROM public.task_entity_links
      WHERE task_id = p_task_id
        AND org_id = p_expected_org_id
        AND entity_type = 'grant_milestone'
    ) THEN
      RAISE EXCEPTION 'Linked grant milestone was not found in this organization';
    END IF;

    IF v_milestone_id IS NOT NULL THEN
      UPDATE public.grant_milestones
      SET status = 'completed', completed_date = v_now::date
      WHERE id = v_milestone_id;
    END IF;
  END IF;

  v_event_type := CASE
    WHEN v_patch ->> 'status' = 'completed' AND v_existing.status <> 'completed' THEN 'completed'
    WHEN v_patch ->> 'status' = 'cancelled' THEN 'cancelled'
    WHEN v_patch ? 'assigned_to' AND v_assigned_to IS NOT NULL THEN 'assigned'
    WHEN (v_patch ? 'due_at' AND v_patch ->> 'due_at' IS NOT NULL)
      OR (v_patch ? 'starts_at' AND v_patch ->> 'starts_at' IS NOT NULL)
      THEN 'due_date_changed'
    ELSE 'status_changed'
  END;

  INSERT INTO public.task_events (
    task_id, org_id, actor_id, event_type, before_values, after_values
  ) VALUES (
    p_task_id, p_expected_org_id, p_actor_id, v_event_type,
    to_jsonb(v_existing), to_jsonb(v_task)
  ) RETURNING id INTO v_event_id;

  IF v_patch ->> 'status' = 'completed' AND v_existing.status <> 'completed' THEN
    v_outbox_id := public.enqueue_task_completion_automation(
      v_task, v_event_id, p_actor_id
    );
  END IF;

  RETURN jsonb_build_object('task', to_jsonb(v_task), 'outbox_event_id', v_outbox_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_task_with_event(
  uuid, uuid, uuid, boolean, jsonb
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.update_task_with_event(
  uuid, uuid, uuid, boolean, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.add_task_comment_with_event(
  p_expected_org_id uuid,
  p_task_id uuid,
  p_actor_id uuid,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment public.task_comments%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_body IS NULL OR length(p_body) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Valid task comment actor and body are required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.tasks
  WHERE id = p_task_id AND org_id = p_expected_org_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.task_comments (task_id, org_id, author_id, body)
  VALUES (p_task_id, p_expected_org_id, p_actor_id, p_body)
  RETURNING * INTO v_comment;

  INSERT INTO public.task_events (
    task_id, org_id, actor_id, event_type, after_values
  ) VALUES (
    p_task_id, p_expected_org_id, p_actor_id, 'commented', to_jsonb(v_comment)
  );

  RETURN to_jsonb(v_comment);
END;
$$;

REVOKE ALL ON FUNCTION public.add_task_comment_with_event(
  uuid, uuid, uuid, text
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.add_task_comment_with_event(
  uuid, uuid, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.set_task_completion_state(
  p_expected_org_id uuid,
  p_task_id uuid,
  p_actor_id uuid,
  p_is_workspace_manager boolean,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.tasks%ROWTYPE;
  v_task public.tasks%ROWTYPE;
  v_milestone_id uuid;
  v_event_id uuid;
  v_outbox_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_actor_id IS NULL OR p_action NOT IN ('complete', 'reopen') THEN
    RAISE EXCEPTION 'Valid task action and actor are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.tasks
  WHERE id = p_task_id
    AND org_id = p_expected_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE(p_is_workspace_manager, false)
     AND v_existing.assigned_to IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Not authorized to change this task' USING ERRCODE = '42501';
  END IF;

  IF (p_action = 'complete' AND v_existing.status = 'completed')
     OR (p_action = 'reopen' AND v_existing.status = 'open') THEN
    RETURN jsonb_build_object(
      'task', to_jsonb(v_existing),
      'idempotent', true,
      'outbox_event_id', NULL
    );
  END IF;

  UPDATE public.tasks
  SET
    status = CASE WHEN p_action = 'complete' THEN 'completed' ELSE 'open' END,
    completed_at = CASE WHEN p_action = 'complete' THEN v_now ELSE NULL END,
    completed_by = CASE WHEN p_action = 'complete' THEN p_actor_id ELSE NULL END
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  IF p_action = 'complete'
     AND v_task.metadata ->> 'producer' = 'grant_obligations' THEN
    SELECT gm.id INTO v_milestone_id
    FROM public.task_entity_links tel
    JOIN public.grant_milestones gm ON gm.id = tel.entity_id
    JOIN public.grants g ON g.id = gm.grant_id
    WHERE tel.task_id = p_task_id
      AND tel.org_id = p_expected_org_id
      AND tel.entity_type = 'grant_milestone'
      AND g.org_id = p_expected_org_id
    LIMIT 1
    FOR UPDATE OF gm;

    IF v_milestone_id IS NULL AND EXISTS (
      SELECT 1 FROM public.task_entity_links
      WHERE task_id = p_task_id
        AND org_id = p_expected_org_id
        AND entity_type = 'grant_milestone'
    ) THEN
      RAISE EXCEPTION 'Linked grant milestone was not found in this organization';
    END IF;

    IF v_milestone_id IS NOT NULL THEN
      UPDATE public.grant_milestones
      SET status = 'completed', completed_date = v_now::date
      WHERE id = v_milestone_id;
    END IF;
  END IF;

  INSERT INTO public.task_events (
    task_id, org_id, actor_id, event_type, before_values, after_values
  ) VALUES (
    p_task_id,
    p_expected_org_id,
    p_actor_id,
    CASE WHEN p_action = 'complete' THEN 'completed' ELSE 'status_changed' END,
    to_jsonb(v_existing),
    to_jsonb(v_task)
  ) RETURNING id INTO v_event_id;

  IF p_action = 'complete' THEN
    v_outbox_id := public.enqueue_task_completion_automation(
      v_task, v_event_id, p_actor_id
    );
  END IF;

  RETURN jsonb_build_object(
    'task', to_jsonb(v_task),
    'idempotent', false,
    'outbox_event_id', v_outbox_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_task_completion_state(
  uuid, uuid, uuid, boolean, text
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_completion_state(
  uuid, uuid, uuid, boolean, text
) TO service_role;

-- Claim and settle outbox rows through service-only worker capabilities.
CREATE OR REPLACE FUNCTION public.claim_task_automation_outbox(
  p_limit int DEFAULT 50,
  p_org_id uuid DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS SETOF public.task_automation_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT id
    FROM public.task_automation_outbox
    WHERE (p_org_id IS NULL OR org_id = p_org_id)
      AND (p_event_id IS NULL OR id = p_event_id)
      AND attempts < 10
      AND (
        (status IN ('pending', 'failed') AND available_at <= now())
        OR (status = 'processing' AND claimed_at < now() - interval '15 minutes')
      )
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 100), 1)
  )
  UPDATE public.task_automation_outbox outbox
  SET status = 'processing', claimed_at = now(), attempts = attempts + 1, last_error = NULL
  FROM candidates
  WHERE outbox.id = candidates.id
  RETURNING outbox.*;
$$;

REVOKE ALL ON FUNCTION public.claim_task_automation_outbox(int, uuid, uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_task_automation_outbox(int, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finish_task_automation_outbox(
  p_event_id uuid,
  p_succeeded boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.task_automation_outbox
  SET
    status = CASE WHEN p_succeeded THEN 'completed' ELSE 'failed' END,
    completed_at = CASE WHEN p_succeeded THEN now() ELSE NULL END,
    claimed_at = NULL,
    last_error = CASE WHEN p_succeeded THEN NULL ELSE left(COALESCE(p_error, 'Unknown automation failure'), 4000) END,
    available_at = CASE
      WHEN p_succeeded THEN available_at
      ELSE now() + make_interval(mins => LEAST(60, (2 ^ LEAST(attempts, 6))::int))
    END
  WHERE id = p_event_id AND status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claimed task automation event not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_task_automation_outbox(uuid, boolean, text)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_task_automation_outbox(uuid, boolean, text)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.notification_events (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_user_id    uuid        NOT NULL REFERENCES auth.users(id),
  task_id              uuid        REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_event_id        uuid        REFERENCES public.task_events(id) ON DELETE SET NULL,
  actor_id             uuid        REFERENCES auth.users(id),
  event_type           text        NOT NULL,
  channel              text        NOT NULL CHECK (channel IN ('in_app', 'email', 'digest')),
  status               text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'sent', 'failed', 'suppressed', 'cancelled')),
  priority             text        NOT NULL DEFAULT 'normal'
                                   CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  dedupe_key           text        NOT NULL,
  scheduled_for        timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  read_at              timestamptz,
  delivery_attempts    int         NOT NULL DEFAULT 0,
  last_attempt_at      timestamptz,
  next_attempt_at      timestamptz,
  error_message        text,
  payload              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_notification_dedupe UNIQUE (org_id, recipient_user_id, channel, dedupe_key)
);

-- Inbox query (unread first, recent)
CREATE INDEX IF NOT EXISTS idx_notification_events_inbox
  ON public.notification_events (recipient_user_id, status, created_at DESC);

-- Pending send job
CREATE INDEX IF NOT EXISTS idx_notification_events_pending
  ON public.notification_events (status, scheduled_for)
  WHERE status = 'pending';

-- Retry backoff query
CREATE INDEX IF NOT EXISTS idx_notification_events_retry
  ON public.notification_events (status, next_attempt_at)
  WHERE status = 'failed';

-- Task + event type lookup for fan-out dedup
CREATE INDEX IF NOT EXISTS idx_notification_events_task_event
  ON public.notification_events (org_id, task_id, event_type);

-- ---------------------------------------------------------------------------
-- Built-in workflow templates
-- ---------------------------------------------------------------------------
INSERT INTO public.workflow_templates
  (id, org_id, name, workflow_type, description, is_system, is_active, steps)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    NULL,
    'Standard Due Diligence',
    'due_diligence',
    'Core pre-grant due diligence checklist for evaluating prospective grantees.',
    true,
    true,
    '[
      {"id":"verify_501c3","name":"Verify 501(c)(3) Status","description":"Confirm tax-exempt status via IRS determination letter or IRS lookup.","required":true,"estimated_days":1,"order":1},
      {"id":"review_990","name":"Review Latest 990","description":"Review the most recent Form 990 for financial health, governance, and compensation signals.","required":true,"estimated_days":2,"order":2},
      {"id":"mission_alignment","name":"Assess Mission Alignment","description":"Evaluate alignment with strategy, theory of change, and focus areas.","required":true,"estimated_days":2,"order":3},
      {"id":"capacity_assessment","name":"Capacity Assessment","description":"Evaluate staffing, infrastructure, and track record for the proposed work.","required":true,"estimated_days":2,"order":4},
      {"id":"final_recommendation","name":"Final Recommendation","description":"Prepare a recommendation memo with funding rationale and key risks.","required":true,"estimated_days":2,"order":5}
    ]'::jsonb
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    NULL,
    'Quarterly Grant Review',
    'grant_monitoring',
    'Quarterly progress and risk review for active grants.',
    true,
    true,
    '[
      {"id":"review_report","name":"Review Progress Report","description":"Review grantee progress report for completeness and accuracy.","required":true,"estimated_days":2,"order":1},
      {"id":"verify_metrics","name":"Verify Reported Metrics","description":"Compare reported metrics against targets and previous periods.","required":true,"estimated_days":1,"order":2},
      {"id":"financial_check","name":"Financial Status Check","description":"Review budget expenditures, burn rate, and remaining funds.","required":true,"estimated_days":1,"order":3},
      {"id":"milestone_review","name":"Milestone Progress Review","description":"Assess upcoming milestones and blockers.","required":true,"estimated_days":1,"order":4}
    ]'::jsonb
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    NULL,
    'Grant Closeout',
    'closeout',
    'End-of-grant closeout process for completing and archiving grants.',
    true,
    true,
    '[
      {"id":"final_report","name":"Collect Final Report","description":"Ensure final narrative and financial reports are submitted and complete.","required":true,"estimated_days":5,"order":1},
      {"id":"financial_reconciliation","name":"Financial Reconciliation","description":"Reconcile payments and verify proper use of funds.","required":true,"estimated_days":3,"order":2},
      {"id":"outcome_assessment","name":"Outcome Assessment","description":"Evaluate achievement against original goals and outcomes.","required":true,"estimated_days":3,"order":3},
      {"id":"archive_documents","name":"Archive Grant Documents","description":"Ensure all documents are archived and accessible.","required":true,"estimated_days":1,"order":4}
    ]'::jsonb
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    NULL,
    'Renewal Review',
    'renewal_review',
    'Evaluation workflow for grant renewal decisions.',
    true,
    true,
    '[
      {"id":"review_history","name":"Review Grant History","description":"Review reports, communications, and prior outcomes.","required":true,"estimated_days":2,"order":1},
      {"id":"assess_performance","name":"Assess Performance","description":"Evaluate performance against goals and milestones.","required":true,"estimated_days":2,"order":2},
      {"id":"strategic_fit","name":"Evaluate Strategic Fit","description":"Assess continued alignment with foundation priorities.","required":true,"estimated_days":1,"order":3},
      {"id":"decision_memo","name":"Prepare Decision Memo","description":"Prepare renewal recommendation for leadership review.","required":true,"estimated_days":2,"order":4}
    ]'::jsonb
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    NULL,
    'Site Visit',
    'site_visit',
    'Planning and conducting grantee site visits.',
    true,
    true,
    '[
      {"id":"schedule_visit","name":"Schedule Visit","description":"Coordinate date, attendees, and agenda with grantee.","required":true,"estimated_days":5,"order":1},
      {"id":"prepare_materials","name":"Prepare Visit Materials","description":"Review grant files and prepare questions.","required":true,"estimated_days":2,"order":2},
      {"id":"conduct_visit","name":"Conduct Site Visit","description":"Complete site visit with grantee team.","required":true,"estimated_days":1,"order":3},
      {"id":"document_findings","name":"Document Findings","description":"Write site visit report with observations and recommendations.","required":true,"estimated_days":2,"order":4}
    ]'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    workflow_type = EXCLUDED.workflow_type,
    description = EXCLUDED.description,
    is_system = EXCLUDED.is_system,
    is_active = EXCLUDED.is_active,
    steps = EXCLUDED.steps,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks: org members can view" ON public.tasks;
CREATE POLICY "tasks: org members can view"
  ON public.tasks FOR SELECT
  USING (public.can_view_org(org_id) AND deleted_at IS NULL);
DROP POLICY IF EXISTS "tasks: assignees can update own tasks" ON public.tasks;
CREATE POLICY "tasks: assignees can update own tasks"
  ON public.tasks FOR UPDATE
  USING (assigned_to = auth.uid() AND public.can_view_org(org_id) AND deleted_at IS NULL)
  WITH CHECK (assigned_to = auth.uid() AND public.can_view_org(org_id));
DROP POLICY IF EXISTS "tasks: org admins can manage" ON public.tasks;
CREATE POLICY "tasks: org members can manage"
  ON public.tasks FOR ALL
  USING (public.can_edit_org(org_id) AND deleted_at IS NULL)
  WITH CHECK (public.can_edit_org(org_id));
DROP POLICY IF EXISTS "tasks: service role can manage" ON public.tasks;
CREATE POLICY "tasks: service role can manage"
  ON public.tasks FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

ALTER TABLE public.task_entity_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_entity_links: org members can view" ON public.task_entity_links;
CREATE POLICY "task_entity_links: org members can view"
  ON public.task_entity_links FOR SELECT
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "task_entity_links: org admins can manage" ON public.task_entity_links;
CREATE POLICY "task_entity_links: org members can manage"
  ON public.task_entity_links FOR ALL
  USING (public.can_edit_org(org_id))
  WITH CHECK (public.can_edit_org(org_id));
DROP POLICY IF EXISTS "task_entity_links: service role can manage" ON public.task_entity_links;
CREATE POLICY "task_entity_links: service role can manage"
  ON public.task_entity_links FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_entity_links TO authenticated;
GRANT ALL ON public.task_entity_links TO service_role;

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_comments: org members can view" ON public.task_comments;
CREATE POLICY "task_comments: org members can view"
  ON public.task_comments FOR SELECT
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "task_comments: org members can comment" ON public.task_comments;
CREATE POLICY "task_comments: org members can comment"
  ON public.task_comments FOR INSERT
  WITH CHECK (public.can_view_org(org_id) AND author_id = auth.uid());
DROP POLICY IF EXISTS "task_comments: service role can manage" ON public.task_comments;
CREATE POLICY "task_comments: service role can manage"
  ON public.task_comments FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;

ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_events: org admins can view" ON public.task_events;
DROP POLICY IF EXISTS "task_events: org members can view" ON public.task_events;
CREATE POLICY "task_events: org members can view"
  ON public.task_events FOR SELECT
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "task_events: service role can manage" ON public.task_events;
CREATE POLICY "task_events: service role can manage"
  ON public.task_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.task_events TO authenticated;
GRANT ALL ON public.task_events TO service_role;

ALTER TABLE public.grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grants: org members can view" ON public.grants;
CREATE POLICY "grants: org members can view"
  ON public.grants FOR SELECT
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "grants: org admins can manage" ON public.grants;
CREATE POLICY "grants: org members can manage"
  ON public.grants FOR ALL
  USING (public.can_edit_org(org_id))
  WITH CHECK (public.can_edit_org(org_id));
DROP POLICY IF EXISTS "grants: service role can manage" ON public.grants;
CREATE POLICY "grants: service role can manage"
  ON public.grants FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grants TO authenticated;
GRANT ALL ON public.grants TO service_role;

ALTER TABLE public.grant_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grant_milestones: org members can view" ON public.grant_milestones;
CREATE POLICY "grant_milestones: org members can view"
  ON public.grant_milestones FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_milestones: org admins can manage" ON public.grant_milestones;
CREATE POLICY "grant_milestones: org members can manage"
  ON public.grant_milestones FOR ALL
  USING (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_milestones: service role can manage" ON public.grant_milestones;
CREATE POLICY "grant_milestones: service role can manage"
  ON public.grant_milestones FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_milestones TO authenticated;
GRANT ALL ON public.grant_milestones TO service_role;

DROP POLICY IF EXISTS "grant_reports: org members can view" ON public.grant_reports;
CREATE POLICY "grant_reports: org members can view"
  ON public.grant_reports FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_reports: org admins can manage" ON public.grant_reports;
CREATE POLICY "grant_reports: org members can manage"
  ON public.grant_reports FOR ALL
  USING (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_reports: service role can manage" ON public.grant_reports;
CREATE POLICY "grant_reports: service role can manage"
  ON public.grant_reports FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_reports TO authenticated;
GRANT ALL ON public.grant_reports TO service_role;

ALTER TABLE public.grant_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualifying_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenditure_responsibility_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grant_payments: org members can view" ON public.grant_payments;
CREATE POLICY "grant_payments: org members can view"
  ON public.grant_payments FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_payments: org admins can manage" ON public.grant_payments;
CREATE POLICY "grant_payments: org members can manage"
  ON public.grant_payments FOR ALL
  USING (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_payments: service role can manage" ON public.grant_payments;
CREATE POLICY "grant_payments: service role can manage"
  ON public.grant_payments FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_payments TO authenticated;
GRANT ALL ON public.grant_payments TO service_role;

DROP POLICY IF EXISTS "qualifying_distributions: portfolio members can view" ON public.qualifying_distributions;
CREATE POLICY "qualifying_distributions: portfolio members can view"
  ON public.qualifying_distributions FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));
DROP POLICY IF EXISTS "qualifying_distributions: portfolio editors can manage" ON public.qualifying_distributions;
CREATE POLICY "qualifying_distributions: portfolio editors can manage"
  ON public.qualifying_distributions FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));
DROP POLICY IF EXISTS "qualifying_distributions: service role can manage" ON public.qualifying_distributions;
CREATE POLICY "qualifying_distributions: service role can manage"
  ON public.qualifying_distributions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "er_grants: portfolio members can view" ON public.expenditure_responsibility_grants;
CREATE POLICY "er_grants: portfolio members can view"
  ON public.expenditure_responsibility_grants FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));
DROP POLICY IF EXISTS "er_grants: portfolio editors can manage" ON public.expenditure_responsibility_grants;
CREATE POLICY "er_grants: portfolio editors can manage"
  ON public.expenditure_responsibility_grants FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));
DROP POLICY IF EXISTS "er_grants: service role can manage" ON public.expenditure_responsibility_grants;
CREATE POLICY "er_grants: service role can manage"
  ON public.expenditure_responsibility_grants FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualifying_distributions TO authenticated;
GRANT ALL ON public.qualifying_distributions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenditure_responsibility_grants TO authenticated;
GRANT ALL ON public.expenditure_responsibility_grants TO service_role;

DROP POLICY IF EXISTS "grant_budget_items: org members can view" ON public.grant_budget_items;
CREATE POLICY "grant_budget_items: org members can view"
  ON public.grant_budget_items FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_budget_items: org admins can manage" ON public.grant_budget_items;
CREATE POLICY "grant_budget_items: org members can manage"
  ON public.grant_budget_items FOR ALL
  USING (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_budget_items: service role can manage" ON public.grant_budget_items;
CREATE POLICY "grant_budget_items: service role can manage"
  ON public.grant_budget_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grant_communications: org members can view" ON public.grant_communications;
CREATE POLICY "grant_communications: org members can view"
  ON public.grant_communications FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_communications: org admins can manage" ON public.grant_communications;
CREATE POLICY "grant_communications: org members can manage"
  ON public.grant_communications FOR ALL
  USING (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_communications: service role can manage" ON public.grant_communications;
CREATE POLICY "grant_communications: service role can manage"
  ON public.grant_communications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grant_documents: org members can view" ON public.grant_documents;
CREATE POLICY "grant_documents: org members can view"
  ON public.grant_documents FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_documents: org admins can manage" ON public.grant_documents;
CREATE POLICY "grant_documents: org members can manage"
  ON public.grant_documents FOR ALL
  USING (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_documents: service role can manage" ON public.grant_documents;
CREATE POLICY "grant_documents: service role can manage"
  ON public.grant_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grant_contacts: org members can view" ON public.grant_contacts;
CREATE POLICY "grant_contacts: org members can view"
  ON public.grant_contacts FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_contacts: org admins can manage" ON public.grant_contacts;
CREATE POLICY "grant_contacts: org members can manage"
  ON public.grant_contacts FOR ALL
  USING (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_contacts: service role can manage" ON public.grant_contacts;
CREATE POLICY "grant_contacts: service role can manage"
  ON public.grant_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Grant status history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grant_status_history (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id    uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_stage  text,
  to_stage    text NOT NULL,
  reason      text,
  actor_id    uuid REFERENCES auth.users(id),
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grant_status_history_grant ON public.grant_status_history(grant_id);
ALTER TABLE public.grant_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grant_status_history: org members can view" ON public.grant_status_history;
CREATE POLICY "grant_status_history: org members can view"
  ON public.grant_status_history FOR SELECT TO authenticated
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "grant_status_history: org admins can manage" ON public.grant_status_history;
CREATE POLICY "grant_status_history: org members can manage"
  ON public.grant_status_history FOR ALL TO authenticated
  USING (public.can_edit_org(org_id))
  WITH CHECK (public.can_edit_org(org_id));
DROP POLICY IF EXISTS "grant_status_history: service role can manage" ON public.grant_status_history;
CREATE POLICY "grant_status_history: service role can manage"
  ON public.grant_status_history FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_status_history TO authenticated;
GRANT ALL ON public.grant_status_history TO service_role;

CREATE OR REPLACE FUNCTION public.create_grant_with_foundation_records(
  p_org_id uuid,
  p_portfolio_id uuid,
  p_actor_id uuid,
  p_purpose text,
  p_requested_amount numeric,
  p_investee_id uuid DEFAULT NULL,
  p_new_grantee jsonb DEFAULT NULL,
  p_currency text DEFAULT 'USD',
  p_grant_type text DEFAULT NULL,
  p_grant_period_start date DEFAULT NULL,
  p_grant_period_end date DEFAULT NULL,
  p_lifecycle_stage text DEFAULT 'draft',
  p_internal_owner_id uuid DEFAULT NULL,
  p_risk_level text DEFAULT NULL,
  p_reporting_frequency text DEFAULT NULL,
  p_renewal_eligible boolean DEFAULT false,
  p_workflow_template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_investee_id uuid;
  v_grant_name text;
  v_holding public.holdings%ROWTYPE;
  v_grant public.grants%ROWTYPE;
  v_template public.workflow_templates%ROWTYPE;
  v_workflow public.workflow_instances%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.portfolios p
    WHERE p.id = p_portfolio_id
      AND p.org_id = p_org_id
      AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Portfolio not found in this org';
  END IF;

  IF p_purpose IS NULL OR btrim(p_purpose) = '' THEN
    RAISE EXCEPTION 'purpose is required';
  END IF;

  IF p_requested_amount IS NULL OR p_requested_amount < 0 THEN
    RAISE EXCEPTION 'requested_amount must be a non-negative number';
  END IF;

  IF p_investee_id IS NULL AND p_new_grantee IS NULL THEN
    RAISE EXCEPTION 'Provide either investee_id or new_grantee';
  END IF;

  IF p_investee_id IS NOT NULL AND p_new_grantee IS NOT NULL THEN
    RAISE EXCEPTION 'Provide investee_id OR new_grantee, not both';
  END IF;

  IF p_new_grantee IS NOT NULL THEN
    v_grant_name := nullif(btrim(p_new_grantee ->> 'display_name'), '');
    IF v_grant_name IS NULL THEN
      RAISE EXCEPTION 'new_grantee.display_name is required';
    END IF;

    INSERT INTO public.investees (
      ein,
      display_name,
      sector,
      country,
      city
    )
    VALUES (
      nullif(p_new_grantee ->> 'ein', ''),
      v_grant_name,
      nullif(p_new_grantee ->> 'sector', ''),
      nullif(p_new_grantee ->> 'country', ''),
      COALESCE(nullif(p_new_grantee ->> 'city', ''), nullif(p_new_grantee ->> 'region', ''))
    )
    RETURNING id INTO v_investee_id;
  ELSE
    SELECT i.id, i.display_name
    INTO v_investee_id, v_grant_name
    FROM public.investees i
    WHERE i.id = p_investee_id;

    IF v_investee_id IS NULL THEN
      RAISE EXCEPTION 'Investee not found';
    END IF;
  END IF;

  INSERT INTO public.holdings (
    portfolio_id,
    org_id,
    asset_type,
    name,
    ein,
    investee_id,
    sector,
    city,
    country,
    amount_invested,
    currency,
    investment_date
  )
  VALUES (
    p_portfolio_id,
    p_org_id,
    'foundation_grant',
    COALESCE(v_grant_name, 'Grant'),
    nullif(p_new_grantee ->> 'ein', ''),
    v_investee_id,
    nullif(p_new_grantee ->> 'sector', ''),
    COALESCE(nullif(p_new_grantee ->> 'city', ''), nullif(p_new_grantee ->> 'region', '')),
    nullif(p_new_grantee ->> 'country', ''),
    p_requested_amount,
    COALESCE(NULLIF(p_currency, ''), 'USD'),
    p_grant_period_start
  )
  RETURNING * INTO v_holding;

  INSERT INTO public.grants (
    holding_id,
    org_id,
    portfolio_id,
    purpose,
    requested_amount,
    currency,
    grant_type,
    grant_period_start,
    grant_period_end,
    lifecycle_stage,
    internal_owner_id,
    risk_level,
    reporting_frequency,
    renewal_eligible
  )
  VALUES (
    v_holding.id,
    p_org_id,
    p_portfolio_id,
    p_purpose,
    p_requested_amount,
    COALESCE(NULLIF(p_currency, ''), 'USD'),
    p_grant_type,
    p_grant_period_start,
    p_grant_period_end,
    p_lifecycle_stage,
    p_internal_owner_id,
    p_risk_level,
    p_reporting_frequency,
    COALESCE(p_renewal_eligible, false)
  )
  RETURNING * INTO v_grant;

  INSERT INTO public.grant_status_history (
    grant_id,
    org_id,
    from_stage,
    to_stage,
    reason,
    actor_id
  )
  VALUES (
    v_grant.id,
    p_org_id,
    NULL,
    p_lifecycle_stage,
    'Grant created',
    p_actor_id
  );

  IF p_workflow_template_id IS NOT NULL THEN
    SELECT *
    INTO v_template
    FROM public.workflow_templates wt
    WHERE wt.id = p_workflow_template_id
      AND wt.org_id = p_org_id;

    IF v_template.id IS NULL THEN
      RAISE EXCEPTION 'Workflow template not found in this org';
    END IF;

    INSERT INTO public.workflow_instances (
      template_id,
      org_id,
      portfolio_id,
      grant_id,
      name,
      workflow_type,
      status,
      metadata
    )
    VALUES (
      v_template.id,
      p_org_id,
      p_portfolio_id,
      v_grant.id,
      COALESCE(v_grant_name, 'Grant') || ' workflow',
      'grant',
      'active',
      jsonb_build_object('holding_id', v_holding.id, 'steps', COALESCE(v_template.steps, '[]'::jsonb))
    )
    RETURNING * INTO v_workflow;
  END IF;

  RETURN jsonb_build_object(
    'grant', to_jsonb(v_grant),
    'holding', to_jsonb(v_holding),
    'workflow_instance', CASE
      WHEN v_workflow.id IS NULL THEN NULL
      ELSE to_jsonb(v_workflow)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_grant_with_foundation_records(
  uuid, uuid, uuid, text, numeric, uuid, jsonb, text, text, date, date, text, uuid, text, text, boolean, uuid
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_grant_with_foundation_records(
  uuid, uuid, uuid, text, numeric, uuid, jsonb, text, text, date, date, text, uuid, text, text, boolean, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_pledge_with_obligations(
  p_org_id uuid,
  p_pledge_id uuid,
  p_actor_id uuid,
  p_cancellation_reason text DEFAULT NULL,
  p_waive_pending boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_waived_count integer := 0;
  v_cancelled_task_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.pledges p
    WHERE p.id = p_pledge_id
      AND p.org_id = p_org_id
      AND p.deleted_at IS NULL
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Pledge not found';
  END IF;

  UPDATE public.pledges
  SET
    status = 'cancelled',
    cancelled_at = v_now,
    cancelled_by = p_actor_id,
    cancellation_reason = p_cancellation_reason,
    updated_at = v_now
  WHERE id = p_pledge_id
    AND org_id = p_org_id
    AND deleted_at IS NULL;

  IF COALESCE(p_waive_pending, false) THEN
    UPDATE public.pledge_installments
    SET
      status = 'waived',
      waived_at = v_now,
      acted_by = p_actor_id,
      updated_at = v_now
    WHERE pledge_id = p_pledge_id
      AND org_id = p_org_id
      AND status = 'pending';

    GET DIAGNOSTICS v_waived_count = ROW_COUNT;
  END IF;

  INSERT INTO public.pledge_events (
    org_id,
    pledge_id,
    event_type,
    actor_id,
    after_values
  )
  VALUES (
    p_org_id,
    p_pledge_id,
    'cancelled',
    p_actor_id,
    jsonb_build_object(
      'cancellation_reason', p_cancellation_reason,
      'waive_pending', COALESCE(p_waive_pending, false)
    )
  );

  WITH target_tasks AS (
    SELECT t.id, t.metadata
    FROM public.tasks t
    WHERE t.org_id = p_org_id
      AND t.source = 'automation'
      AND t.status IN ('open', 'in_progress', 'blocked', 'waiting')
      AND t.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.pledge_installments pi
        WHERE pi.org_id = p_org_id
          AND pi.pledge_id = p_pledge_id
          AND t.source_key LIKE ('pledge_installment:' || pi.id || ':%')
      )
    FOR UPDATE
  ),
  updated_tasks AS (
    UPDATE public.tasks t
    SET
      status = 'cancelled',
      updated_at = v_now,
      metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object('cancel_reason', 'Pledge cancelled')
    FROM target_tasks tt
    WHERE t.id = tt.id
    RETURNING t.id
  ),
  inserted_events AS (
    INSERT INTO public.task_events (
      task_id,
      org_id,
      actor_id,
      event_type,
      after_values
    )
    SELECT
      ut.id,
      p_org_id,
      p_actor_id,
      'cancelled',
      jsonb_build_object('cancel_reason', 'Pledge cancelled')
    FROM updated_tasks ut
    RETURNING id
  )
  SELECT COUNT(*)::integer INTO v_cancelled_task_count
  FROM inserted_events;

  RETURN jsonb_build_object(
    'waived_installments', v_waived_count,
    'cancelled_tasks', v_cancelled_task_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pledge_with_obligations(
  uuid, uuid, uuid, text, boolean
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pledge_with_obligations(
  uuid, uuid, uuid, text, boolean
) TO service_role;

-- ---------------------------------------------------------------------------
-- Grant decisions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grant_decisions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id          uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision_type     text NOT NULL CHECK (decision_type IN ('approval','decline','defer','renewal','closeout','payment_release')),
  decision          text NOT NULL CHECK (decision IN ('approved','declined','deferred','conditional','not_applicable')),
  decision_date     date NOT NULL,
  decided_by        uuid REFERENCES auth.users(id),
  amount            numeric(20,4),
  conditions        text,
  rationale         text,
  board_meeting_date date,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grant_decisions_grant ON public.grant_decisions(grant_id);
ALTER TABLE public.grant_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grant_decisions: org members can view" ON public.grant_decisions;
CREATE POLICY "grant_decisions: org members can view"
  ON public.grant_decisions FOR SELECT TO authenticated
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "grant_decisions: org admins can manage" ON public.grant_decisions;
CREATE POLICY "grant_decisions: org members can insert"
  ON public.grant_decisions FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_org(org_id));
DROP POLICY IF EXISTS "grant_decisions: service role can manage" ON public.grant_decisions;
CREATE POLICY "grant_decisions: service role can manage"
  ON public.grant_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE UPDATE, DELETE ON public.grant_decisions FROM authenticated;
GRANT SELECT, INSERT ON public.grant_decisions TO authenticated;
GRANT ALL ON public.grant_decisions TO service_role;

DROP POLICY IF EXISTS "reminders: org members can view" ON public.reminders;
CREATE POLICY "reminders: org members can view"
  ON public.reminders FOR SELECT
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "reminders: org admins can manage" ON public.reminders;
CREATE POLICY "reminders: org admins can manage"
  ON public.reminders FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_templates: org members can view" ON public.workflow_templates;
CREATE POLICY "workflow_templates: org members can view"
  ON public.workflow_templates FOR SELECT
  USING (org_id IS NULL OR public.can_view_org(org_id));
DROP POLICY IF EXISTS "workflow_templates: org admins can manage" ON public.workflow_templates;
CREATE POLICY "workflow_templates: org admins can manage"
  ON public.workflow_templates FOR ALL
  USING (org_id IS NOT NULL AND public.is_org_admin(org_id))
  WITH CHECK (org_id IS NOT NULL AND public.is_org_admin(org_id));

DROP POLICY IF EXISTS "workflow_templates_service" ON public.workflow_templates;
CREATE POLICY "workflow_templates_service" ON public.workflow_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.workflow_templates TO service_role;

ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_instances: org members can view" ON public.workflow_instances;
CREATE POLICY "workflow_instances: org members can view"
  ON public.workflow_instances FOR SELECT
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "workflow_instances: org admins can manage" ON public.workflow_instances;
CREATE POLICY "workflow_instances: org admins can manage"
  ON public.workflow_instances FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));
DROP POLICY IF EXISTS "workflow_instances: service role can manage" ON public.workflow_instances;
CREATE POLICY "workflow_instances: service role can manage"
  ON public.workflow_instances FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_instances TO authenticated;
GRANT ALL ON public.workflow_instances TO service_role;

ALTER TABLE public.workflow_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_tasks: inherit workflow view" ON public.workflow_tasks;
CREATE POLICY "workflow_tasks: inherit workflow view"
  ON public.workflow_tasks FOR SELECT
  USING (public.can_view_org((SELECT wi.org_id FROM public.workflow_instances wi WHERE wi.id = workflow_id)));
DROP POLICY IF EXISTS "workflow_tasks: inherit workflow manage" ON public.workflow_tasks;
CREATE POLICY "workflow_tasks: inherit workflow manage"
  ON public.workflow_tasks FOR ALL
  USING (public.is_org_admin((SELECT wi.org_id FROM public.workflow_instances wi WHERE wi.id = workflow_id)))
  WITH CHECK (public.is_org_admin((SELECT wi.org_id FROM public.workflow_instances wi WHERE wi.id = workflow_id)));
DROP POLICY IF EXISTS "workflow_tasks: service role can manage" ON public.workflow_tasks;
CREATE POLICY "workflow_tasks: service role can manage"
  ON public.workflow_tasks FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_tasks TO authenticated;
GRANT ALL ON public.workflow_tasks TO service_role;

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_events: recipients can view" ON public.notification_events;
CREATE POLICY "notification_events: recipients can view"
  ON public.notification_events FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND public.can_view_org(org_id)
  );

DROP POLICY IF EXISTS "notification_events: recipients can mark read" ON public.notification_events;
CREATE POLICY "notification_events: recipients can mark read"
  ON public.notification_events FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "notification_events: service role can manage" ON public.notification_events;
CREATE POLICY "notification_events: service role can manage"
  ON public.notification_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;

CREATE TRIGGER trg_notification_events_updated_at
  BEFORE UPDATE ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grant reporting views and deadline function expected by current UI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_grants
  WITH (security_invoker = true)
AS
SELECT
  g.id AS id,
  g.id AS grant_id,
  h.id AS holding_id,
  g.org_id,
  g.portfolio_id,
  h.name,
  h.asset_type::text AS asset_type,
  h.status::text AS status,
  h.funds_allocated,
  h.sector,
  h.country,
  g.lifecycle_stage,
  g.grant_type,
  g.requested_amount,
  g.approved_amount,
  g.currency,
  g.grant_period_start,
  g.grant_period_end,
  g.reporting_frequency,
  g.next_report_due,
  g.renewal_eligible,
  g.renewal_date,
  g.deliverables,
  g.purpose,
  g.internal_owner_id,
  g.risk_level,
  CASE
    WHEN g.grant_period_start IS NOT NULL AND g.grant_period_start > CURRENT_DATE THEN 'future'
    WHEN g.grant_period_end IS NOT NULL AND g.grant_period_end < CURRENT_DATE THEN 'ended'
    WHEN g.grant_period_start IS NOT NULL OR g.grant_period_end IS NOT NULL THEN 'active'
    ELSE 'ongoing'
  END AS grant_period_status,
  COUNT(DISTINCT gm.id)::int AS total_milestones,
  COUNT(DISTINCT gm.id) FILTER (WHERE gm.status = 'completed')::int AS milestones_completed,
  COUNT(DISTINCT gm.id) FILTER (WHERE gm.status IN ('pending', 'in_progress'))::int AS milestones_pending,
  COUNT(DISTINCT gm.id) FILTER (
    WHERE gm.status NOT IN ('completed', 'cancelled') AND gm.due_date IS NOT NULL AND gm.due_date < CURRENT_DATE
  )::int AS milestones_overdue,
  COUNT(DISTINCT gr.id)::int AS total_reports,
  COUNT(DISTINCT gr.id) FILTER (WHERE gr.submitted_date IS NOT NULL OR gr.received_at IS NOT NULL)::int AS reports_submitted,
  COUNT(DISTINCT gr.id) FILTER (
    WHERE gr.due_date IS NOT NULL
      AND gr.due_date < CURRENT_DATE
      AND gr.submitted_date IS NULL
      AND gr.received_at IS NULL
  )::int AS reports_overdue,
  CASE
    WHEN COUNT(DISTINCT gm.id) = 0 THEN NULL
    ELSE ROUND(
      100.0 * COUNT(DISTINCT gm.id) FILTER (WHERE gm.status = 'completed') / NULLIF(COUNT(DISTINCT gm.id), 0),
      1
    )
  END AS milestone_completion_pct
FROM public.grants g
JOIN public.holdings h ON h.id = g.holding_id
LEFT JOIN public.grant_milestones gm ON gm.grant_id = g.id
LEFT JOIN public.grant_reports gr ON gr.grant_id = g.id
WHERE h.deleted_at IS NULL AND g.deleted_at IS NULL
GROUP BY g.id, h.id;

CREATE OR REPLACE VIEW public.v_portfolio_grant_summary
  WITH (security_invoker = true)
AS
SELECT
  portfolio_id,
  COUNT(*)::int AS total_grants,
  COALESCE(SUM(funds_allocated), 0)::numeric(20,4) AS total_allocated,
  COUNT(*) FILTER (WHERE grant_period_status = 'active')::int AS active_grants,
  COUNT(*) FILTER (WHERE milestones_overdue > 0 OR reports_overdue > 0)::int AS attention_needed,
  COALESCE(SUM(milestones_overdue), 0)::int AS total_milestones_overdue,
  COALESCE(SUM(reports_overdue), 0)::int AS total_reports_overdue
FROM public.v_grants
GROUP BY portfolio_id;

CREATE OR REPLACE VIEW public.v_grant_health
  WITH (security_invoker = true)
AS
SELECT
  vg.holding_id,
  vg.grant_id,
  vg.name AS grant_name,
  vg.grant_type,
  vg.portfolio_id,
  vg.grant_period_start,
  vg.grant_period_end,
  vg.funds_allocated,
  COALESCE(pay.total_scheduled, 0)::numeric(20,4) AS total_scheduled,
  COALESCE(pay.total_disbursed, 0)::numeric(20,4) AS total_disbursed,
  COALESCE(pay.payments_pending, 0)::int AS payments_pending,
  vg.total_milestones,
  vg.milestones_completed,
  vg.milestones_overdue,
  vg.total_reports,
  vg.reports_submitted,
  vg.reports_overdue,
  COALESCE(wf.active_workflows, 0)::int AS active_workflows,
  COALESCE(wf.workflow_tasks_pending, 0)::int AS workflow_tasks_pending,
  GREATEST(
    0,
    LEAST(
      100,
      100
      - (vg.milestones_overdue * 20)
      - (vg.reports_overdue * 25)
      - (COALESCE(pay.payments_pending, 0) * 5)
      - (COALESCE(wf.workflow_tasks_pending, 0) * 2)
    )
  )::int AS health_score,
  CASE
    WHEN vg.milestones_overdue > 0 OR vg.reports_overdue > 0 THEN 'high'
    WHEN COALESCE(pay.payments_pending, 0) > 0 OR COALESCE(wf.workflow_tasks_pending, 0) > 3 THEN 'medium'
    ELSE 'low'
  END AS risk_level
FROM public.v_grants vg
LEFT JOIN (
  SELECT
    grant_id,
    SUM(amount) AS total_scheduled,
    SUM(amount) FILTER (WHERE status = 'completed') AS total_disbursed,
    COUNT(*) FILTER (WHERE status IN ('scheduled', 'approved', 'processing')) AS payments_pending
  FROM public.grant_payments
  GROUP BY grant_id
) pay ON pay.grant_id = vg.grant_id
LEFT JOIN (
  SELECT
    wi.grant_id,
    COUNT(DISTINCT wi.id) FILTER (WHERE wi.status = 'active') AS active_workflows,
    COUNT(wt.id) FILTER (WHERE wt.status IN ('pending', 'in_progress', 'blocked')) AS workflow_tasks_pending
  FROM public.workflow_instances wi
  LEFT JOIN public.workflow_tasks wt ON wt.workflow_id = wi.id
  WHERE wi.grant_id IS NOT NULL
  GROUP BY wi.grant_id
) wf ON wf.grant_id = vg.grant_id;

GRANT SELECT ON public.v_grants TO authenticated, service_role;
GRANT SELECT ON public.v_portfolio_grant_summary TO authenticated, service_role;
GRANT SELECT ON public.v_grant_health TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_er_grant_compliance
  WITH (security_invoker = true)
AS
SELECT
  er.portfolio_id,
  er.created_at,
  er.id,
  er.grant_id,
  h.name AS grant_name,
  er.grantee_ein,
  er.grantee_is_public_charity,
  er.grantee_501c3_verified,
  er.er_agreement_signed_date,
  er.er_reports_required_count,
  er.er_reports_received_count,
  (er.er_reports_required_count - er.er_reports_received_count) AS reports_outstanding,
  er.terminal_report_required,
  er.terminal_report_received,
  er.er_status,
  er.notes
FROM public.expenditure_responsibility_grants er
JOIN public.grants g ON g.id = er.grant_id
JOIN public.holdings h ON h.id = g.holding_id;

GRANT SELECT ON public.v_er_grant_compliance TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_upcoming_deadlines(
  p_portfolio_id uuid,
  p_days_ahead int DEFAULT 30
)
RETURNS TABLE(
  deadline_type text,
  entity_type text,
  entity_id uuid,
  holding_name text,
  title text,
  due_date date,
  days_until_due int,
  priority text
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH deadline_rows AS (
    SELECT
      'milestone'::text AS deadline_type,
      'grant_milestone'::text AS entity_type,
      gm.id AS entity_id,
      h.name AS holding_name,
      gm.milestone_name AS title,
      gm.due_date
    FROM grant_milestones gm
    JOIN grants g ON g.id = gm.grant_id
    JOIN holdings h ON h.id = g.holding_id
    WHERE h.portfolio_id = p_portfolio_id
      AND gm.status <> 'completed'
      AND gm.due_date IS NOT NULL

    UNION ALL

    SELECT
      'report'::text,
      'grant_report'::text,
      gr.id,
      h.name,
      COALESCE(gr.report_type, 'Grant report'),
      gr.due_date
    FROM grant_reports gr
    JOIN grants g ON g.id = gr.grant_id
    JOIN holdings h ON h.id = g.holding_id
    WHERE h.portfolio_id = p_portfolio_id
      AND gr.due_date IS NOT NULL
      AND gr.submitted_date IS NULL
      AND gr.received_at IS NULL

    UNION ALL

    SELECT
      'payment'::text,
      'grant_payment'::text,
      gp.id,
      h.name,
      ('Payment #' || gp.payment_number)::text,
      gp.scheduled_date
    FROM grant_payments gp
    JOIN grants g ON g.id = gp.grant_id
    JOIN holdings h ON h.id = g.holding_id
    WHERE h.portfolio_id = p_portfolio_id
      AND gp.status IN ('scheduled', 'approved', 'processing')
      AND gp.scheduled_date IS NOT NULL
  )
  SELECT
    dr.deadline_type,
    dr.entity_type,
    dr.entity_id,
    dr.holding_name,
    dr.title,
    dr.due_date,
    (dr.due_date - CURRENT_DATE)::int AS days_until_due,
    CASE
      WHEN dr.due_date < CURRENT_DATE THEN 'overdue'
      WHEN dr.due_date <= CURRENT_DATE + 7 THEN 'urgent'
      ELSE 'normal'
    END AS priority
  FROM deadline_rows dr
  WHERE dr.due_date <= CURRENT_DATE + make_interval(days => p_days_ahead)
  ORDER BY dr.due_date ASC;
$$;

-- ---------------------------------------------------------------------------
-- Private grant-document storage bucket, when Supabase storage is installed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    EXECUTE $storage$
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('grant-documents', 'grant-documents', false)
      ON CONFLICT (id) DO NOTHING
    $storage$;
  END IF;
END
$$;
