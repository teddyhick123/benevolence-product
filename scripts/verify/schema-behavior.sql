\set ON_ERROR_STOP on

BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'schema-check@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'schema-provisioning@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'schema-provisioning-rollback@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

INSERT INTO public.organizations (id, name)
VALUES ('20000000-0000-0000-0000-000000000001', 'Schema behavior check');

UPDATE public.organizations
SET modules = '{"portfolio":true,"donors":true,"pledges":true}'::jsonb
WHERE id = '20000000-0000-0000-0000-000000000001';

INSERT INTO public.organization_members (org_id, user_id, role, accepted_at)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'owner',
  now()
);

INSERT INTO public.portfolios (id, org_id, owner_id, name) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'With donations'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Without donations');

INSERT INTO public.holdings (
  id, portfolio_id, org_id, asset_type, status, name, funds_allocated, deleted_at
) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'donation', 'active', 'Visible donation', 1000, NULL),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'donation', 'active', 'Deleted donation', 9999, now()),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'equity', 'active', 'Non-donation holding', 5000, NULL);

INSERT INTO public.tax_contributions (
  id, portfolio_id, org_id, tax_year, contribution_date, recipient_name,
  contribution_type, amount_usd, fmv_at_donation, cost_basis, deductible_amount
) VALUES
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2026, CURRENT_DATE, 'Donation recipient', 'stock', 1000, 1000, 400, 900),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2026, CURRENT_DATE, 'Equity recipient', 'stock', 5000, 5000, 100, 5000);

INSERT INTO public.holding_contributions (
  portfolio_id, org_id, holding_id, tax_contribution_id, amount_usd, contribution_date
) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1000, CURRENT_DATE),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 5000, CURRENT_DATE);

INSERT INTO public.tax_carryforwards (
  portfolio_id, org_id, tax_contribution_id, originating_tax_year, amount,
  amount_remaining, agi_limit_category, expires_tax_year
) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 2025, 100, 100, '30_appreciated', 2030),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 2025, 700, 700, '30_appreciated', 2030);

DO $$
DECLARE
  v_summary record;
  v_zero record;
BEGIN
  SELECT * INTO v_summary
  FROM public.v_portfolio_donation_summary
  WHERE portfolio_id = '30000000-0000-0000-0000-000000000001';

  IF v_summary.total_donations <> 1
     OR v_summary.linked_tax_contributions <> 1
     OR v_summary.total_tax_deductible_amount <> 900
     OR v_summary.total_appreciated_asset_gain <> 600
     OR v_summary.total_carryforward_available <> 100 THEN
    RAISE EXCEPTION 'donation summary is not scoped to live donation holdings: %', row_to_json(v_summary);
  END IF;

  IF (SELECT COUNT(*) FROM public.v_portfolio_donations WHERE portfolio_id = v_summary.portfolio_id) <> 1
     OR NOT (SELECT has_tax_contribution FROM public.v_portfolio_donations WHERE portfolio_id = v_summary.portfolio_id) THEN
    RAISE EXCEPTION 'donation listing view did not apply canonical scope/linkage';
  END IF;

  SELECT * INTO v_zero
  FROM public.v_portfolio_donation_summary
  WHERE portfolio_id = '30000000-0000-0000-0000-000000000002';
  IF NOT FOUND OR v_zero.total_donations <> 0 THEN
    RAISE EXCEPTION 'zero-donation portfolio must still have a summary row';
  END IF;
END;
$$;

-- Pledge installment status, pledge events, generated tasks, and task events
-- must commit or roll back together inside update_pledge_installment_status.
INSERT INTO public.donors (
  id, org_id, first_name, last_name
) VALUES (
  '81000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Schema',
  'Donor'
);

INSERT INTO public.pledges (
  id, org_id, donor_id, total_amount, start_date, status
) VALUES (
  '82000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  200,
  CURRENT_DATE,
  'active'
);

INSERT INTO public.pledge_installments (
  id, org_id, pledge_id, due_date, amount, status
) VALUES
  (
    '83000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    CURRENT_DATE,
    100,
    'pending'
  ),
  (
    '83000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    CURRENT_DATE + 1,
    100,
    'pending'
  );

INSERT INTO public.tasks (
  id, org_id, title, status, source, source_key
) VALUES
  (
    '84000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Installment success task',
    'open',
    'automation',
    'pledge_installment:83000000-0000-0000-0000-000000000001:due_soon'
  ),
  (
    '84000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Installment rollback task',
    'open',
    'automation',
    'pledge_installment:83000000-0000-0000-0000-000000000002:due_soon'
  );

SELECT public.update_pledge_installment_status(
  '20000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  'waive',
  NULL,
  NULL,
  NULL,
  false,
  'Schema behavior check'
);

DO $$
BEGIN
  IF (SELECT status FROM public.pledge_installments
      WHERE id = '83000000-0000-0000-0000-000000000001') <> 'waived'
     OR (SELECT status FROM public.tasks
         WHERE id = '84000000-0000-0000-0000-000000000001') <> 'cancelled'
     OR NOT EXISTS (
       SELECT 1 FROM public.pledge_events
       WHERE installment_id = '83000000-0000-0000-0000-000000000001'
         AND event_type = 'installment_waived'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.task_events
       WHERE task_id = '84000000-0000-0000-0000-000000000001'
         AND event_type = 'cancelled'
     ) THEN
    RAISE EXCEPTION 'pledge installment/task/event atomic success contract failed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.schema_check_reject_task_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.task_id = '84000000-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'forced task event failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schema_check_reject_task_event
  BEFORE INSERT ON public.task_events
  FOR EACH ROW EXECUTE FUNCTION public.schema_check_reject_task_event();

