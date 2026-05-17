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
                  CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue', 'cancelled')),
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
  notes             text
);

CREATE INDEX IF NOT EXISTS idx_grant_payments_grant
  ON public.grant_payments (grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_payments_scheduled
  ON public.grant_payments (scheduled_date)
  WHERE status IN ('scheduled', 'approved', 'processing');

DROP TRIGGER IF EXISTS trg_grant_payments_updated_at ON public.grant_payments;
CREATE TRIGGER trg_grant_payments_updated_at
  BEFORE UPDATE ON public.grant_payments
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
CREATE POLICY "tasks: org admins can manage"
  ON public.tasks FOR ALL
  USING (public.is_org_admin(org_id) AND deleted_at IS NULL)
  WITH CHECK (public.is_org_admin(org_id));
DROP POLICY IF EXISTS "tasks: service role can manage" ON public.tasks;
CREATE POLICY "tasks: service role can manage"
  ON public.tasks FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.task_entity_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_entity_links: org members can view" ON public.task_entity_links;
CREATE POLICY "task_entity_links: org members can view"
  ON public.task_entity_links FOR SELECT
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "task_entity_links: org admins can manage" ON public.task_entity_links;
CREATE POLICY "task_entity_links: org admins can manage"
  ON public.task_entity_links FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_comments: org members can view" ON public.task_comments;
CREATE POLICY "task_comments: org members can view"
  ON public.task_comments FOR SELECT
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "task_comments: org members can comment" ON public.task_comments;
CREATE POLICY "task_comments: org members can comment"
  ON public.task_comments FOR INSERT
  WITH CHECK (public.can_view_org(org_id) AND author_id = auth.uid());

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

ALTER TABLE public.grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grants: org members can view" ON public.grants;
CREATE POLICY "grants: org members can view"
  ON public.grants FOR SELECT
  USING (public.can_view_org(org_id));
DROP POLICY IF EXISTS "grants: org admins can manage" ON public.grants;
CREATE POLICY "grants: org admins can manage"
  ON public.grants FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));
DROP POLICY IF EXISTS "grants: service role can manage" ON public.grants;
CREATE POLICY "grants: service role can manage"
  ON public.grants FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.grant_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grant_milestones: org members can view" ON public.grant_milestones;
CREATE POLICY "grant_milestones: org members can view"
  ON public.grant_milestones FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_milestones: org admins can manage" ON public.grant_milestones;
CREATE POLICY "grant_milestones: org admins can manage"
  ON public.grant_milestones FOR ALL
  USING (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_milestones: service role can manage" ON public.grant_milestones;
CREATE POLICY "grant_milestones: service role can manage"
  ON public.grant_milestones FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grant_reports: org members can view" ON public.grant_reports;
CREATE POLICY "grant_reports: org members can view"
  ON public.grant_reports FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_reports: org admins can manage" ON public.grant_reports;
CREATE POLICY "grant_reports: org admins can manage"
  ON public.grant_reports FOR ALL
  USING (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_reports: service role can manage" ON public.grant_reports;
CREATE POLICY "grant_reports: service role can manage"
  ON public.grant_reports FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.grant_payments ENABLE ROW LEVEL SECURITY;
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
CREATE POLICY "grant_payments: org admins can manage"
  ON public.grant_payments FOR ALL
  USING (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_payments: service role can manage" ON public.grant_payments;
CREATE POLICY "grant_payments: service role can manage"
  ON public.grant_payments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grant_budget_items: org members can view" ON public.grant_budget_items;
CREATE POLICY "grant_budget_items: org members can view"
  ON public.grant_budget_items FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_budget_items: org admins can manage" ON public.grant_budget_items;
CREATE POLICY "grant_budget_items: org admins can manage"
  ON public.grant_budget_items FOR ALL
  USING (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_budget_items: service role can manage" ON public.grant_budget_items;
CREATE POLICY "grant_budget_items: service role can manage"
  ON public.grant_budget_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grant_communications: org members can view" ON public.grant_communications;
CREATE POLICY "grant_communications: org members can view"
  ON public.grant_communications FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_communications: org admins can manage" ON public.grant_communications;
CREATE POLICY "grant_communications: org admins can manage"
  ON public.grant_communications FOR ALL
  USING (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_communications: service role can manage" ON public.grant_communications;
CREATE POLICY "grant_communications: service role can manage"
  ON public.grant_communications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grant_documents: org members can view" ON public.grant_documents;
CREATE POLICY "grant_documents: org members can view"
  ON public.grant_documents FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_documents: org admins can manage" ON public.grant_documents;
CREATE POLICY "grant_documents: org admins can manage"
  ON public.grant_documents FOR ALL
  USING (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_documents: service role can manage" ON public.grant_documents;
CREATE POLICY "grant_documents: service role can manage"
  ON public.grant_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "grant_contacts: org members can view" ON public.grant_contacts;
CREATE POLICY "grant_contacts: org members can view"
  ON public.grant_contacts FOR SELECT
  USING (public.can_view_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
DROP POLICY IF EXISTS "grant_contacts: org admins can manage" ON public.grant_contacts;
CREATE POLICY "grant_contacts: org admins can manage"
  ON public.grant_contacts FOR ALL
  USING (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))
  WITH CHECK (public.is_org_admin((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)));
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
CREATE POLICY "grant_status_history: org admins can manage"
  ON public.grant_status_history FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));
DROP POLICY IF EXISTS "grant_status_history: service role can manage" ON public.grant_status_history;
CREATE POLICY "grant_status_history: service role can manage"
  ON public.grant_status_history FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_status_history TO authenticated;
GRANT ALL ON public.grant_status_history TO service_role;

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
CREATE POLICY "grant_decisions: org admins can manage"
  ON public.grant_decisions FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));
DROP POLICY IF EXISTS "grant_decisions: service role can manage" ON public.grant_decisions;
CREATE POLICY "grant_decisions: service role can manage"
  ON public.grant_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_decisions TO authenticated;
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
CREATE OR REPLACE VIEW public.v_grants AS
SELECT
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
    WHERE gm.status <> 'completed' AND gm.due_date IS NOT NULL AND gm.due_date < CURRENT_DATE
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

CREATE OR REPLACE VIEW public.v_portfolio_grant_summary AS
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

CREATE OR REPLACE VIEW public.v_grant_health AS
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
