-- =============================================================================
-- 0038_pledge_tracking.sql
-- Pledge tracking: enums, tables, RLS, RPCs, module registration
-- Depends on: 0001, 0002, 0014 (donors + contributions_received)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums (idempotent)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE pledge_frequency_enum AS ENUM (
    'one_time', 'monthly', 'quarterly', 'annually', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pledge_status_enum AS ENUM (
    'active', 'fulfilled', 'cancelled', 'defaulted', 'written_off'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pledge_commitment_type_enum AS ENUM (
    'verbal', 'written', 'online', 'imported'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pledge_installment_status_enum AS ENUM (
    'pending', 'paid', 'waived', 'written_off'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pledge_event_type_enum AS ENUM (
    'created', 'updated', 'schedule_changed',
    'installment_paid', 'installment_waived', 'installment_reopened',
    'cancelled', 'defaulted', 'written_off', 'fulfilled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- pledges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pledges (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  org_id                uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_id              uuid        NOT NULL,
  total_amount          numeric(20,2) NOT NULL CHECK (total_amount > 0),
  currency              text        NOT NULL DEFAULT 'USD',
  start_date            date        NOT NULL,
  end_date              date,
  frequency             pledge_frequency_enum NOT NULL DEFAULT 'one_time',
  status                pledge_status_enum    NOT NULL DEFAULT 'active',
  commitment_type       pledge_commitment_type_enum NOT NULL DEFAULT 'written',
  campaign              text,
  fund_designation      text,
  restriction_purpose   text,
  relationship_manager  uuid        REFERENCES auth.users(id),
  signed_at             timestamptz,
  source                text,
  external_id           text,
  notes                 text,
  custom_fields         jsonb       NOT NULL DEFAULT '{}',
  created_by            uuid        REFERENCES auth.users(id),
  cancelled_at          timestamptz,
  cancelled_by          uuid        REFERENCES auth.users(id),
  cancellation_reason   text,
  deleted_at            timestamptz,
  deleted_by            uuid        REFERENCES auth.users(id),
  CONSTRAINT pledges_end_after_start CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Cross-org donor guard: donor must belong to same org as pledge
DO $$ BEGIN
  ALTER TABLE public.donors ADD CONSTRAINT donors_org_id_id_unique UNIQUE (org_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.pledges
    ADD CONSTRAINT pledges_org_donor_fk
    FOREIGN KEY (org_id, donor_id)
    REFERENCES public.donors (org_id, id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_pledges_org_donor  ON public.pledges (org_id, donor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pledges_org_status ON public.pledges (org_id, status)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pledges_external_id ON public.pledges (org_id, source, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- pledge_installments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pledge_installments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pledge_id       uuid        NOT NULL,
  due_date        date        NOT NULL,
  amount          numeric(20,2) NOT NULL CHECK (amount > 0),
  status          pledge_installment_status_enum NOT NULL DEFAULT 'pending',
  paid_at         timestamptz,
  waived_at       timestamptz,
  written_off_at  timestamptz,
  acted_by        uuid        REFERENCES auth.users(id),
  payment_ref     text,
  contribution_id uuid,
  notes           text,
  CONSTRAINT installment_paid_requires_paid_at
    CHECK (status != 'paid' OR paid_at IS NOT NULL),
  CONSTRAINT installment_unpaid_no_paid_at
    CHECK (status = 'paid' OR paid_at IS NULL),
  CONSTRAINT installment_waived_requires_waived_at
    CHECK (status != 'waived' OR waived_at IS NOT NULL),
  CONSTRAINT installment_non_waived_no_waived_at
    CHECK (status = 'waived' OR waived_at IS NULL),
  CONSTRAINT installment_written_off_requires_ts
    CHECK (status != 'written_off' OR written_off_at IS NOT NULL),
  CONSTRAINT installment_non_written_off_no_ts
    CHECK (status = 'written_off' OR written_off_at IS NULL)
);

DO $$ BEGIN
  ALTER TABLE public.pledges ADD CONSTRAINT pledges_org_id_id_unique UNIQUE (org_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.pledge_installments
    ADD CONSTRAINT pledge_installments_org_pledge_fk
    FOREIGN KEY (org_id, pledge_id)
    REFERENCES public.pledges (org_id, id)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- contributions_received cross-org guard for installment link
DO $$ BEGIN
  ALTER TABLE public.contributions_received
    ADD CONSTRAINT contributions_received_org_id_id_unique UNIQUE (org_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.pledge_installments
    ADD CONSTRAINT pledge_installments_org_contribution_fk
    FOREIGN KEY (org_id, contribution_id)
    REFERENCES public.contributions_received (org_id, id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_installments_contribution_unique
  ON public.pledge_installments (contribution_id)
  WHERE contribution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_installments_pledge   ON public.pledge_installments (pledge_id, due_date);
CREATE INDEX IF NOT EXISTS idx_installments_org_due  ON public.pledge_installments (org_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_installments_overdue  ON public.pledge_installments (org_id, due_date)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- pledge_events  (immutable audit log — no DELETE policy for authenticated)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pledge_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  org_id         uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pledge_id      uuid        NOT NULL REFERENCES public.pledges(id) ON DELETE CASCADE,
  installment_id uuid        REFERENCES public.pledge_installments(id) ON DELETE SET NULL,
  event_type     pledge_event_type_enum NOT NULL,
  actor_id       uuid        REFERENCES auth.users(id),
  before_values  jsonb,
  after_values   jsonb,
  notes          text
);

CREATE INDEX IF NOT EXISTS idx_pledge_events_pledge ON public.pledge_events (pledge_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pledge_events_org    ON public.pledge_events (org_id,    created_at DESC);

-- ---------------------------------------------------------------------------
-- Extend contributions_received with installment pointer
-- ---------------------------------------------------------------------------
ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS pledge_installment_id uuid;

-- FK from contributions_received.pledge_id → pledges (was unconstrained before)
DO $$ BEGIN
  ALTER TABLE public.contributions_received
    ADD CONSTRAINT contributions_received_pledge_fk
    FOREIGN KEY (pledge_id)
    REFERENCES public.pledges(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.contributions_received
    ADD CONSTRAINT contributions_received_pledge_installment_fk
    FOREIGN KEY (pledge_installment_id)
    REFERENCES public.pledge_installments(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- v_pledge_pipeline view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pledge_pipeline AS
SELECT
  p.id,
  p.org_id,
  p.donor_id,
  p.total_amount,
  p.currency,
  p.frequency,
  p.status,
  p.start_date,
  p.end_date,
  p.campaign,
  p.fund_designation,
  p.relationship_manager,
  p.created_at,
  p.updated_at,
  CASE
    WHEN d.is_organization
      THEN COALESCE(d.organization_name, 'Unknown Organization')
    ELSE NULLIF(TRIM(COALESCE(d.first_name,'') || ' ' || COALESCE(d.last_name,'')), '')
  END AS donor_name,
  COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0)                                    AS received,
  COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'pending'), 0)                                 AS outstanding,
  COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'pending' AND i.due_date < CURRENT_DATE), 0)   AS overdue,
  MIN(i.due_date) FILTER (WHERE i.status = 'pending')                                            AS next_due_date,
  (SELECT i2.amount FROM public.pledge_installments i2
   WHERE i2.pledge_id = p.id AND i2.status = 'pending'
   ORDER BY i2.due_date ASC, i2.created_at ASC LIMIT 1)                                          AS next_due_amount,
  COUNT(i.id)                                                                                    AS installment_count,
  COUNT(i.id) FILTER (WHERE i.status = 'paid')                                                  AS paid_count,
  COUNT(i.id) FILTER (WHERE i.status IN ('paid','waived','written_off'))                         AS resolved_count,
  CASE
    WHEN p.status IN ('cancelled','defaulted','written_off') THEN p.status::text
    WHEN COUNT(i.id) > 0
      AND COUNT(i.id) = COUNT(i.id) FILTER (WHERE i.status IN ('paid','waived','written_off'))
      THEN 'fulfilled'
    WHEN EXISTS (
      SELECT 1 FROM public.pledge_installments oi
      WHERE oi.pledge_id = p.id AND oi.status = 'pending' AND oi.due_date < CURRENT_DATE
    ) THEN 'overdue'
    WHEN MIN(i.due_date) FILTER (WHERE i.status = 'pending') IS NOT NULL
      AND MIN(i.due_date) FILTER (WHERE i.status = 'pending') <= CURRENT_DATE + INTERVAL '30 days'
      THEN 'due_soon'
    ELSE 'on_track'
  END AS pipeline_status
FROM public.pledges p
JOIN public.donors d ON d.id = p.donor_id
LEFT JOIN public.pledge_installments i ON i.pledge_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, d.id;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.pledges              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pledge_installments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pledge_events        ENABLE ROW LEVEL SECURITY;

-- pledges
DO $$ BEGIN
  CREATE POLICY "pledges_read" ON public.pledges FOR SELECT TO authenticated
    USING (public.org_role_gte(org_id, 'member') AND public.org_has_module(org_id, 'pledge_tracking') AND deleted_at IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "pledges_insert" ON public.pledges FOR INSERT TO authenticated
    WITH CHECK (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "pledges_update" ON public.pledges FOR UPDATE TO authenticated
    USING (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking') AND deleted_at IS NULL)
    WITH CHECK (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "pledges_service" ON public.pledges FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- pledge_installments
DO $$ BEGIN
  CREATE POLICY "installments_read" ON public.pledge_installments FOR SELECT TO authenticated
    USING (public.org_role_gte(org_id, 'member') AND public.org_has_module(org_id, 'pledge_tracking'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "installments_insert" ON public.pledge_installments FOR INSERT TO authenticated
    WITH CHECK (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "installments_update" ON public.pledge_installments FOR UPDATE TO authenticated
    USING (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'))
    WITH CHECK (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "installments_service" ON public.pledge_installments FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- pledge_events (read-only for authenticated — writes happen exclusively via RPCs)
DO $$ BEGIN
  CREATE POLICY "events_read" ON public.pledge_events FOR SELECT TO authenticated
    USING (public.org_role_gte(org_id, 'member') AND public.org_has_module(org_id, 'pledge_tracking'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "events_service" ON public.pledge_events FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Update org_has_module to support pledge_tracking / donor_management aliases
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_has_module(p_org_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (modules->>(
        CASE p_module
          WHEN 'pledge_tracking'       THEN 'pledges'
          WHEN 'donor_management'      THEN 'donors'
          WHEN 'tax_optimization'      THEN 'tax'
          WHEN 'compliance_regulatory' THEN 'compliance'
          ELSE p_module
        END
      ))::boolean
      FROM organizations
      WHERE id = p_org_id
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Register pledges module in module_definitions
-- ---------------------------------------------------------------------------
INSERT INTO public.module_definitions (slug, label, description, depends_on, is_core)
VALUES ('pledges', 'Pledge Tracking', 'Donor commitment tracking with installment schedules', ARRAY['donors'], false)
ON CONFLICT (slug) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  depends_on  = EXCLUDED.depends_on;

-- ---------------------------------------------------------------------------
-- RPC: create_pledge_with_installments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pledge_with_installments(
  p_org_id              uuid,
  p_donor_id            uuid,
  p_total_amount        numeric,
  p_currency            text,
  p_start_date          date,
  p_end_date            date,
  p_frequency           pledge_frequency_enum,
  p_commitment_type     pledge_commitment_type_enum,
  p_campaign            text,
  p_fund_designation    text,
  p_restriction_purpose text,
  p_relationship_manager uuid,
  p_signed_at           timestamptz,
  p_notes               text,
  p_installments        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pledge_id  uuid;
  v_inst       jsonb;
  v_inst_sum   numeric := 0;
  v_inst_count int;
  v_actor      uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT can_edit_org(p_org_id)              THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT org_has_module(p_org_id, 'pledges') THEN RAISE EXCEPTION 'Pledge tracking module not enabled'; END IF;
  IF NOT org_has_module(p_org_id, 'donors')  THEN RAISE EXCEPTION 'Donor management module not enabled'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM donors WHERE id = p_donor_id AND org_id = p_org_id AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Donor not found in this organization'; END IF;

  v_inst_count := jsonb_array_length(p_installments);
  IF v_inst_count = 0 THEN RAISE EXCEPTION 'At least one installment is required'; END IF;

  FOR v_inst IN SELECT * FROM jsonb_array_elements(p_installments) LOOP
    IF (v_inst->>'amount')::numeric <= 0 THEN RAISE EXCEPTION 'Installment amount must be greater than zero'; END IF;
    IF (v_inst->>'due_date') IS NULL       THEN RAISE EXCEPTION 'Installment due_date is required'; END IF;
    v_inst_sum := v_inst_sum + (v_inst->>'amount')::numeric;
  END LOOP;

  IF ABS(v_inst_sum - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Installment sum (%) does not equal pledge total (%)', v_inst_sum, p_total_amount;
  END IF;

  INSERT INTO pledges (
    org_id, donor_id, total_amount, currency, start_date, end_date,
    frequency, status, commitment_type, campaign, fund_designation,
    restriction_purpose, relationship_manager, signed_at, notes, created_by
  ) VALUES (
    p_org_id, p_donor_id, p_total_amount, COALESCE(p_currency,'USD'), p_start_date, p_end_date,
    p_frequency, 'active', COALESCE(p_commitment_type, 'written'::pledge_commitment_type_enum),
    p_campaign, p_fund_designation,
    p_restriction_purpose, p_relationship_manager, p_signed_at, p_notes, v_actor
  ) RETURNING id INTO v_pledge_id;

  FOR v_inst IN SELECT * FROM jsonb_array_elements(p_installments) LOOP
    INSERT INTO pledge_installments (pledge_id, org_id, due_date, amount, status, notes)
    VALUES (v_pledge_id, p_org_id, (v_inst->>'due_date')::date, (v_inst->>'amount')::numeric, 'pending', v_inst->>'notes');
  END LOOP;

  INSERT INTO pledge_events (org_id, pledge_id, event_type, actor_id, after_values)
  VALUES (p_org_id, v_pledge_id, 'created', v_actor,
    jsonb_build_object('total_amount', p_total_amount, 'installment_count', v_inst_count, 'frequency', p_frequency));

  RETURN jsonb_build_object('pledge_id', v_pledge_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_pledge_installment_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_pledge_installment_status(
  p_org_id             uuid,
  p_pledge_id          uuid,
  p_installment_id     uuid,
  p_action             text,
  p_paid_at            timestamptz,
  p_payment_ref        text,
  p_contribution_id    uuid,
  p_create_contribution boolean,
  p_notes              text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pledge      pledges%ROWTYPE;
  v_inst        pledge_installments%ROWTYPE;
  v_actor       uuid;
  v_contrib_id  uuid;
  v_all_done    boolean;
  v_event_type  pledge_event_type_enum;
  v_new_status  text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL                          THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT can_edit_org(p_org_id)               THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT org_has_module(p_org_id, 'pledges')  THEN RAISE EXCEPTION 'Module not enabled'; END IF;

  SELECT * INTO v_pledge FROM pledges
    WHERE id = p_pledge_id AND org_id = p_org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pledge not found'; END IF;
  IF v_pledge.status IN ('cancelled','defaulted') THEN
    RAISE EXCEPTION 'Cannot modify installments on a % pledge', v_pledge.status;
  END IF;

  SELECT * INTO v_inst FROM pledge_installments
    WHERE id = p_installment_id AND pledge_id = p_pledge_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Installment not found'; END IF;

  IF p_action = 'mark_paid' THEN
    IF v_inst.status = 'paid' THEN RAISE EXCEPTION 'Installment already paid'; END IF;
    v_event_type := 'installment_paid';
    v_new_status := 'paid';
    IF COALESCE(p_create_contribution, false) THEN
      INSERT INTO contributions_received (
        org_id, donor_id, amount, currency, contribution_date, gift_type,
        pledge_id, pledge_installment_id, is_pledge
      ) VALUES (
        p_org_id, v_pledge.donor_id, v_inst.amount, v_pledge.currency,
        COALESCE(p_paid_at::date, CURRENT_DATE), 'pledge',
        p_pledge_id, p_installment_id, true
      ) RETURNING id INTO v_contrib_id;
    ELSIF p_contribution_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM contributions_received
        WHERE id = p_contribution_id AND org_id = p_org_id AND donor_id = v_pledge.donor_id
      ) THEN RAISE EXCEPTION 'Contribution not found or belongs to different org/donor'; END IF;
      v_contrib_id := p_contribution_id;
    ELSE
      RAISE EXCEPTION 'mark_paid requires create_contribution=true or a contribution_id';
    END IF;
    UPDATE pledge_installments SET
      status = 'paid', paid_at = COALESCE(p_paid_at, now()), payment_ref = p_payment_ref,
      contribution_id = v_contrib_id, acted_by = v_actor,
      notes = COALESCE(p_notes, notes), updated_at = now()
    WHERE id = p_installment_id;

  ELSIF p_action = 'waive' THEN
    IF v_inst.status != 'pending' THEN RAISE EXCEPTION 'Can only waive pending installments'; END IF;
    v_event_type := 'installment_waived';
    v_new_status := 'waived';
    UPDATE pledge_installments SET
      status = 'waived', waived_at = now(), acted_by = v_actor,
      notes = COALESCE(p_notes, notes), updated_at = now()
    WHERE id = p_installment_id;

  ELSIF p_action = 'write_off' THEN
    IF v_inst.status != 'pending' THEN RAISE EXCEPTION 'Can only write off pending installments'; END IF;
    v_event_type := 'written_off';
    v_new_status := 'written_off';
    UPDATE pledge_installments SET
      status = 'written_off', written_off_at = now(), acted_by = v_actor,
      notes = COALESCE(p_notes, notes), updated_at = now()
    WHERE id = p_installment_id;

  ELSIF p_action = 'reopen' THEN
    IF v_inst.status = 'pending' THEN RAISE EXCEPTION 'Installment is already pending'; END IF;
    v_event_type := 'installment_reopened';
    v_new_status := 'pending';
    IF v_inst.status = 'paid' AND v_inst.contribution_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM contributions_received
        WHERE id = v_inst.contribution_id AND acknowledgment_sent = true
      ) THEN
        RAISE EXCEPTION 'Cannot reopen: linked contribution has been acknowledged';
      END IF;
      UPDATE contributions_received SET pledge_installment_id = NULL WHERE id = v_inst.contribution_id;
    END IF;
    UPDATE pledge_installments SET
      status = 'pending', paid_at = NULL, waived_at = NULL, written_off_at = NULL,
      contribution_id = NULL, payment_ref = NULL, acted_by = v_actor,
      notes = COALESCE(p_notes, notes), updated_at = now()
    WHERE id = p_installment_id;

  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;

  INSERT INTO pledge_events (org_id, pledge_id, installment_id, event_type, actor_id, before_values, after_values, notes)
  VALUES (p_org_id, p_pledge_id, p_installment_id, v_event_type, v_actor,
    jsonb_build_object('status', v_inst.status),
    jsonb_build_object('status', v_new_status),
    p_notes);

  -- Auto-fulfill pledge when all installments are resolved and at least one was paid
  SELECT (
    NOT EXISTS (SELECT 1 FROM pledge_installments WHERE pledge_id = p_pledge_id AND status = 'pending')
    AND EXISTS  (SELECT 1 FROM pledge_installments WHERE pledge_id = p_pledge_id AND status = 'paid')
  ) INTO v_all_done;

  IF v_all_done AND v_pledge.status = 'active' AND p_action != 'reopen' THEN
    UPDATE pledges SET status = 'fulfilled', updated_at = now() WHERE id = p_pledge_id;
    INSERT INTO pledge_events (org_id, pledge_id, event_type, actor_id)
    VALUES (p_org_id, p_pledge_id, 'fulfilled', v_actor);
  END IF;

  IF p_action = 'reopen' AND v_pledge.status = 'fulfilled' THEN
    UPDATE pledges SET status = 'active', updated_at = now() WHERE id = p_pledge_id;
    INSERT INTO pledge_events (org_id, pledge_id, event_type, actor_id)
    VALUES (p_org_id, p_pledge_id, 'updated', v_actor);
  END IF;

  RETURN jsonb_build_object('success', true, 'pledge_id', p_pledge_id, 'installment_id', p_installment_id);
END;
$$;