DO $$
BEGIN
  BEGIN
    PERFORM public.update_pledge_installment_status(
      '20000000-0000-0000-0000-000000000001',
      '82000000-0000-0000-0000-000000000001',
      '83000000-0000-0000-0000-000000000002',
      'write_off',
      NULL,
      NULL,
      NULL,
      false,
      'Forced rollback'
    );
    RAISE EXCEPTION 'expected forced task event failure';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'forced task event failure' THEN
        RAISE;
      END IF;
  END;

  IF (SELECT status FROM public.pledge_installments
      WHERE id = '83000000-0000-0000-0000-000000000002') <> 'pending'
     OR (SELECT status FROM public.tasks
         WHERE id = '84000000-0000-0000-0000-000000000002') <> 'open'
     OR EXISTS (
       SELECT 1 FROM public.pledge_events
       WHERE installment_id = '83000000-0000-0000-0000-000000000002'
     )
     OR EXISTS (
       SELECT 1 FROM public.task_events
       WHERE task_id = '84000000-0000-0000-0000-000000000002'
     ) THEN
    RAISE EXCEPTION 'pledge installment/task/event rollback contract failed';
  END IF;
END;
$$;

DROP TRIGGER schema_check_reject_task_event ON public.task_events;
DROP FUNCTION public.schema_check_reject_task_event();

-- A milestone terminal transition, generated-task settlement, and task event
-- must commit together through the scoped service-only RPC.
INSERT INTO public.grants (
  id, org_id, portfolio_id, holding_id, lifecycle_stage
) VALUES (
  '71000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003',
  'active'
);

INSERT INTO public.grant_milestones (
  id, grant_id, milestone_name, status
) VALUES
  (
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'Atomic success',
    'pending'
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000001',
    'Atomic rollback',
    'pending'
  );

INSERT INTO public.tasks (
  id, org_id, portfolio_id, title, status, source, source_key
) VALUES
  (
    '73000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Milestone success task',
    'open',
    'automation',
    'grant_milestone:72000000-0000-0000-0000-000000000001:due'
  ),
  (
    '73000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Milestone rollback task',
    'open',
    'automation',
    'grant_milestone:72000000-0000-0000-0000-000000000002:due'
  );

SELECT public.update_grant_milestone_with_task_sync(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003',
  '72000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '{"status":"completed"}'::jsonb
);

DO $$
BEGIN
  IF (SELECT status FROM public.grant_milestones
      WHERE id = '72000000-0000-0000-0000-000000000001') <> 'completed'
     OR (SELECT completed_date FROM public.grant_milestones
         WHERE id = '72000000-0000-0000-0000-000000000001') IS NULL
     OR (SELECT status FROM public.tasks
         WHERE id = '73000000-0000-0000-0000-000000000001') <> 'completed'
     OR NOT EXISTS (
       SELECT 1 FROM public.task_events
       WHERE task_id = '73000000-0000-0000-0000-000000000001'
         AND event_type = 'completed'
     ) THEN
    RAISE EXCEPTION 'milestone/task/event atomic success contract failed';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.update_grant_milestone_with_task_sync(
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000003',
      '72000000-0000-0000-0000-000000000002',
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      '{"status":"completed"}'::jsonb
    );
    RAISE EXCEPTION 'expected task-event actor FK failure';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  IF (SELECT status FROM public.grant_milestones
      WHERE id = '72000000-0000-0000-0000-000000000002') <> 'pending'
     OR (SELECT completed_date FROM public.grant_milestones
         WHERE id = '72000000-0000-0000-0000-000000000002') IS NOT NULL
     OR (SELECT status FROM public.tasks
         WHERE id = '73000000-0000-0000-0000-000000000002') <> 'open'
     OR EXISTS (
       SELECT 1 FROM public.task_events
       WHERE task_id = '73000000-0000-0000-0000-000000000002'
     ) THEN
    RAISE EXCEPTION 'milestone/task/event rollback contract failed';
  END IF;
END;
$$;

-- A workflow step, its linked platform task, its audit event, and the parent
-- workflow completion state must commit or roll back as one operation.
INSERT INTO public.workflow_instances (
  id, org_id, name, workflow_type, status, created_by
) VALUES
  (
    '85000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Workflow atomic success',
    'custom',
    'active',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '85000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Workflow atomic rollback',
    'custom',
    'active',
    '10000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.tasks (
  id, org_id, title, status, source, assigned_to, created_by
) VALUES
  (
    '86000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Workflow success task',
    'open',
    'template',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '86000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Workflow rollback task',
    'open',
    'template',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.workflow_tasks (
  id, workflow_id, task_id, step_id, name, status, is_required
) VALUES
  (
    '87000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001',
    'success',
    'Atomic success',
    'pending',
    true
  ),
  (
    '87000000-0000-0000-0000-000000000002',
    '85000000-0000-0000-0000-000000000002',
    '86000000-0000-0000-0000-000000000002',
    'rollback',
    'Atomic rollback',
    'pending',
    true
  );

SELECT public.update_workflow_task_with_linked_task(
  '20000000-0000-0000-0000-000000000001',
  '85000000-0000-0000-0000-000000000001',
  '87000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  false,
  '{"status":"completed","outcome":"pass","outcome_notes":"Verified"}'::jsonb
);

DO $$
BEGIN
  IF (SELECT status FROM public.workflow_tasks
      WHERE id = '87000000-0000-0000-0000-000000000001') <> 'completed'
     OR (SELECT completed_by FROM public.workflow_tasks
         WHERE id = '87000000-0000-0000-0000-000000000001')
        IS DISTINCT FROM '10000000-0000-0000-0000-000000000001'::uuid
     OR (SELECT status FROM public.tasks
         WHERE id = '86000000-0000-0000-0000-000000000001') <> 'completed'
     OR (SELECT status FROM public.workflow_instances
         WHERE id = '85000000-0000-0000-0000-000000000001') <> 'completed'
     OR NOT EXISTS (
       SELECT 1 FROM public.task_events
       WHERE task_id = '86000000-0000-0000-0000-000000000001'
         AND actor_id = '10000000-0000-0000-0000-000000000001'
         AND event_type = 'completed'
     ) THEN
    RAISE EXCEPTION 'workflow task synchronization atomic success contract failed';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.update_workflow_task_with_linked_task(
      '20000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000002',
      '87000000-0000-0000-0000-000000000002',
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      false,
      '{"status":"in_progress"}'::jsonb
    );
    RAISE EXCEPTION 'expected workflow task authorization failure';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  IF (SELECT status FROM public.workflow_tasks
      WHERE id = '87000000-0000-0000-0000-000000000002') <> 'pending'
     OR (SELECT status FROM public.tasks
         WHERE id = '86000000-0000-0000-0000-000000000002') <> 'open'
     OR EXISTS (
       SELECT 1 FROM public.task_events
       WHERE task_id = '86000000-0000-0000-0000-000000000002'
     ) THEN
    RAISE EXCEPTION 'workflow task authorization failure changed state';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.schema_check_reject_workflow_task_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.task_id = '86000000-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'forced workflow task event failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schema_check_reject_workflow_task_event
  BEFORE INSERT ON public.task_events
  FOR EACH ROW EXECUTE FUNCTION public.schema_check_reject_workflow_task_event();

DO $$
BEGIN
  BEGIN
    PERFORM public.update_workflow_task_with_linked_task(
      '20000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000002',
      '87000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      true,
      '{"status":"completed","outcome":"pass"}'::jsonb
    );
    RAISE EXCEPTION 'expected forced workflow task event failure';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'forced workflow task event failure' THEN
        RAISE;
      END IF;
  END;

  IF (SELECT status FROM public.workflow_tasks
      WHERE id = '87000000-0000-0000-0000-000000000002') <> 'pending'
     OR (SELECT completed_at FROM public.workflow_tasks
         WHERE id = '87000000-0000-0000-0000-000000000002') IS NOT NULL
     OR (SELECT outcome FROM public.workflow_tasks
         WHERE id = '87000000-0000-0000-0000-000000000002') IS NOT NULL
     OR (SELECT status FROM public.tasks
         WHERE id = '86000000-0000-0000-0000-000000000002') <> 'open'
     OR (SELECT status FROM public.workflow_instances
         WHERE id = '85000000-0000-0000-0000-000000000002') <> 'active'
     OR EXISTS (
       SELECT 1 FROM public.task_events
       WHERE task_id = '86000000-0000-0000-0000-000000000002'
     ) THEN
    RAISE EXCEPTION 'workflow task synchronization rollback contract failed';
  END IF;
END;
$$;

DROP TRIGGER schema_check_reject_workflow_task_event ON public.task_events;
DROP FUNCTION public.schema_check_reject_workflow_task_event();

-- RF-06: task rows, entity links, comments, audit events, milestone reverse
-- synchronization, and completion outbox handoff use database transactions.
SELECT public.create_task_with_relations(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '{"title":"RF-06 atomic task","source_key":"rf06-create-success"}'::jsonb,
  '[{"entity_type":"donor","entity_id":"81000000-0000-0000-0000-000000000001","relationship":"primary"}]'::jsonb
);

DO $$
DECLARE
  v_task_id uuid;
BEGIN
  SELECT id INTO v_task_id FROM public.tasks
  WHERE org_id = '20000000-0000-0000-0000-000000000001'
    AND source_key = 'rf06-create-success';

  IF v_task_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.task_entity_links
       WHERE task_id = v_task_id
         AND org_id = '20000000-0000-0000-0000-000000000001'
         AND entity_type = 'donor'
         AND entity_id = '81000000-0000-0000-0000-000000000001'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.task_events
       WHERE task_id = v_task_id AND event_type = 'created'
     ) THEN
    RAISE EXCEPTION 'atomic task creation contract failed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.schema_check_reject_rf06_create_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'created'
     AND NEW.after_values ->> 'source_key' = 'rf06-create-rollback' THEN
    RAISE EXCEPTION 'forced RF-06 create event failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schema_check_reject_rf06_create_event
  BEFORE INSERT ON public.task_events
  FOR EACH ROW EXECUTE FUNCTION public.schema_check_reject_rf06_create_event();

DO $$
BEGIN
  BEGIN
    PERFORM public.create_task_with_relations(
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '{"title":"Must roll back","source_key":"rf06-create-rollback"}'::jsonb,
      '[{"entity_type":"donor","entity_id":"81000000-0000-0000-0000-000000000001"}]'::jsonb
    );
    RAISE EXCEPTION 'expected RF-06 create event failure';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'forced RF-06 create event failure' THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.tasks WHERE source_key = 'rf06-create-rollback'
  ) THEN
    RAISE EXCEPTION 'task create rollback left a task or dependent row';
  END IF;
END;
$$;

DROP TRIGGER schema_check_reject_rf06_create_event ON public.task_events;
DROP FUNCTION public.schema_check_reject_rf06_create_event();

CREATE OR REPLACE FUNCTION public.schema_check_reject_rf06_update_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.task_id = (
    SELECT id FROM public.tasks WHERE source_key = 'rf06-create-success'
  ) AND NEW.event_type = 'status_changed' THEN
    RAISE EXCEPTION 'forced RF-06 update event failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schema_check_reject_rf06_update_event
  BEFORE INSERT ON public.task_events
  FOR EACH ROW EXECUTE FUNCTION public.schema_check_reject_rf06_update_event();

DO $$
DECLARE
  v_task_id uuid;
BEGIN
  SELECT id INTO v_task_id FROM public.tasks WHERE source_key = 'rf06-create-success';
  BEGIN
    PERFORM public.update_task_with_event(
      '20000000-0000-0000-0000-000000000001',
      v_task_id,
      '10000000-0000-0000-0000-000000000001',
      true,
      '{"title":"Changed despite failure"}'::jsonb
    );
    RAISE EXCEPTION 'expected RF-06 update event failure';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'forced RF-06 update event failure' THEN RAISE; END IF;
  END;

  IF (SELECT title FROM public.tasks WHERE id = v_task_id) <> 'RF-06 atomic task'
     OR (SELECT COUNT(*) FROM public.task_events WHERE task_id = v_task_id) <> 1 THEN
    RAISE EXCEPTION 'task update/event rollback contract failed';
  END IF;
END;
$$;

DROP TRIGGER schema_check_reject_rf06_update_event ON public.task_events;
DROP FUNCTION public.schema_check_reject_rf06_update_event();

CREATE OR REPLACE FUNCTION public.schema_check_reject_rf06_comment_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.task_id = (
    SELECT id FROM public.tasks WHERE source_key = 'rf06-create-success'
  ) AND NEW.event_type = 'commented' THEN
    RAISE EXCEPTION 'forced RF-06 comment event failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schema_check_reject_rf06_comment_event
  BEFORE INSERT ON public.task_events
  FOR EACH ROW EXECUTE FUNCTION public.schema_check_reject_rf06_comment_event();

DO $$
DECLARE
  v_task_id uuid;
BEGIN
  SELECT id INTO v_task_id FROM public.tasks WHERE source_key = 'rf06-create-success';
  BEGIN
    PERFORM public.add_task_comment_with_event(
      '20000000-0000-0000-0000-000000000001',
      v_task_id,
      '10000000-0000-0000-0000-000000000001',
      'Must roll back'
    );
    RAISE EXCEPTION 'expected RF-06 comment event failure';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'forced RF-06 comment event failure' THEN RAISE; END IF;
  END;

  IF EXISTS (SELECT 1 FROM public.task_comments WHERE task_id = v_task_id)
     OR (SELECT COUNT(*) FROM public.task_events WHERE task_id = v_task_id) <> 1 THEN
    RAISE EXCEPTION 'task comment/event rollback contract failed';
  END IF;
END;
$$;

DROP TRIGGER schema_check_reject_rf06_comment_event ON public.task_events;
DROP FUNCTION public.schema_check_reject_rf06_comment_event();

-- Generated tasks use the same atomicity contract rather than compensating
-- task/link/event writes in the worker process.
DO $$
DECLARE
  v_result text;
  v_task_id uuid;
BEGIN
  v_result := public.upsert_generated_task(
    '20000000-0000-0000-0000-000000000001',
    '{
      "title":"RF-06 generated task",
      "description":"Initial description",
      "priority":"normal",
      "task_type":"follow_up",
      "source_key":"rf06-generated-success",
      "due_at":"2026-09-01T00:00:00Z",
      "metadata":{"producer":"schema_check","reason":"initial","source_status":"open"}
    }'::jsonb,
    '[{"entity_type":"donor","entity_id":"81000000-0000-0000-0000-000000000001"}]'::jsonb,
    false
  );
  IF v_result <> 'created' THEN
    RAISE EXCEPTION 'generated task create returned %', v_result;
  END IF;

  v_result := public.upsert_generated_task(
    '20000000-0000-0000-0000-000000000001',
    '{
      "title":"RF-06 generated task refreshed",
      "description":"Updated description",
      "priority":"high",
      "task_type":"follow_up",
      "source_key":"rf06-generated-success",
      "due_at":"2026-09-02T00:00:00Z",
      "assigned_to":"10000000-0000-0000-0000-000000000001",
      "metadata":{"producer":"schema_check","reason":"refresh","source_status":"open"}
    }'::jsonb,
    '[
      {"entity_type":"donor","entity_id":"81000000-0000-0000-0000-000000000001"},
      {"entity_type":"portfolio","entity_id":"30000000-0000-0000-0000-000000000001","relationship":"context"}
    ]'::jsonb,
    false
  );
  SELECT id INTO v_task_id FROM public.tasks
  WHERE org_id = '20000000-0000-0000-0000-000000000001'
    AND source_key = 'rf06-generated-success';

  IF v_result <> 'updated'
     OR (SELECT COUNT(*) FROM public.tasks
         WHERE org_id = '20000000-0000-0000-0000-000000000001'
           AND source_key = 'rf06-generated-success') <> 1
     OR (SELECT title FROM public.tasks WHERE id = v_task_id)
        <> 'RF-06 generated task refreshed'
     OR (SELECT COUNT(*) FROM public.task_entity_links WHERE task_id = v_task_id) <> 2
     OR (SELECT COUNT(*) FROM public.task_events
         WHERE task_id = v_task_id AND event_type = 'created') <> 1
     OR (SELECT COUNT(*) FROM public.task_events
         WHERE task_id = v_task_id AND event_type = 'due_date_changed') <> 1
     OR (SELECT COUNT(*) FROM public.task_events
         WHERE task_id = v_task_id AND event_type = 'assigned') <> 1 THEN
    RAISE EXCEPTION 'generated task atomic upsert/idempotency contract failed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.schema_check_reject_rf06_generated_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'created'
     AND NEW.after_values ->> 'source_key' = 'rf06-generated-rollback' THEN
    RAISE EXCEPTION 'forced RF-06 generated event failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schema_check_reject_rf06_generated_event
  BEFORE INSERT ON public.task_events
  FOR EACH ROW EXECUTE FUNCTION public.schema_check_reject_rf06_generated_event();

DO $$
BEGIN
  BEGIN
    PERFORM public.upsert_generated_task(
      '20000000-0000-0000-0000-000000000001',
      '{
        "title":"Generated task must roll back",
        "priority":"normal",
        "task_type":"task",
        "source_key":"rf06-generated-rollback",
        "metadata":{"producer":"schema_check","reason":"rollback","source_status":"open"}
      }'::jsonb,
      '[{"entity_type":"donor","entity_id":"81000000-0000-0000-0000-000000000001"}]'::jsonb,
      false
    );
    RAISE EXCEPTION 'expected RF-06 generated event failure';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'forced RF-06 generated event failure' THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.tasks WHERE source_key = 'rf06-generated-rollback'
  ) THEN
    RAISE EXCEPTION 'generated task event failure left partial state';
  END IF;
END;
$$;

DROP TRIGGER schema_check_reject_rf06_generated_event ON public.task_events;
DROP FUNCTION public.schema_check_reject_rf06_generated_event();

SELECT public.settle_generated_tasks(
  '20000000-0000-0000-0000-000000000001',
  'rf06-generated-success',
  false,
  'completed',
  'Schema behavior verified',
  '10000000-0000-0000-0000-000000000001'
);

DO $$
DECLARE
  v_task_id uuid;
BEGIN
  SELECT id INTO v_task_id FROM public.tasks
  WHERE source_key = 'rf06-generated-success';
  IF (SELECT status FROM public.tasks WHERE id = v_task_id) <> 'completed'
     OR (SELECT COUNT(*) FROM public.task_events
         WHERE task_id = v_task_id AND event_type = 'completed') <> 1
     OR (SELECT COUNT(*) FROM public.task_automation_outbox
         WHERE task_id = v_task_id) <> 1 THEN
    RAISE EXCEPTION 'generated task settlement/event/outbox atomicity contract failed';
  END IF;
END;
$$;

INSERT INTO public.grant_milestones (
  id, grant_id, milestone_name, status
) VALUES
  (
    '88000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'RF-06 completion success',
    'pending'
  ),
  (
    '88000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000001',
    'RF-06 completion rollback',
    'pending'
  ),
  (
    '88000000-0000-0000-0000-000000000003',
    '71000000-0000-0000-0000-000000000001',
    'RF-06 PATCH completion success',
    'pending'
  );

INSERT INTO public.tasks (
  id, org_id, title, status, source, source_key, assigned_to, created_by, metadata
) VALUES
  (
    '89000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'RF-06 completion success',
    'open',
    'automation',
    'rf06-complete-success',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '{"producer":"grant_obligations"}'::jsonb
  ),
  (
    '89000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'RF-06 completion rollback',
    'open',
    'automation',
    'rf06-complete-rollback',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '{"producer":"grant_obligations"}'::jsonb
  ),
  (
    '89000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'RF-06 PATCH completion success',
    'open',
    'automation',
    'rf06-update-complete-success',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '{"producer":"grant_obligations"}'::jsonb
  );

INSERT INTO public.task_entity_links (
  task_id, org_id, entity_type, entity_id, relationship
) VALUES
  (
    '89000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'grant_milestone',
    '88000000-0000-0000-0000-000000000001',
    'primary'
  ),
  (
    '89000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'grant_milestone',
    '88000000-0000-0000-0000-000000000002',
    'primary'
  ),
  (
    '89000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'grant_milestone',
    '88000000-0000-0000-0000-000000000003',
    'primary'
  );

SELECT public.update_task_with_event(
  '20000000-0000-0000-0000-000000000001',
  '89000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  true,
  '{"status":"completed"}'::jsonb
);

DO $$
BEGIN
  IF (SELECT status FROM public.tasks
      WHERE id = '89000000-0000-0000-0000-000000000003') <> 'completed'
     OR (SELECT status FROM public.grant_milestones
         WHERE id = '88000000-0000-0000-0000-000000000003') <> 'completed'
     OR (SELECT COUNT(*) FROM public.task_events
         WHERE task_id = '89000000-0000-0000-0000-000000000003'
           AND event_type = 'completed') <> 1
     OR (SELECT COUNT(*) FROM public.task_automation_outbox
         WHERE task_id = '89000000-0000-0000-0000-000000000003') <> 1 THEN
    RAISE EXCEPTION 'task PATCH completion/milestone/outbox contract failed';
  END IF;
END;
$$;

SELECT public.set_task_completion_state(
  '20000000-0000-0000-0000-000000000001',
  '89000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  false,
  'complete'
);
SELECT public.set_task_completion_state(
  '20000000-0000-0000-0000-000000000001',
  '89000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  false,
  'complete'
);

DO $$
DECLARE
  v_outbox_id uuid;
  v_claimed int;
BEGIN
  IF (SELECT status FROM public.tasks
      WHERE id = '89000000-0000-0000-0000-000000000001') <> 'completed'
     OR (SELECT status FROM public.grant_milestones
         WHERE id = '88000000-0000-0000-0000-000000000001') <> 'completed'
     OR (SELECT COUNT(*) FROM public.task_events
         WHERE task_id = '89000000-0000-0000-0000-000000000001'
           AND event_type = 'completed') <> 1
     OR (SELECT COUNT(*) FROM public.task_automation_outbox
         WHERE task_id = '89000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'task completion/milestone/outbox success or idempotency contract failed';
  END IF;

  SELECT id INTO v_outbox_id FROM public.task_automation_outbox
  WHERE task_id = '89000000-0000-0000-0000-000000000001';
  SELECT COUNT(*) INTO v_claimed FROM public.claim_task_automation_outbox(
    1,
    '20000000-0000-0000-0000-000000000001',
    v_outbox_id
  );
  IF v_claimed <> 1 THEN
    RAISE EXCEPTION 'task automation outbox event was not claimable';
  END IF;
  PERFORM public.finish_task_automation_outbox(v_outbox_id, true, NULL);
  IF (SELECT status FROM public.task_automation_outbox WHERE id = v_outbox_id) <> 'completed'
     OR (SELECT attempts FROM public.task_automation_outbox WHERE id = v_outbox_id) <> 1
     OR (SELECT COUNT(*) FROM public.claim_task_automation_outbox(
       1,
       '20000000-0000-0000-0000-000000000001',
       v_outbox_id
     )) <> 0 THEN
    RAISE EXCEPTION 'task automation outbox completion/idempotency contract failed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.schema_check_reject_rf06_outbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.task_id = '89000000-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'forced RF-06 outbox failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schema_check_reject_rf06_outbox
  BEFORE INSERT ON public.task_automation_outbox
  FOR EACH ROW EXECUTE FUNCTION public.schema_check_reject_rf06_outbox();

DO $$
BEGIN
  BEGIN
    PERFORM public.set_task_completion_state(
      '20000000-0000-0000-0000-000000000001',
      '89000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      true,
      'complete'
    );
    RAISE EXCEPTION 'expected RF-06 outbox failure';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'forced RF-06 outbox failure' THEN RAISE; END IF;
  END;

  IF (SELECT status FROM public.tasks
      WHERE id = '89000000-0000-0000-0000-000000000002') <> 'open'
     OR (SELECT status FROM public.grant_milestones
         WHERE id = '88000000-0000-0000-0000-000000000002') <> 'pending'
     OR EXISTS (
       SELECT 1 FROM public.task_events
       WHERE task_id = '89000000-0000-0000-0000-000000000002'
     )
     OR EXISTS (
       SELECT 1 FROM public.task_automation_outbox
       WHERE task_id = '89000000-0000-0000-0000-000000000002'
     ) THEN
    RAISE EXCEPTION 'task completion/milestone/event/outbox rollback contract failed';
  END IF;
END;
$$;

DROP TRIGGER schema_check_reject_rf06_outbox ON public.task_automation_outbox;
DROP FUNCTION public.schema_check_reject_rf06_outbox();

-- Custom-field batches must leave no partial values or automation intents if a
-- later value fails database validation. Successful batches create exactly one
-- durable event per changed field, which workers can claim and settle once.
INSERT INTO public.org_custom_field_definitions (
  id, org_id, entity_type, field_key, field_label, field_type
) VALUES
  (
    '86000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'holding', 'atomic_score', 'Atomic score', 'integer'
  ),
  (
    '86000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'holding', 'atomic_note', 'Atomic note', 'text'
  );

DO $$
BEGIN
  BEGIN
    PERFORM public.mutate_custom_field_values(
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'holding',
      '40000000-0000-0000-0000-000000000003',
      jsonb_build_array(
        jsonb_build_object(
          'field_definition_id', '86000000-0000-0000-0000-000000000001',
          'value_numeric', 4
        ),
        jsonb_build_object(
          'field_definition_id', '86000000-0000-0000-0000-000000000002',
          'value_numeric', 9
        )
      )
    );
    RAISE EXCEPTION 'expected custom-field type validation failure';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.org_custom_field_values
    WHERE entity_id = '40000000-0000-0000-0000-000000000003'
  ) OR EXISTS (
    SELECT 1 FROM public.org_automation_outbox
    WHERE entity_id = '40000000-0000-0000-0000-000000000003'
  ) THEN
    RAISE EXCEPTION 'custom-field batch failure left partial values or outbox events';
  END IF;
END;
$$;

DO $$
DECLARE
  v_result jsonb;
  v_outbox_id uuid;
BEGIN
  v_result := public.mutate_custom_field_values(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'holding',
    '40000000-0000-0000-0000-000000000003',
    jsonb_build_array(
      jsonb_build_object(
        'field_definition_id', '86000000-0000-0000-0000-000000000001',
        'value_numeric', 4
      ),
      jsonb_build_object(
        'field_definition_id', '86000000-0000-0000-0000-000000000002',
        'value_text', 'ready'
      )
    )
  );

  IF (SELECT COUNT(*) FROM public.org_custom_field_values
      WHERE entity_id = '40000000-0000-0000-0000-000000000003') <> 2
     OR (SELECT COUNT(*) FROM public.org_automation_outbox
         WHERE entity_id = '40000000-0000-0000-0000-000000000003') <> 2
     OR jsonb_array_length(v_result->'outbox_event_ids') <> 2 THEN
    RAISE EXCEPTION 'custom-field batch success did not commit values and events together';
  END IF;

  SELECT (v_result->'outbox_event_ids'->>0)::uuid INTO v_outbox_id;
  IF (SELECT COUNT(*) FROM public.claim_org_automation_outbox(
        1,
        '20000000-0000-0000-0000-000000000001',
        v_outbox_id
      )) <> 1 THEN
    RAISE EXCEPTION 'custom-field automation outbox event was not claimable';
  END IF;
  PERFORM public.finish_org_automation_outbox(v_outbox_id, true, NULL);
  IF (SELECT status FROM public.org_automation_outbox WHERE id = v_outbox_id) <> 'completed'
     OR (SELECT COUNT(*) FROM public.claim_org_automation_outbox(
       1,
       '20000000-0000-0000-0000-000000000001',
       v_outbox_id
     )) <> 0 THEN
    RAISE EXCEPTION 'custom-field automation outbox completion/idempotency contract failed';
  END IF;
END;
$$;

-- Invitation acceptance must atomically activate membership, finalize the
-- invite, and write one audit row. Repeating the same token/user is safe.
INSERT INTO public.org_invitations (
  id, org_id, invited_by, email, role, token, expires_at
) VALUES (
  '87000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'schema-check@example.test',
  'member',
  'schema-accept-token',
  now() + interval '1 day'
);

SELECT public.accept_org_invitation(
  '20000000-0000-0000-0000-000000000001',
  '87000000-0000-0000-0000-000000000001',
  'schema-accept-token',
  '10000000-0000-0000-0000-000000000001'
);
SELECT public.accept_org_invitation(
  '20000000-0000-0000-0000-000000000001',
  '87000000-0000-0000-0000-000000000001',
  'schema-accept-token',
  '10000000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
  IF (SELECT status FROM public.org_invitations
      WHERE id = '87000000-0000-0000-0000-000000000001') <> 'accepted'
     OR (SELECT accepted_at IS NULL FROM public.organization_members
         WHERE org_id = '20000000-0000-0000-0000-000000000001'
           AND user_id = '10000000-0000-0000-0000-000000000001')
     OR (SELECT COUNT(*) FROM public.org_audit_log
         WHERE target_id = '87000000-0000-0000-0000-000000000001'
           AND action = 'invite_accepted') <> 1 THEN
    RAISE EXCEPTION 'invitation acceptance atomic/idempotency contract failed';
  END IF;
END;
$$;

-- Onboarding durable turns persist the user request before model work, then
-- atomically commit the assistant reply, extracted state, and telemetry. A
-- failed completion leaves the turn retry-safe without partial assistant data.
INSERT INTO public.onboarding_sessions (
  id, user_id, status, quick_intake, conversation_state, intake_completed_at
) VALUES (
  '91000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'conversation',
  '{"org_name":"Schema onboarding"}'::jsonb,
  '{"topics_covered":[],"confidence_scores":{"pain_points":0,"goals":0,"workflows":0,"team":0},"message_count":0,"ready_for_recommendations":false}'::jsonb,
  now()
);
INSERT INTO public.onboarding_profiles (session_id)
VALUES ('91000000-0000-0000-0000-000000000001');
INSERT INTO public.onboarding_analytics (session_id)
VALUES ('91000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  v_begin jsonb;
  v_turn_id uuid;
  v_response jsonb := '{"message":"Schema reply","extractions":{"goals":[]},"conversation_state":{"topics_covered":["goals"],"confidence_scores":{"pain_points":0,"goals":1,"workflows":0,"team":0},"message_count":1,"ready_for_recommendations":true},"ready_for_recommendations":true}'::jsonb;
BEGIN
  v_begin := public.begin_onboarding_turn(
    '91000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000002',
    'Tell us about reporting'
  );
  v_turn_id := (v_begin->>'turn_id')::uuid;
  PERFORM public.complete_onboarding_turn(
    v_turn_id,
    '91000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Schema reply',
    '{"pain_points":[],"goals":[],"workflows":{"reporting":{"cadence":"monthly"}},"team_context":{}}'::jsonb,
    v_response->'conversation_state',
    true,
    v_response
  );
  IF (SELECT status FROM public.onboarding_turns WHERE id = v_turn_id) <> 'completed'
     OR (SELECT COUNT(*) FROM public.onboarding_messages WHERE turn_id = v_turn_id) <> 2
     OR (SELECT status FROM public.onboarding_sessions WHERE id = '91000000-0000-0000-0000-000000000001') <> 'recommendations'
     OR (SELECT workflows->'reporting'->>'cadence' FROM public.onboarding_profiles WHERE session_id = '91000000-0000-0000-0000-000000000001') <> 'monthly'
     OR (SELECT message_count FROM public.onboarding_analytics WHERE session_id = '91000000-0000-0000-0000-000000000001') <> 1
     OR (public.begin_onboarding_turn(
       '91000000-0000-0000-0000-000000000001',
       '10000000-0000-0000-0000-000000000001',
       '91000000-0000-0000-0000-000000000002',
       'Tell us about reporting'
     )->>'status') <> 'completed' THEN
    RAISE EXCEPTION 'onboarding durable turn completion/idempotency contract failed';
  END IF;
END;
$$;

INSERT INTO public.onboarding_sessions (id, user_id, status)
VALUES ('91000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'conversation');
INSERT INTO public.onboarding_profiles (session_id) VALUES ('91000000-0000-0000-0000-000000000003');
INSERT INTO public.onboarding_analytics (session_id) VALUES ('91000000-0000-0000-0000-000000000003');

CREATE OR REPLACE FUNCTION public.schema_check_reject_onboarding_analytics()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.session_id = '91000000-0000-0000-0000-000000000003'::uuid THEN
    RAISE EXCEPTION 'forced onboarding analytics failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER schema_check_reject_onboarding_analytics
  BEFORE UPDATE ON public.onboarding_analytics
  FOR EACH ROW EXECUTE FUNCTION public.schema_check_reject_onboarding_analytics();

DO $$
DECLARE v_turn_id uuid;
BEGIN
  v_turn_id := (public.begin_onboarding_turn(
    '91000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000004',
    'This completion should roll back'
  )->>'turn_id')::uuid;
  BEGIN
    PERFORM public.complete_onboarding_turn(
      v_turn_id, '91000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000001', 'Should not persist',
      '{"pain_points":[],"goals":[],"workflows":{},"team_context":{}}'::jsonb,
      '{"topics_covered":[],"confidence_scores":{},"message_count":1,"ready_for_recommendations":false}'::jsonb,
      false,
      '{"message":"Should not persist","extractions":{},"conversation_state":{},"ready_for_recommendations":false}'::jsonb
    );
    RAISE EXCEPTION 'expected onboarding analytics failure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forced onboarding analytics failure' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.onboarding_turns WHERE id = v_turn_id) <> 'in_progress'
     OR (SELECT COUNT(*) FROM public.onboarding_messages WHERE turn_id = v_turn_id) <> 1
     OR (SELECT status FROM public.onboarding_sessions WHERE id = '91000000-0000-0000-0000-000000000003') <> 'conversation' THEN
    RAISE EXCEPTION 'onboarding durable turn rollback contract failed';
  END IF;
  PERFORM public.fail_onboarding_turn(
    v_turn_id, '91000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001', 'forced_failure', 'forced onboarding analytics failure'
  );
END;
$$;
DROP TRIGGER schema_check_reject_onboarding_analytics ON public.onboarding_analytics;
DROP FUNCTION public.schema_check_reject_onboarding_analytics();

-- Onboarding provisioning uses the session as its idempotency key. Both a
-- successful replay and a late failure must leave a complete setup or nothing.
INSERT INTO public.onboarding_sessions (id, user_id, status, started_at)
VALUES ('91000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'recommendations', now());
INSERT INTO public.onboarding_profiles (session_id) VALUES ('91000000-0000-0000-0000-000000000005');
INSERT INTO public.onboarding_analytics (session_id) VALUES ('91000000-0000-0000-0000-000000000005');

DO $$
DECLARE
  v_first jsonb;
  v_replay jsonb;
BEGIN
  v_first := public.provision_onboarding_session(
    '91000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000002',
    'Schema provisioning organization', 'private_foundation', NULL,
    '{"portfolio":true,"impact_tracking":true}'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  v_replay := public.provision_onboarding_session(
    '91000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000002',
    'Ignored replay name', 'private_foundation', NULL,
    '{"portfolio":true}'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  IF v_first->>'org_id' IS NULL
     OR v_first->>'portfolio_id' IS NULL
     OR v_first->>'org_id' <> v_replay->>'org_id'
     OR (SELECT modules->>'impact_tracking' FROM public.organizations WHERE id = (v_first->>'org_id')::uuid) <> 'true'
     OR (SELECT status FROM public.onboarding_sessions WHERE id = '91000000-0000-0000-0000-000000000005') <> 'completed'
     OR (SELECT COUNT(*) FROM public.portfolios WHERE org_id = (v_first->>'org_id')::uuid) <> 1
     OR (SELECT COUNT(*) FROM public.portfolio_members WHERE portfolio_id = (v_first->>'portfolio_id')::uuid AND user_id = '10000000-0000-0000-0000-000000000002') <> 1 THEN
    RAISE EXCEPTION 'onboarding provisioning idempotency contract failed';
  END IF;
END;
$$;

INSERT INTO public.onboarding_sessions (id, user_id, status)
VALUES ('91000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003', 'recommendations');
INSERT INTO public.onboarding_profiles (session_id) VALUES ('91000000-0000-0000-0000-000000000006');
INSERT INTO public.onboarding_analytics (session_id) VALUES ('91000000-0000-0000-0000-000000000006');

DO $$
BEGIN
  BEGIN
    PERFORM public.provision_onboarding_session(
      '91000000-0000-0000-0000-000000000006',
      '10000000-0000-0000-0000-000000000003',
      'Rollback provisioning organization', 'private_foundation', NULL,
      '{"portfolio":true}'::jsonb,
      '[{"context_type":"invalid","context_key":"bad","context_value":"bad","source":"onboarding","is_active":true,"created_by":"10000000-0000-0000-0000-000000000003"}]'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
    );
    RAISE EXCEPTION 'expected provisioning configuration failure';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT org_id FROM public.onboarding_sessions WHERE id = '91000000-0000-0000-0000-000000000006') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.organizations WHERE name = 'Rollback provisioning organization') THEN
    RAISE EXCEPTION 'onboarding provisioning rollback contract failed';
  END IF;
END;
$$;

SELECT * FROM public.create_generated_letter(
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '{"letter_content":"one","summary_data":{"portfolio":{},"summary":{},"kpis":[],"holdings":[]}}'::jsonb
);
SELECT * FROM public.create_generated_letter(
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '{"malformed":true}'::jsonb
);

DO $$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM public.generated_documents
      WHERE portfolio_id = '30000000-0000-0000-0000-000000000001' AND document_type = 'letter')
     IS DISTINCT FROM ARRAY[1, 2] THEN
    RAISE EXCEPTION 'generated letter versions were not allocated monotonically';
  END IF;
END;
$$;

INSERT INTO public.charities (id, ein, name)
VALUES ('60000000-0000-0000-0000-000000000001', '12-3456789', 'Canonical charity');

SELECT public.link_holding_to_charity(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001'
);
SELECT public.link_holding_to_charity(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.investees WHERE charity_id = '60000000-0000-0000-0000-000000000001') <> 1
     OR (SELECT investee_id FROM public.holdings WHERE id = '40000000-0000-0000-0000-000000000001') IS NULL THEN
    RAISE EXCEPTION 'holding/charity linking was not idempotent';
  END IF;
END;
$$;

SELECT public.generate_risk_snapshot('30000000-0000-0000-0000-000000000001');
CREATE TEMP TABLE first_risk_created_at AS
  SELECT created_at FROM public.portfolio_risk_snapshots
  WHERE portfolio_id = '30000000-0000-0000-0000-000000000001';
SELECT pg_sleep(0.01);
SELECT public.generate_risk_snapshot('30000000-0000-0000-0000-000000000001');

DO $$
BEGIN
  IF (SELECT created_at FROM public.portfolio_risk_snapshots
      WHERE portfolio_id = '30000000-0000-0000-0000-000000000001')
     IS DISTINCT FROM (SELECT created_at FROM first_risk_created_at) THEN
    RAISE EXCEPTION 'risk snapshot upsert changed created_at';
  END IF;
END;
$$;

-- Payment numbers are per-grant and user visible, so two concurrent schedulers
-- must not be able to mint the same one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.grant_payments'::regclass
      AND contype = 'u'
      AND conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute
          WHERE attrelid = 'public.grant_payments'::regclass AND attname = 'grant_id'),
        (SELECT attnum FROM pg_attribute
          WHERE attrelid = 'public.grant_payments'::regclass AND attname = 'payment_number')
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION 'grant_payments is missing the (grant_id, payment_number) unique constraint';
  END IF;
END;
$$;

-- The invitation token is a bearer secret: it reaches the invitee through the
-- email outbox, never through the mutation's return payload.
DO $$
DECLARE v_source text;
BEGIN
  SELECT prosrc INTO v_source FROM pg_proc WHERE proname = 'mutate_org_invitation';
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'mutate_org_invitation is missing';
  END IF;
  IF v_source LIKE '%to_jsonb(v_invitation),%' THEN
    RAISE EXCEPTION 'mutate_org_invitation returns the raw invitation token';
  END IF;
END;
$$;

-- Elevated mutation RPCs stay reachable only through the service role.
DO $$
BEGIN
  IF has_function_privilege(
       'authenticated',
       'public.create_grant_payment(uuid, uuid, uuid, numeric, date, text, text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'create_grant_payment is executable by authenticated';
  END IF;
  IF NOT has_function_privilege(
       'service_role',
       'public.create_grant_payment(uuid, uuid, uuid, numeric, date, text, text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'create_grant_payment is not executable by service_role';
  END IF;
END;
$$;

ROLLBACK;
