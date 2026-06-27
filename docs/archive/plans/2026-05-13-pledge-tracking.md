# Pledge Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pledge tracking module — DB tables, RPC functions, REST API, and React UI — so fundraisers can record donor commitments, manage installment schedules, and see a live pipeline dashboard.

**Architecture:** Postgres enums + three new tables (`pledges`, `pledge_installments`, `pledge_events`) with composite FK cross-org guards; two SECURITY DEFINER RPC functions handle transactional mutations; Next.js API routes read via `v_pledge_pipeline` view and write via RPC; React client components use SWR.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), TypeScript, Tailwind CSS, Zod 3, SWR, Vitest

---

## File Map

| Action | Path |
|--------|------|
| Modify | `lib/modules/types.ts` |
| Modify | `lib/modules/registry.ts` |
| Modify | `lib/modules/client-info.ts` |
| Create | `db/migrations/0038_pledge_tracking.sql` |
| Create | `lib/pledges/schedule.ts` |
| Create | `lib/pledges/schedule.test.ts` |
| Create | `lib/schemas/pledge.ts` |
| Create | `app/api/org/[orgId]/pledges/route.ts` |
| Create | `app/api/org/[orgId]/pledges/[pledgeId]/route.ts` |
| Create | `app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts` |
| Create | `app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts` |
| Create | `components/pledges/PledgePipelineDashboard.tsx` |
| Create | `components/pledges/PledgeCreateModal.tsx` |
| Create | `components/pledges/PledgeDetailPanel.tsx` |
| Create | `app/dashboard/pledges/page.tsx` |
| Modify | `app/dashboard/donors/[donorId]/page.tsx` |
| Modify | `components/Header.tsx` |

---

## Task 1: Module System — TypeScript Types and Registry

**Files:**
- Modify: `lib/modules/types.ts`
- Modify: `lib/modules/registry.ts`
- Modify: `lib/modules/client-info.ts`

- [ ] **Step 1: Add `pledge_tracking` to ModuleId union and array**

Open `lib/modules/types.ts`. Add `'pledge_tracking'` after `'donor_management'` in both the union and the array:

```ts
export type ModuleId =
  | 'core'
  | 'impact_tracking'
  | 'reporting'
  | 'tax_optimization'
  | 'grant_management'
  | 'donor_management'
  | 'pledge_tracking'
  | 'external_data'
  | 'analytics'
  | 'compliance_regulatory';

export const ALL_MODULE_IDS: readonly ModuleId[] = [
  'core',
  'impact_tracking',
  'reporting',
  'tax_optimization',
  'grant_management',
  'donor_management',
  'pledge_tracking',
  'external_data',
  'analytics',
  'compliance_regulatory',
] as const;
```

- [ ] **Step 2: Add entry to MODULE_REGISTRY in `lib/modules/registry.ts`**

Add after the `donor_management` block (locate the closing `},` of that block):

```ts
  pledge_tracking: {
    id: 'pledge_tracking',
    name: 'Pledge Tracking',
    description: 'Track donor commitments, installment schedules, and pledge fulfillment',
    isCore: false,
    icon: 'calendar-check',
    dependencies: ['donor_management'],
    tools: [],
    tables: ['pledges', 'pledge_installments', 'pledge_events'],
    routes: ['/dashboard/pledges'],
    systemPromptAddition: `
Pledge tracking is enabled. Pledge AI tools are not available in this release.
`,
  },
```

- [ ] **Step 3: Add entry to MODULE_INFO in `lib/modules/client-info.ts`**

Add after the `donor_management` block:

```ts
  pledge_tracking: {
    id: 'pledge_tracking',
    name: 'Pledge Tracking',
    description: 'Track donor commitments, installment schedules, and pledge fulfillment',
    icon: 'calendar-check',
    routes: ['/dashboard/pledges'],
    dependencies: ['donor_management'],
    isCore: false,
  },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/modules/types.ts lib/modules/registry.ts lib/modules/client-info.ts
git commit -m "feat(pledges): add pledge_tracking module to registry"
```

---

## Task 2: Database Migration

**Files:**
- Create: `db/migrations/0038_pledge_tracking.sql`

- [ ] **Step 1: Create the migration file**

```bash
touch /Users/teddyhickenlooper/Desktop/benevolence-product/db/migrations/0038_pledge_tracking.sql
```

- [ ] **Step 2: Write the full migration**

Write the entire contents of `db/migrations/0038_pledge_tracking.sql`:

```sql
-- =============================================================================
-- 0038_pledge_tracking.sql
-- Pledge tracking: enums, tables, RLS, RPCs, module registration
-- Depends on: 0001, 0002, 0014 (donors + contributions_received)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE pledge_frequency_enum AS ENUM (
  'one_time', 'monthly', 'quarterly', 'annually', 'custom'
);

CREATE TYPE pledge_status_enum AS ENUM (
  'active', 'fulfilled', 'cancelled', 'defaulted', 'written_off'
);

CREATE TYPE pledge_commitment_type_enum AS ENUM (
  'verbal', 'written', 'online', 'imported'
);

CREATE TYPE pledge_installment_status_enum AS ENUM (
  'pending', 'paid', 'waived', 'written_off'
);

CREATE TYPE pledge_event_type_enum AS ENUM (
  'created', 'updated', 'schedule_changed',
  'installment_paid', 'installment_waived', 'installment_reopened',
  'cancelled', 'defaulted', 'written_off', 'fulfilled'
);

-- ---------------------------------------------------------------------------
-- pledges
-- ---------------------------------------------------------------------------
CREATE TABLE public.pledges (
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
ALTER TABLE public.donors
  ADD CONSTRAINT donors_org_id_id_unique UNIQUE (org_id, id);

ALTER TABLE public.pledges
  ADD CONSTRAINT pledges_org_donor_fk
  FOREIGN KEY (org_id, donor_id)
  REFERENCES public.donors (org_id, id)
  ON DELETE RESTRICT;

CREATE INDEX idx_pledges_org_donor  ON public.pledges (org_id, donor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pledges_org_status ON public.pledges (org_id, status)   WHERE deleted_at IS NULL;
CREATE INDEX idx_pledges_external_id ON public.pledges (org_id, source, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- pledge_installments
-- ---------------------------------------------------------------------------
CREATE TABLE public.pledge_installments (
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
    CHECK (status = 'paid' OR paid_at IS NULL)
);

ALTER TABLE public.pledges
  ADD CONSTRAINT pledges_org_id_id_unique UNIQUE (org_id, id);

ALTER TABLE public.pledge_installments
  ADD CONSTRAINT pledge_installments_org_pledge_fk
  FOREIGN KEY (org_id, pledge_id)
  REFERENCES public.pledges (org_id, id)
  ON DELETE CASCADE;

-- contributions_received cross-org guard for installment link
ALTER TABLE public.contributions_received
  ADD CONSTRAINT contributions_received_org_id_id_unique UNIQUE (org_id, id);

ALTER TABLE public.pledge_installments
  ADD CONSTRAINT pledge_installments_org_contribution_fk
  FOREIGN KEY (org_id, contribution_id)
  REFERENCES public.contributions_received (org_id, id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_installments_contribution_unique
  ON public.pledge_installments (contribution_id)
  WHERE contribution_id IS NOT NULL;

CREATE INDEX idx_installments_pledge   ON public.pledge_installments (pledge_id, due_date);
CREATE INDEX idx_installments_org_due  ON public.pledge_installments (org_id, status, due_date);
CREATE INDEX idx_installments_overdue  ON public.pledge_installments (org_id, due_date)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- pledge_events  (immutable audit log)
-- ---------------------------------------------------------------------------
CREATE TABLE public.pledge_events (
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

CREATE INDEX idx_pledge_events_pledge ON public.pledge_events (pledge_id, created_at DESC);
CREATE INDEX idx_pledge_events_org    ON public.pledge_events (org_id,    created_at DESC);

-- ---------------------------------------------------------------------------
-- Extend contributions_received with installment pointer
-- ---------------------------------------------------------------------------
ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS pledge_installment_id uuid;

-- FK from contributions_received.pledge_id → pledges (was unconstrained before)
ALTER TABLE public.contributions_received
  ADD CONSTRAINT contributions_received_pledge_fk
  FOREIGN KEY (pledge_id)
  REFERENCES public.pledges(id)
  ON DELETE SET NULL;

ALTER TABLE public.contributions_received
  ADD CONSTRAINT contributions_received_pledge_installment_fk
  FOREIGN KEY (pledge_installment_id)
  REFERENCES public.pledge_installments(id)
  ON DELETE SET NULL;

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
    WHEN d.donor_type != 'individual'
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
    WHEN MIN(i.due_date) FILTER (WHERE i.status = 'pending') <= CURRENT_DATE + INTERVAL '30 days'
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
CREATE POLICY "pledges_read" ON public.pledges FOR SELECT TO authenticated
  USING (public.org_role_gte(org_id, 'member') AND public.org_has_module(org_id, 'pledge_tracking') AND deleted_at IS NULL);

CREATE POLICY "pledges_insert" ON public.pledges FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'));

CREATE POLICY "pledges_update" ON public.pledges FOR UPDATE TO authenticated
  USING (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking') AND deleted_at IS NULL)
  WITH CHECK (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'));

CREATE POLICY "pledges_service" ON public.pledges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- pledge_installments
CREATE POLICY "installments_read" ON public.pledge_installments FOR SELECT TO authenticated
  USING (public.org_role_gte(org_id, 'member') AND public.org_has_module(org_id, 'pledge_tracking'));

CREATE POLICY "installments_insert" ON public.pledge_installments FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'));

CREATE POLICY "installments_update" ON public.pledge_installments FOR UPDATE TO authenticated
  USING (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'))
  WITH CHECK (public.can_edit_org(org_id) AND public.org_has_module(org_id, 'pledge_tracking'));

CREATE POLICY "installments_service" ON public.pledge_installments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- pledge_events
CREATE POLICY "events_read" ON public.pledge_events FOR SELECT TO authenticated
  USING (public.org_role_gte(org_id, 'member') AND public.org_has_module(org_id, 'pledge_tracking'));

CREATE POLICY "events_service" ON public.pledge_events FOR ALL TO service_role USING (true) WITH CHECK (true);

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
INSERT INTO module_definitions (slug, label, description, depends_on, is_core)
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
    p_frequency, 'active', COALESCE(p_commitment_type,'written'), p_campaign, p_fund_designation,
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
  v_pledge     pledges%ROWTYPE;
  v_inst       pledge_installments%ROWTYPE;
  v_actor      uuid;
  v_contrib_id uuid;
  v_all_done   boolean;
  v_event_type pledge_event_type_enum;
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
    IF COALESCE(p_create_contribution, false) THEN
      INSERT INTO contributions_received (
        org_id, donor_id, amount, currency, contribution_date, gift_type,
        pledge_id, pledge_installment_id, is_pledge
      ) VALUES (
        p_org_id, v_pledge.donor_id, v_inst.amount, v_pledge.currency,
        COALESCE(p_paid_at::date, CURRENT_DATE), 'pledge',
        p_pledge_id, p_installment_id, false
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
    UPDATE pledge_installments SET
      status = 'waived', waived_at = now(), acted_by = v_actor,
      notes = COALESCE(p_notes, notes), updated_at = now()
    WHERE id = p_installment_id;

  ELSIF p_action = 'write_off' THEN
    IF v_inst.status != 'pending' THEN RAISE EXCEPTION 'Can only write off pending installments'; END IF;
    v_event_type := 'written_off';
    UPDATE pledge_installments SET
      status = 'written_off', written_off_at = now(), acted_by = v_actor,
      notes = COALESCE(p_notes, notes), updated_at = now()
    WHERE id = p_installment_id;

  ELSIF p_action = 'reopen' THEN
    IF v_inst.status = 'pending' THEN RAISE EXCEPTION 'Installment is already pending'; END IF;
    v_event_type := 'installment_reopened';
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
    jsonb_build_object('status', p_action),
    p_notes);

  -- Auto-fulfill pledge when all installments are resolved
  SELECT NOT EXISTS (
    SELECT 1 FROM pledge_installments WHERE pledge_id = p_pledge_id AND status = 'pending'
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
```

- [ ] **Step 3: Commit the migration**

```bash
git add db/migrations/0038_pledge_tracking.sql
git commit -m "feat(pledges): add 0038_pledge_tracking migration — tables, views, RLS, RPCs"
```

---

## Task 3: Schedule Utility + Tests

**Files:**
- Create: `lib/pledges/schedule.ts`
- Create: `lib/pledges/schedule.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `lib/pledges/schedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateSchedule } from './schedule';

describe('generateSchedule', () => {
  it('one_time creates a single installment for the full amount', () => {
    const result = generateSchedule({ totalAmount: 1000, startDate: '2026-01-15', frequency: 'one_time' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ due_date: '2026-01-15', amount: 1000 });
  });

  it('monthly even split', () => {
    const result = generateSchedule({ totalAmount: 1200, startDate: '2026-01-15', endDate: '2026-04-15', frequency: 'monthly' });
    expect(result).toHaveLength(4);
    expect(result.every(r => r.amount === 300)).toBe(true);
    expect(result.map(r => r.due_date)).toEqual(['2026-01-15','2026-02-15','2026-03-15','2026-04-15']);
  });

  it('monthly uneven split — penny remainder goes on last installment', () => {
    const result = generateSchedule({ totalAmount: 100, startDate: '2026-01-01', endDate: '2026-03-01', frequency: 'monthly' });
    expect(result).toHaveLength(3);
    const sum = result.reduce((a, r) => a + r.amount, 0);
    expect(sum).toBeCloseTo(100, 10);
    // 33.33 + 33.33 + 33.34
    expect(result[2].amount).toBeGreaterThanOrEqual(result[0].amount);
  });

  it('quarterly schedule', () => {
    const result = generateSchedule({ totalAmount: 4000, startDate: '2026-01-01', endDate: '2026-10-01', frequency: 'quarterly' });
    expect(result).toHaveLength(4);
    expect(result.map(r => r.due_date)).toEqual(['2026-01-01','2026-04-01','2026-07-01','2026-10-01']);
  });

  it('annually schedule', () => {
    const result = generateSchedule({ totalAmount: 3000, startDate: '2026-01-01', endDate: '2028-01-01', frequency: 'annually' });
    expect(result).toHaveLength(3);
    expect(result.map(r => r.due_date)).toEqual(['2026-01-01','2027-01-01','2028-01-01']);
  });

  it('clamps end-of-month dates — Jan 31 monthly goes to Feb 28', () => {
    const result = generateSchedule({ totalAmount: 200, startDate: '2026-01-31', endDate: '2026-02-28', frequency: 'monthly' });
    expect(result).toHaveLength(2);
    expect(result[1].due_date).toBe('2026-02-28');
  });

  it('installmentCount override ignores endDate', () => {
    const result = generateSchedule({ totalAmount: 600, startDate: '2026-01-01', frequency: 'monthly', installmentCount: 3 });
    expect(result).toHaveLength(3);
  });

  it('custom returns empty array', () => {
    const result = generateSchedule({ totalAmount: 500, startDate: '2026-01-01', frequency: 'custom' });
    expect(result).toEqual([]);
  });

  it('throws on negative total', () => {
    expect(() => generateSchedule({ totalAmount: -100, startDate: '2026-01-01', frequency: 'one_time' })).toThrow();
  });

  it('throws when endDate is before startDate', () => {
    expect(() => generateSchedule({ totalAmount: 1000, startDate: '2026-06-01', endDate: '2026-01-01', frequency: 'monthly' })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run lib/pledges/schedule.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './schedule'`

- [ ] **Step 3: Implement the schedule utility**

Create `lib/pledges/schedule.ts`:

```ts
export type Frequency = 'one_time' | 'monthly' | 'quarterly' | 'annually' | 'custom';

export interface ScheduleInput {
  totalAmount: number;
  startDate: string;
  endDate?: string;
  frequency: Frequency;
  installmentCount?: number;
}

export interface ScheduledInstallment {
  due_date: string;
  amount: number;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const anchorDay = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp to last day of target month if month has fewer days
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(anchorDay, lastDay));
  return d.toISOString().slice(0, 10);
}

function countIntervals(startDate: string, endDate: string, monthsPerInterval: number): number {
  const start = new Date(startDate + 'T12:00:00Z');
  const end   = new Date(endDate   + 'T12:00:00Z');
  let count = 1;
  let cur = new Date(start);
  while (true) {
    const next = new Date(cur);
    next.setUTCMonth(next.getUTCMonth() + monthsPerInterval);
    if (next > end) break;
    count++;
    cur = next;
  }
  return count;
}

function distributeAmount(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => i === n - 1 ? base + remainder : base);
}

export function generateSchedule(input: ScheduleInput): ScheduledInstallment[] {
  const { totalAmount, startDate, endDate, frequency, installmentCount } = input;

  if (!totalAmount || totalAmount <= 0) throw new Error('totalAmount must be greater than zero');
  if (!startDate) throw new Error('startDate is required');
  if (endDate && endDate < startDate) throw new Error('endDate must be on or after startDate');

  if (frequency === 'custom') return [];
  if (frequency === 'one_time') {
    return [{ due_date: startDate, amount: totalAmount }];
  }

  const monthsPerInterval = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;

  let n: number;
  if (installmentCount && installmentCount > 0) {
    n = installmentCount;
  } else if (endDate) {
    n = countIntervals(startDate, endDate, monthsPerInterval);
  } else {
    throw new Error(`endDate or installmentCount is required for ${frequency} schedules`);
  }

  const totalCents = Math.round(totalAmount * 100);
  const amounts = distributeAmount(totalCents, n);

  return Array.from({ length: n }, (_, i) => ({
    due_date: i === 0 ? startDate : addMonths(startDate, i * monthsPerInterval),
    amount: amounts[i] / 100,
  }));
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run lib/pledges/schedule.test.ts 2>&1 | tail -10
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pledges/schedule.ts lib/pledges/schedule.test.ts
git commit -m "feat(pledges): add schedule utility with tests"
```

---

## Task 4: Zod Schemas

**Files:**
- Create: `lib/schemas/pledge.ts`

- [ ] **Step 1: Create the schema file**

Create `lib/schemas/pledge.ts`:

```ts
import { z } from 'zod';

export const InstallmentInputSchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD'),
  amount: z.number().positive('amount must be positive'),
  notes: z.string().optional(),
});

export const CreatePledgeSchema = z.object({
  donor_id: z.string().uuid('donor_id must be a UUID'),
  total_amount: z.number().positive('total_amount must be positive'),
  currency: z.string().length(3).default('USD'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  frequency: z.enum(['one_time','monthly','quarterly','annually','custom']),
  commitment_type: z.enum(['verbal','written','online','imported']).default('written'),
  campaign: z.string().optional(),
  fund_designation: z.string().optional(),
  restriction_purpose: z.string().optional(),
  relationship_manager: z.string().uuid().optional(),
  signed_at: z.string().datetime().optional(),
  notes: z.string().optional(),
  installments: z.array(InstallmentInputSchema).min(1, 'at least one installment required'),
}).refine(
  data => Math.abs(data.installments.reduce((s, i) => s + i.amount, 0) - data.total_amount) < 0.02,
  { message: 'Installment amounts must sum to total_amount', path: ['installments'] }
);

export const PatchPledgeSchema = z.object({
  campaign: z.string().optional(),
  fund_designation: z.string().optional(),
  restriction_purpose: z.string().optional(),
  relationship_manager: z.string().uuid().optional(),
  commitment_type: z.enum(['verbal','written','online','imported']).optional(),
  signed_at: z.string().datetime().optional(),
  notes: z.string().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

export const CancelPledgeSchema = z.object({
  cancellation_reason: z.string().optional(),
  waive_pending: z.boolean().default(false),
});

export const PatchInstallmentSchema = z.object({
  action: z.enum(['mark_paid','waive','write_off','reopen']),
  paid_at: z.string().datetime().optional(),
  payment_ref: z.string().optional(),
  contribution_id: z.string().uuid().optional(),
  create_contribution: z.boolean().optional(),
  notes: z.string().optional(),
});

export type CreatePledgeInput   = z.infer<typeof CreatePledgeSchema>;
export type PatchPledgeInput    = z.infer<typeof PatchPledgeSchema>;
export type CancelPledgeInput   = z.infer<typeof CancelPledgeSchema>;
export type PatchInstallmentInput = z.infer<typeof PatchInstallmentSchema>;
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/schemas/pledge.ts
git commit -m "feat(pledges): add Zod schemas"
```

---

## Task 5: API — GET and POST /pledges

**Files:**
- Create: `app/api/org/[orgId]/pledges/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/org/[orgId]/pledges/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { CreatePledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['owner', 'admin', 'member'];

async function authorize(supabase: any, orgId: string) {
  const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
  if (!role || !ALLOWED_ROLES.includes(role)) return null;
  return role as string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const role = await authorize(supabase, orgId);
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const sp = new URL(req.url).searchParams;
    const statusFilter    = sp.get('status') || 'active';
    const pipelineFilter  = sp.get('pipeline_status');
    const donorId         = sp.get('donor_id');
    const campaign        = sp.get('campaign');
    const limit           = Math.min(parseInt(sp.get('limit') || '50'), 200);
    const offset          = parseInt(sp.get('offset') || '0');

    // --- Pledge rows from view ---
    let q = supabase.from('v_pledge_pipeline').select('*', { count: 'exact' }).eq('org_id', orgId);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (donorId)   q = q.eq('donor_id', donorId);
    if (campaign)  q = q.eq('campaign', campaign);
    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    const { data: pledges, count, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Apply pipeline_status filter in JS (it's a computed column in the view)
    const rows = pipelineFilter
      ? (pledges ?? []).filter((p: any) => p.pipeline_status === pipelineFilter)
      : (pledges ?? []);

    // --- KPIs across ALL non-deleted pledges for this org ---
    const { data: allInstallments } = await supabase
      .from('pledge_installments')
      .select('amount, status, due_date, pledge_id')
      .eq('org_id', orgId);

    const { data: allPledges } = await supabase
      .from('pledges')
      .select('id, total_amount, status')
      .eq('org_id', orgId)
      .is('deleted_at', null);

    const today = new Date().toISOString().slice(0, 10);
    const activePledgeIds = new Set(
      (allPledges ?? []).filter((p: any) => !['cancelled','defaulted','written_off'].includes(p.status)).map((p: any) => p.id)
    );
    const committed  = (allPledges ?? []).filter((p: any) => activePledgeIds.has(p.id)).reduce((s: number, p: any) => s + Number(p.total_amount), 0);
    const received   = (allInstallments ?? []).filter((i: any) => i.status === 'paid' && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const outstanding= (allInstallments ?? []).filter((i: any) => i.status === 'pending' && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const overdue    = (allInstallments ?? []).filter((i: any) => i.status === 'pending' && i.due_date < today && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const dueSoon    = (allInstallments ?? []).filter((i: any) => {
      const d30 = new Date(); d30.setDate(d30.getDate() + 30); const d30s = d30.toISOString().slice(0, 10);
      return i.status === 'pending' && i.due_date >= today && i.due_date <= d30s && activePledgeIds.has(i.pledge_id);
    }).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const fulfilledCount = (allPledges ?? []).filter((p: any) => p.status === 'fulfilled').length;
    const totalCount     = (allPledges ?? []).filter((p: any) => !['cancelled','defaulted','written_off'].includes(p.status)).length;
    const fulfillmentRate = totalCount > 0 ? Math.round((fulfilledCount / totalCount) * 100) : 0;

    // --- Aging buckets (overdue installments) ---
    const overdueInst = (allInstallments ?? []).filter((i: any) => i.status === 'pending' && i.due_date < today && activePledgeIds.has(i.pledge_id));
    const aging = { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 };
    const todayMs = new Date(today).getTime();
    for (const i of overdueInst) {
      const days = Math.floor((todayMs - new Date(i.due_date).getTime()) / 86400000);
      const amt = Number(i.amount);
      if (days <= 0)       aging.current    += amt;
      else if (days <= 30) aging.days1To30   += amt;
      else if (days <= 60) aging.days31To60  += amt;
      else if (days <= 90) aging.days61To90  += amt;
      else                 aging.days90Plus  += amt;
    }

    // --- 12-month forecast ---
    const forecast: Array<{ month: string; expected: number; received: number }> = [];
    for (let m = -6; m < 6; m++) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + m);
      const month = d.toISOString().slice(0, 7);
      const expected = (allInstallments ?? []).filter((i: any) => i.status === 'pending' && i.due_date.startsWith(month) && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
      const rec      = (allInstallments ?? []).filter((i: any) => i.status === 'paid'    && i.due_date.startsWith(month) && activePledgeIds.has(i.pledge_id)).reduce((s: number, i: any) => s + Number(i.amount), 0);
      forecast.push({ month, expected, received: rec });
    }

    // --- Attention lists (from the view rows) ---
    const { data: attRows } = await supabase
      .from('v_pledge_pipeline')
      .select('*')
      .eq('org_id', orgId)
      .in('pipeline_status', ['overdue','due_soon'])
      .order('next_due_date', { ascending: true })
      .limit(20);

    const attention = {
      overdue:  (attRows ?? []).filter((r: any) => r.pipeline_status === 'overdue').slice(0, 5),
      dueSoon:  (attRows ?? []).filter((r: any) => r.pipeline_status === 'due_soon').slice(0, 5),
    };

    return NextResponse.json({
      kpis: { committed, received, outstanding, overdue, dueSoon, fulfillmentRate },
      aging,
      forecast,
      attention,
      pledges: rows,
      total: count ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const role = await authorize(supabase, orgId);
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const parsed = CreatePledgeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

    const d = parsed.data;
    const { data: result, error } = await supabase.rpc('create_pledge_with_installments', {
      p_org_id:               orgId,
      p_donor_id:             d.donor_id,
      p_total_amount:         d.total_amount,
      p_currency:             d.currency,
      p_start_date:           d.start_date,
      p_end_date:             d.end_date ?? null,
      p_frequency:            d.frequency,
      p_commitment_type:      d.commitment_type,
      p_campaign:             d.campaign ?? null,
      p_fund_designation:     d.fund_designation ?? null,
      p_restriction_purpose:  d.restriction_purpose ?? null,
      p_relationship_manager: d.relationship_manager ?? null,
      p_signed_at:            d.signed_at ?? null,
      p_notes:                d.notes ?? null,
      p_installments:         JSON.stringify(d.installments),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const pledgeId = (result as any).pledge_id;
    const { data: pledge } = await supabase.from('v_pledge_pipeline').select('*').eq('id', pledgeId).single();
    const { data: installments } = await supabase.from('pledge_installments').select('*').eq('pledge_id', pledgeId).order('due_date');

    return NextResponse.json({ pledge, installments }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/org/\[orgId\]/pledges/route.ts
git commit -m "feat(pledges): GET and POST /api/org/[orgId]/pledges"
```

---

## Task 6: API — Pledge Detail, Patch, Cancel, Delete

**Files:**
- Create: `app/api/org/[orgId]/pledges/[pledgeId]/route.ts`
- Create: `app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts`

- [ ] **Step 1: Create pledge detail/patch/delete route**

Create `app/api/org/[orgId]/pledges/[pledgeId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { PatchPledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['owner', 'admin', 'member'];
const ADMIN_ROLES   = ['owner', 'admin'];

async function getRole(supabase: any, orgId: string): Promise<string | null> {
  const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
  return role || null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const supabase = await createServerClient();
    const role = await getRole(supabase, orgId);
    if (!role || !ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const [{ data: pledge, error: pe }, { data: installments }, { data: events }] = await Promise.all([
      supabase.from('v_pledge_pipeline').select('*').eq('id', pledgeId).eq('org_id', orgId).single(),
      supabase.from('pledge_installments').select('*, contributions_received(id, contribution_date, amount, receipt_status, acknowledgment_sent)').eq('pledge_id', pledgeId).order('due_date'),
      supabase.from('pledge_events').select('*').eq('pledge_id', pledgeId).order('created_at', { ascending: false }).limit(50),
    ]);
    if (pe) return NextResponse.json({ error: pe.message }, { status: pe.code === 'PGRST116' ? 404 : 500 });

    return NextResponse.json({ pledge, installments, events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const supabase = await createServerClient();
    const role = await getRole(supabase, orgId);
    if (!role || !ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const parsed = PatchPledgeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

    const { data: pledge, error } = await supabase
      .from('pledges')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', pledgeId).eq('org_id', orgId).is('deleted_at', null)
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ pledge });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const supabase = await createServerClient();
    const role = await getRole(supabase, orgId);
    if (!role || !ADMIN_ROLES.includes(role)) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('pledges')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id, updated_at: new Date().toISOString() })
      .eq('id', pledgeId).eq('org_id', orgId).is('deleted_at', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create cancel route**

Create `app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { CancelPledgeSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string }> }
) {
  try {
    const { orgId, pledgeId } = await params;
    const supabase = await createServerClient();
    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!['owner','admin'].includes(role)) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = CancelPledgeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    const { error: pe } = await supabase.from('pledges')
      .update({ status: 'cancelled', cancelled_at: now, cancelled_by: user?.id, cancellation_reason: parsed.data.cancellation_reason ?? null, updated_at: now })
      .eq('id', pledgeId).eq('org_id', orgId).is('deleted_at', null);
    if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });

    if (parsed.data.waive_pending) {
      await supabase.from('pledge_installments')
        .update({ status: 'waived', waived_at: now, acted_by: user?.id, updated_at: now })
        .eq('pledge_id', pledgeId).eq('status', 'pending');
    }

    await supabase.from('pledge_events').insert({
      org_id: orgId, pledge_id: pledgeId, event_type: 'cancelled', actor_id: user?.id,
      after_values: { cancellation_reason: parsed.data.cancellation_reason, waive_pending: parsed.data.waive_pending },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/api/org/[orgId]/pledges/[pledgeId]/route.ts" "app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts"
git commit -m "feat(pledges): GET/PATCH/DELETE pledge detail + cancel endpoint"
```

---

## Task 7: API — Installment Mutation

**Files:**
- Create: `app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts`

- [ ] **Step 1: Create installment mutation route**

Create `app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { PatchInstallmentSchema } from '@/lib/schemas/pledge';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string; installmentId: string }> }
) {
  try {
    const { orgId, pledgeId, installmentId } = await params;
    const supabase = await createServerClient();
    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!['owner','admin','member'].includes(role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const parsed = PatchInstallmentSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

    const d = parsed.data;
    const { data: result, error } = await supabase.rpc('update_pledge_installment_status', {
      p_org_id:              orgId,
      p_pledge_id:           pledgeId,
      p_installment_id:      installmentId,
      p_action:              d.action,
      p_paid_at:             d.paid_at ?? null,
      p_payment_ref:         d.payment_ref ?? null,
      p_contribution_id:     d.contribution_id ?? null,
      p_create_contribution: d.create_contribution ?? false,
      p_notes:               d.notes ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: pledge }       = await supabase.from('v_pledge_pipeline').select('*').eq('id', pledgeId).single();
    const { data: installments } = await supabase.from('pledge_installments').select('*').eq('pledge_id', pledgeId).order('due_date');

    return NextResponse.json({ result, pledge, installments });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts"
git commit -m "feat(pledges): installment mutation endpoint (mark_paid/waive/write_off/reopen)"
```

---

## Task 8: PledgePipelineDashboard Component

**Files:**
- Create: `components/pledges/PledgePipelineDashboard.tsx`

- [ ] **Step 1: Create the component**

Create `components/pledges/PledgePipelineDashboard.tsx`:

```tsx
'use client';
import { useState, useCallback } from 'react';
import useSWR from 'swr';
import PledgeCreateModal from './PledgeCreateModal';
import PledgeDetailPanel from './PledgeDetailPanel';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const STATUS_BADGE: Record<string, string> = {
  overdue:   'bg-red-100 text-red-800',
  due_soon:  'bg-amber-100 text-amber-800',
  on_track:  'bg-green-100 text-green-800',
  fulfilled: 'bg-indigo-100 text-indigo-800',
  cancelled: 'bg-gray-100 text-gray-600',
  defaulted: 'bg-gray-100 text-gray-600',
  written_off: 'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<string, string> = {
  overdue: 'Overdue', due_soon: 'Due Soon', on_track: 'On Track',
  fulfilled: 'Fulfilled', cancelled: 'Cancelled', defaulted: 'Defaulted', written_off: 'Written Off',
};

function fmt(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'K';
  return '$' + n.toLocaleString();
}

const FILTERS = [
  { label: 'All',       value: 'all' },
  { label: 'Active',    value: 'active' },
  { label: 'Overdue',   value: 'overdue' },
  { label: 'Due Soon',  value: 'due_soon' },
  { label: 'Fulfilled', value: 'fulfilled' },
  { label: 'Cancelled', value: 'cancelled' },
];

interface Props { orgId: string; }

export default function PledgePipelineDashboard({ orgId }: Props) {
  const [filter, setFilter]         = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]     = useState<string | null>(null);

  const apiUrl = filter === 'overdue' || filter === 'due_soon'
    ? `/api/org/${orgId}/pledges?status=all&pipeline_status=${filter}`
    : `/api/org/${orgId}/pledges?status=${filter}`;

  const { data, isLoading, mutate } = useSWR(apiUrl, fetcher, { keepPreviousData: true });

  const kpis = data?.kpis ?? {};
  const pledges: any[] = data?.pledges ?? [];
  const attention = data?.attention ?? { overdue: [], dueSoon: [] };

  const onCreated = useCallback(() => { setShowCreate(false); mutate(); }, [mutate]);
  const onInstallmentChange = useCallback(() => { mutate(); }, [mutate]);

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Committed',   value: fmt(kpis.committed  ?? 0), color: 'text-neutral-900' },
          { label: 'Received',    value: fmt(kpis.received   ?? 0), color: 'text-green-700' },
          { label: 'Outstanding', value: fmt(kpis.outstanding?? 0), color: 'text-neutral-900' },
          { label: 'Overdue',     value: fmt(kpis.overdue    ?? 0), color: (kpis.overdue ?? 0) > 0 ? 'text-red-700' : 'text-neutral-900' },
          { label: 'Fulfilled %', value: (kpis.fulfillmentRate ?? 0) + '%', color: 'text-neutral-900' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-neutral-200 rounded-lg px-4 py-3">
            <div className="text-xs text-neutral-500 uppercase tracking-wide">{k.label}</div>
            <div className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Attention + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* Left: Needs Attention */}
        <div className="space-y-4">
          {attention.overdue.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">⚠ Overdue</div>
              <div className="bg-white border border-red-200 rounded-lg divide-y divide-red-100 overflow-hidden">
                {attention.overdue.map((p: any) => (
                  <button key={p.id} onClick={() => setSelected(p.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-red-50 transition-colors">
                    <div className="text-xs font-semibold text-neutral-900 truncate">{p.donor_name}</div>
                    <div className="text-xs text-red-600 mt-0.5">{fmt(p.overdue)} overdue · was {p.next_due_date ?? '—'}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {attention.dueSoon.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">↑ Due Soon</div>
              <div className="bg-white border border-amber-200 rounded-lg divide-y divide-amber-100 overflow-hidden">
                {attention.dueSoon.map((p: any) => (
                  <button key={p.id} onClick={() => setSelected(p.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition-colors">
                    <div className="text-xs font-semibold text-neutral-900 truncate">{p.donor_name}</div>
                    <div className="text-xs text-amber-700 mt-0.5">{fmt(p.next_due_amount ?? 0)} due {p.next_due_date}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {attention.overdue.length === 0 && attention.dueSoon.length === 0 && (
            <div className="bg-white border border-neutral-200 rounded-lg px-4 py-6 text-center">
              <div className="text-sm text-neutral-400">No items need attention</div>
            </div>
          )}
        </div>

        {/* Right: Pledge table */}
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap flex-1">
              {FILTERS.map(f => (
                <button key={f.value} onClick={() => setFilter(f.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filter === f.value ? 'bg-azure text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowCreate(true)}
              className="px-3 py-1.5 text-xs font-medium bg-azure text-white rounded-md hover:bg-azure/90 transition-colors whitespace-nowrap">
              + New Pledge
            </button>
          </div>

          {isLoading ? (
            <div className="px-4 py-10 text-center text-neutral-400 text-sm">Loading…</div>
          ) : pledges.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="text-neutral-400 text-sm mb-3">No pledges found</div>
              <button onClick={() => setShowCreate(true)}
                className="px-4 py-2 text-sm font-medium bg-azure text-white rounded-md hover:bg-azure/90">
                Create first pledge
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-neutral-50">
                  <tr>
                    {['Donor','Pledged','Received','Outstanding','Next Due','Status',''].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pledges.map((p: any) => (
                    <tr key={p.id} className="hover:bg-neutral-50 cursor-pointer" onClick={() => setSelected(p.id)}>
                      <td className="px-4 py-3 font-medium text-neutral-900 truncate max-w-[160px]">{p.donor_name}</td>
                      <td className="px-4 py-3 text-neutral-700">{fmt(p.total_amount)}</td>
                      <td className="px-4 py-3 text-green-700">{fmt(p.received)}</td>
                      <td className="px-4 py-3 text-neutral-700">{fmt(p.outstanding)}</td>
                      <td className="px-4 py-3 text-neutral-600">{p.next_due_date ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[p.pipeline_status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[p.pipeline_status] ?? p.pipeline_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-xs text-azure hover:underline" onClick={e => { e.stopPropagation(); setSelected(p.id); }}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <PledgeCreateModal orgId={orgId} onClose={() => setShowCreate(false)} onCreated={onCreated} />
      )}
      {selected && (
        <PledgeDetailPanel orgId={orgId} pledgeId={selected} onClose={() => setSelected(null)} onChanged={onInstallmentChange} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (SWR types may warn about `keepPreviousData` — ignore if it's a minor version difference; fix by removing the option if needed).

- [ ] **Step 3: Commit**

```bash
git add components/pledges/PledgePipelineDashboard.tsx
git commit -m "feat(pledges): pipeline dashboard component"
```

---

## Task 9: PledgeCreateModal Component

**Files:**
- Create: `components/pledges/PledgeCreateModal.tsx`

- [ ] **Step 1: Create the modal**

Create `components/pledges/PledgeCreateModal.tsx`:

```tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { generateSchedule, type Frequency, type ScheduledInstallment } from '@/lib/pledges/schedule';

interface Props {
  orgId: string;
  prefillDonorId?: string;
  prefillDonorName?: string;
  onClose: () => void;
  onCreated: () => void;
}

interface DonorOption { id: string; display_name: string; }

export default function PledgeCreateModal({ orgId, prefillDonorId, prefillDonorName, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 fields
  const [donorQuery, setDonorQuery]     = useState(prefillDonorName ?? '');
  const [donorOptions, setDonorOptions] = useState<DonorOption[]>([]);
  const [donorId, setDonorId]           = useState(prefillDonorId ?? '');
  const [totalAmount, setTotalAmount]   = useState('');
  const [currency, setCurrency]         = useState('USD');
  const [commitmentType, setCommitmentType] = useState<string>('written');
  const [campaign, setCampaign]         = useState('');
  const [fundDesignation, setFundDesig] = useState('');
  const [notes, setNotes]               = useState('');

  // Step 2 fields
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [frequency, setFrequency]   = useState<Frequency>('one_time');
  const [instCount, setInstCount]   = useState('');

  // Step 3: editable installments
  const [installments, setInstallments] = useState<ScheduledInstallment[]>([]);

  // Donor search
  useEffect(() => {
    if (prefillDonorId) return;
    if (!donorQuery || donorQuery.length < 2) { setDonorOptions([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/org/${orgId}/donors?name=${encodeURIComponent(donorQuery)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setDonorOptions((data.donors ?? []).map((d: any) => ({
          id: d.id,
          display_name: d.display_name || [d.first_name, d.last_name].filter(Boolean).join(' ') || d.organization_name || d.id,
        })));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [donorQuery, orgId, prefillDonorId]);

  function generatePreview() {
    try {
      const total = parseFloat(totalAmount);
      if (!total || !startDate || !frequency) return;
      const result = generateSchedule({
        totalAmount: total, startDate, endDate: endDate || undefined,
        frequency, installmentCount: instCount ? parseInt(instCount) : undefined,
      });
      setInstallments(result);
    } catch { setInstallments([]); }
  }

  useEffect(() => { if (step === 3) generatePreview(); }, [step]);

  const instSum = installments.reduce((s, i) => s + i.amount, 0);
  const total   = parseFloat(totalAmount) || 0;
  const sumOk   = Math.abs(instSum - total) < 0.02;

  function updateInst(idx: number, field: 'due_date' | 'amount', value: string) {
    setInstallments(prev => prev.map((i, n) => n === idx ? { ...i, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : i));
  }

  function addInst() {
    setInstallments(prev => [...prev, { due_date: startDate, amount: 0 }]);
  }

  function removeInst(idx: number) {
    setInstallments(prev => prev.filter((_, n) => n !== idx));
  }

  async function handleSubmit() {
    if (!donorId || !totalAmount || !startDate || installments.length === 0 || !sumOk) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/pledges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donor_id: donorId, total_amount: parseFloat(totalAmount), currency,
          start_date: startDate, end_date: endDate || undefined,
          frequency, commitment_type: commitmentType,
          campaign: campaign || undefined, fund_designation: fundDesignation || undefined,
          notes: notes || undefined,
          installments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.[0]?.message ?? data.error ?? 'Failed to create pledge');
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const canGoStep2 = !!donorId && !!totalAmount && parseFloat(totalAmount) > 0;
  const canGoStep3 = !!startDate && !!frequency;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h2 className="text-base font-semibold text-neutral-900">New Pledge — Step {step} of 4</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg leading-none" aria-label="Close">×</button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 px-6 pt-3">
          {[1,2,3,4].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-azure' : 'bg-neutral-200'}`} />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Donor *</label>
                {prefillDonorId ? (
                  <div className="px-3 py-2 border border-neutral-300 rounded-md text-sm bg-neutral-50">{prefillDonorName}</div>
                ) : (
                  <div className="relative">
                    <input value={donorQuery} onChange={e => { setDonorQuery(e.target.value); setDonorId(''); }}
                      placeholder="Search donor name…"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure"
                      aria-label="Donor search" aria-describedby={donorId ? undefined : 'donor-hint'} />
                    {donorOptions.length > 0 && !donorId && (
                      <ul className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {donorOptions.map(d => (
                          <li key={d.id}>
                            <button onClick={() => { setDonorId(d.id); setDonorQuery(d.display_name); setDonorOptions([]); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50">
                              {d.display_name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Total Amount *</label>
                  <input type="number" min="0.01" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure"
                    aria-describedby="amount-hint" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure">
                    <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Commitment Type</label>
                <select value={commitmentType} onChange={e => setCommitmentType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure">
                  <option value="written">Written</option><option value="verbal">Verbal</option>
                  <option value="online">Online</option><option value="imported">Imported</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Campaign</label>
                  <input value={campaign} onChange={e => setCampaign(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Fund Designation</label>
                  <input value={fundDesignation} onChange={e => setFundDesig(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Notes</label>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure resize-none" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Start Date *</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Frequency *</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure">
                  <option value="one_time">One-time</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              {frequency !== 'one_time' && frequency !== 'custom' && (
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Number of installments (leave blank to derive from end date)</label>
                  <input type="number" min="1" value={instCount} onChange={e => setInstCount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
              )}
              {frequency === 'custom' && (
                <p className="text-xs text-neutral-500">You'll add installments manually in the next step.</p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-neutral-700">Installment Schedule</span>
                <span className={`text-xs font-semibold ${sumOk ? 'text-green-700' : 'text-red-600'}`}>
                  Sum: ${instSum.toFixed(2)} / ${total.toFixed(2)}
                </span>
              </div>
              {!sumOk && <p className="text-xs text-red-600" role="alert">Installment amounts must equal the total pledge amount.</p>}
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {installments.map((inst, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_100px_28px] gap-2 items-center">
                    <input type="date" value={inst.due_date} onChange={e => updateInst(idx, 'due_date', e.target.value)}
                      className="px-2 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-azure" />
                    <input type="number" step="0.01" value={inst.amount} onChange={e => updateInst(idx, 'amount', e.target.value)}
                      className="px-2 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-azure" />
                    <button onClick={() => removeInst(idx)} className="text-neutral-400 hover:text-red-500 text-sm" aria-label="Remove">×</button>
                  </div>
                ))}
              </div>
              <button onClick={addInst} className="text-xs text-azure hover:underline">+ Add installment</button>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="bg-neutral-50 rounded-lg p-4 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-neutral-500">Donor</span><span className="font-medium">{donorQuery}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">Total</span><span className="font-semibold text-neutral-900">${parseFloat(totalAmount).toLocaleString()} {currency}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">Frequency</span><span className="capitalize">{frequency.replace('_',' ')}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">Installments</span><span>{installments.length}</span></div>
                {installments.length > 0 && (
                  <div className="flex justify-between"><span className="text-neutral-500">First due</span><span>{installments[0].due_date}</span></div>
                )}
                {installments.length > 1 && (
                  <div className="flex justify-between"><span className="text-neutral-500">Final due</span><span>{installments[installments.length - 1].due_date}</span></div>
                )}
                {campaign && <div className="flex justify-between"><span className="text-neutral-500">Campaign</span><span>{campaign}</span></div>}
              </div>
              {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 py-4 border-t border-neutral-100 gap-2">
          <button onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
            className="px-4 py-2 text-sm text-neutral-600 border border-neutral-300 rounded-md hover:bg-neutral-50">
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 4 ? (
            <button
              onClick={() => { if (step === 2) generatePreview(); setStep(s => s + 1); }}
              disabled={
                (step === 1 && !canGoStep2) ||
                (step === 2 && !canGoStep3) ||
                (step === 3 && !sumOk)
              }
              className="px-4 py-2 text-sm font-medium bg-azure text-white rounded-md hover:bg-azure/90 disabled:opacity-50 disabled:cursor-not-allowed">
              Continue
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving || !sumOk}
              className="px-4 py-2 text-sm font-medium bg-azure text-white rounded-md hover:bg-azure/90 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Pledge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/pledges/PledgeCreateModal.tsx
git commit -m "feat(pledges): 4-step pledge creation modal"
```

---

## Task 10: PledgeDetailPanel Component

**Files:**
- Create: `components/pledges/PledgeDetailPanel.tsx`

- [ ] **Step 1: Create the panel**

Create `components/pledges/PledgeDetailPanel.tsx`:

```tsx
'use client';
import { useState, useEffect } from 'react';

interface Props {
  orgId: string;
  pledgeId: string;
  onClose: () => void;
  onChanged: () => void;
}

const INST_BADGE: Record<string, string> = {
  pending:    'bg-neutral-100 text-neutral-600',
  paid:       'bg-green-100 text-green-800',
  waived:     'bg-amber-100 text-amber-700',
  written_off:'bg-gray-100 text-gray-500',
};

function fmt(n: number) {
  return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PledgeDetailPanel({ orgId, pledgeId, onClose, onChanged }: Props) {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [acting, setActing]   = useState<string | null>(null);
  const [payForm, setPayForm] = useState<{ id: string; paidAt: string; payRef: string } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: string; label: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/${orgId}/pledges/${pledgeId}`);
      if (!res.ok) throw new Error('Not found');
      setData(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [pledgeId]);

  async function doAction(installmentId: string, action: string, extra: Record<string, any> = {}) {
    setActing(installmentId + action);
    try {
      const res = await fetch(`/api/org/${orgId}/pledges/${pledgeId}/installments/${installmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      await load();
      onChanged();
    } catch (e: any) { alert(e.message); }
    finally { setActing(null); setPayForm(null); setConfirm(null); }
  }

  const pledge       = data?.pledge;
  const installments: any[] = data?.installments ?? [];
  const events: any[]       = data?.events ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const effectiveStatus = (inst: any) =>
    inst.status === 'pending' && inst.due_date < today ? 'overdue' : inst.status;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-neutral-100">
          <div>
            <div className="font-semibold text-neutral-900 text-base">{pledge?.donor_name ?? '…'}</div>
            {pledge && (
              <div className="text-xs text-neutral-500 mt-0.5">
                {pledge.frequency?.replace('_',' ')} · {pledge.campaign ?? 'No campaign'}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none ml-3" aria-label="Close">×</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-red-500 text-sm">{error}</div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
            {/* Summary */}
            <div className="px-5 py-4 grid grid-cols-3 gap-3 text-sm">
              {[
                { label: 'Pledged',     value: fmt(pledge.total_amount), color: 'text-neutral-900' },
                { label: 'Received',    value: fmt(pledge.received),     color: 'text-green-700' },
                { label: 'Outstanding', value: fmt(pledge.outstanding),  color: pledge.overdue > 0 ? 'text-red-700' : 'text-neutral-900' },
              ].map(k => (
                <div key={k.label} className="bg-neutral-50 rounded-lg px-3 py-2">
                  <div className="text-xs text-neutral-500">{k.label}</div>
                  <div className={`font-semibold mt-0.5 ${k.color}`}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="px-5 py-3">
              <div className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Progress</span>
                <span>{pledge.paid_count}/{pledge.installment_count} installments</span>
              </div>
              <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div className="h-full bg-azure rounded-full transition-all"
                  style={{ width: `${pledge.installment_count > 0 ? (pledge.resolved_count / pledge.installment_count) * 100 : 0}%` }} />
              </div>
            </div>

            {/* Installments */}
            <div className="px-5 py-4">
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-3">Installments</div>
              <div className="space-y-2">
                {installments.map((inst: any) => {
                  const eff = effectiveStatus(inst);
                  const isActing = acting?.startsWith(inst.id);
                  return (
                    <div key={inst.id} className="border border-neutral-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-neutral-900">{fmt(inst.amount)}</div>
                          <div className="text-xs text-neutral-500">Due {inst.due_date}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${eff === 'overdue' ? 'bg-red-100 text-red-700' : INST_BADGE[inst.status] ?? ''}`}>
                            {eff === 'overdue' ? 'Overdue' : inst.status.replace('_',' ')}
                          </span>
                          {inst.status === 'pending' && (
                            <button onClick={() => setPayForm({ id: inst.id, paidAt: new Date().toISOString().slice(0,10), payRef: '' })}
                              disabled={!!isActing}
                              className="text-xs px-2 py-1 border border-azure text-azure rounded hover:bg-azure/5 disabled:opacity-50">
                              Record Payment
                            </button>
                          )}
                          {inst.status === 'pending' && (
                            <button onClick={() => setConfirm({ id: inst.id, action: 'waive', label: 'Waive this installment?' })}
                              disabled={!!isActing}
                              className="text-xs px-2 py-1 border border-neutral-300 text-neutral-600 rounded hover:bg-neutral-50 disabled:opacity-50">
                              Waive
                            </button>
                          )}
                          {inst.status !== 'pending' && inst.status !== 'written_off' && (
                            <button onClick={() => setConfirm({ id: inst.id, action: 'reopen', label: 'Reopen this installment? This will reverse the recorded payment.' })}
                              disabled={!!isActing}
                              className="text-xs text-neutral-500 hover:text-neutral-700 underline disabled:opacity-50">
                              Reopen
                            </button>
                          )}
                        </div>
                      </div>
                      {inst.payment_ref && <div className="text-xs text-neutral-400 mt-1">Ref: {inst.payment_ref}</div>}

                      {/* Payment form */}
                      {payForm?.id === inst.id && (
                        <div className="mt-3 pt-3 border-t border-neutral-100 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-neutral-500 mb-1 block">Paid date</label>
                              <input type="date" value={payForm.paidAt}
                                onChange={e => setPayForm(f => f ? { ...f, paidAt: e.target.value } : f)}
                                className="w-full px-2 py-1.5 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-azure focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs text-neutral-500 mb-1 block">Reference (optional)</label>
                              <input value={payForm.payRef}
                                onChange={e => setPayForm(f => f ? { ...f, payRef: e.target.value } : f)}
                                className="w-full px-2 py-1.5 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-azure focus:outline-none" />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setPayForm(null)} className="text-xs text-neutral-500 hover:text-neutral-700">Cancel</button>
                            <button
                              onClick={() => doAction(inst.id, 'mark_paid', { paid_at: payForm.paidAt ? new Date(payForm.paidAt).toISOString() : undefined, payment_ref: payForm.payRef || undefined, create_contribution: true })}
                              disabled={!!isActing}
                              className="px-3 py-1 text-xs font-medium bg-azure text-white rounded hover:bg-azure/90 disabled:opacity-50">
                              {isActing ? 'Saving…' : 'Confirm Payment'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Event history */}
            {events.length > 0 && (
              <div className="px-5 py-4">
                <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-3">History</div>
                <div className="space-y-1.5">
                  {events.slice(0, 10).map((e: any) => (
                    <div key={e.id} className="text-xs text-neutral-500">
                      <span className="font-medium text-neutral-700">{e.event_type.replace(/_/g,' ')}</span>
                      {' · '}{new Date(e.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Confirm dialog */}
        {confirm && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="bg-white rounded-xl shadow-xl p-5 mx-4 max-w-sm w-full">
              <p className="text-sm text-neutral-800 mb-4">{confirm.label}</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirm(null)} className="px-3 py-1.5 text-sm border border-neutral-300 rounded hover:bg-neutral-50">Cancel</button>
                <button onClick={() => doAction(confirm.id, confirm.action)}
                  className="px-3 py-1.5 text-sm font-medium bg-neutral-800 text-white rounded hover:bg-neutral-700">
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/pledges/PledgeDetailPanel.tsx
git commit -m "feat(pledges): pledge detail slide-over panel"
```

---

## Task 11: Dashboard Page

**Files:**
- Create: `app/dashboard/pledges/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/dashboard/pledges/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import PledgePipelineDashboard from '@/components/pledges/PledgePipelineDashboard';

export const dynamic = 'force-dynamic';

async function getOrgId(cookieHeader: string, base: string): Promise<{ orgId: string | null; hasPledges: boolean }> {
  try {
    const res = await fetch(`${base}/api/org`, { cache: 'no-store', headers: { cookie: cookieHeader } });
    if (!res.ok) return { orgId: null, hasPledges: false };
    const data = await res.json();
    const org = data.organizations?.[0];
    return { orgId: org?.id ?? null, hasPledges: !!(org?.modules?.pledges) };
  } catch { return { orgId: null, hasPledges: false }; }
}

export default async function PledgesPage() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host  = h.get('host') ?? 'localhost:3000';
  const base  = `${proto}://${host}`;
  const cookie = h.get('cookie') ?? '';

  const { orgId, hasPledges } = await getOrgId(cookie, base);

  if (!orgId) redirect('/');
  if (!hasPledges) redirect('/dashboard/donors');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Pledge Pipeline</h1>
        <p className="text-sm text-neutral-500 mt-1">Committed gifts, installment schedules, and fulfillment tracking</p>
      </div>
      <PledgePipelineDashboard orgId={orgId} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/pledges/page.tsx
git commit -m "feat(pledges): /dashboard/pledges page"
```

---

## Task 12: Donor Profile Integration

**Files:**
- Modify: `app/dashboard/donors/[donorId]/page.tsx`

The donor profile page is a large client component. Add a Pledges section after the contribution history table. Do NOT refactor the existing component — add minimally.

- [ ] **Step 1: Add pledge state and imports**

At the top of `app/dashboard/donors/[donorId]/page.tsx`, add these imports after the existing imports:

```tsx
import PledgeCreateModal from '@/components/pledges/PledgeCreateModal';
import PledgeDetailPanel from '@/components/pledges/PledgeDetailPanel';
```

Inside `DonorProfilePage`, add state after the existing state declarations:

```tsx
const [pledges, setPledges]           = useState<any[]>([]);
const [pledgesEnabled, setPledgesEnabled] = useState(false);
const [showPledgeCreate, setShowPledgeCreate] = useState(false);
const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);
const [pledgesLoading, setPledgesLoading]     = useState(false);
```

- [ ] **Step 2: Fetch pledges when org modules are loaded**

In the existing `fetchOrg` useEffect, after `setOrgId(...)`, read pledge module status and fetch pledges:

```tsx
const pledgesOn = !!(data.organizations?.[0]?.modules?.pledges);
setPledgesEnabled(pledgesOn);
if (pledgesOn && donorId) {
  setPledgesLoading(true);
  fetch(`/api/org/${data.organizations[0].id}/pledges?donor_id=${donorId}&status=all`)
    .then(r => r.json())
    .then(d => setPledges(d.pledges ?? []))
    .catch(() => {})
    .finally(() => setPledgesLoading(false));
}
```

- [ ] **Step 3: Add pledges section to JSX**

After the closing `</div>` of the "Contribution History" section, add:

```tsx
{pledgesEnabled && (
  <div className="bg-white rounded-lg border border-gray-200 mb-6">
    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
      <h2 className="font-semibold text-gray-900">Pledges</h2>
      <button
        onClick={() => setShowPledgeCreate(true)}
        className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">
        + New Pledge
      </button>
    </div>
    {pledgesLoading ? (
      <div className="px-6 py-6 text-center text-gray-400 text-sm">Loading…</div>
    ) : pledges.length === 0 ? (
      <div className="px-6 py-6 text-center text-gray-400 text-sm">No pledges recorded.</div>
    ) : (
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Total</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Received</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Next Due</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pledges.map((p: any) => (
            <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedPledgeId(p.id)}>
              <td className="px-6 py-3 font-medium text-gray-900">${Number(p.total_amount).toLocaleString()}</td>
              <td className="px-6 py-3 text-green-700">${Number(p.received).toLocaleString()}</td>
              <td className="px-6 py-3 text-gray-600">{p.next_due_date ?? '—'}</td>
              <td className="px-6 py-3">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                  p.pipeline_status === 'overdue' ? 'bg-red-100 text-red-800' :
                  p.pipeline_status === 'due_soon' ? 'bg-amber-100 text-amber-800' :
                  p.pipeline_status === 'fulfilled' ? 'bg-indigo-100 text-indigo-800' :
                  'bg-green-100 text-green-800'
                }`}>{p.pipeline_status?.replace('_',' ')}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)}

{showPledgeCreate && orgId && (
  <PledgeCreateModal
    orgId={orgId}
    prefillDonorId={donorId}
    prefillDonorName={displayName}
    onClose={() => setShowPledgeCreate(false)}
    onCreated={() => {
      setShowPledgeCreate(false);
      fetch(`/api/org/${orgId}/pledges?donor_id=${donorId}&status=all`)
        .then(r => r.json()).then(d => setPledges(d.pledges ?? [])).catch(() => {});
    }}
  />
)}
{selectedPledgeId && orgId && (
  <PledgeDetailPanel
    orgId={orgId}
    pledgeId={selectedPledgeId}
    onClose={() => setSelectedPledgeId(null)}
    onChanged={() => {
      fetch(`/api/org/${orgId}/pledges?donor_id=${donorId}&status=all`)
        .then(r => r.json()).then(d => setPledges(d.pledges ?? [])).catch(() => {});
    }}
  />
)}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/dashboard/donors/[donorId]/page.tsx"
git commit -m "feat(pledges): add pledges section to donor profile"
```

---

## Task 13: Header Navigation

**Files:**
- Modify: `components/Header.tsx`

- [ ] **Step 1: Add Pledges nav link**

In `components/Header.tsx`, find the block that renders the Donors nav link (there are two — one for desktop, one for mobile). After each Donors `<Link>` block, add a Pledges link:

**Desktop nav** (near line 192, after the Donors link `</a>` or `</Link>`):

```tsx
{orgModules.donors && orgModules.pledges && (
  <a
    href="/dashboard/pledges"
    aria-current={pathname.startsWith('/dashboard/pledges') ? 'page' : undefined}
    className={/* use the same className pattern as the Donors link */}
  >
    Pledges
  </a>
)}
```

**Mobile nav** (near line 293, same pattern):

```tsx
{orgModules.donors && orgModules.pledges && (
  <a
    href="/dashboard/pledges"
    aria-current={pathname.startsWith('/dashboard/pledges') ? 'page' : undefined}
    className={/* same className as mobile Donors link */}
  >
    Pledges
  </a>
)}
```

- [ ] **Step 2: Update Dashboard `aria-current` to exclude /dashboard/pledges**

Find the main Dashboard link's `aria-current` expression (currently excludes `/dashboard/donors`, `/dashboard/tax`, `/dashboard/compliance`, `/dashboard/settings`). Add `&& !pathname.startsWith('/dashboard/pledges')` to that condition.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/Header.tsx
git commit -m "feat(pledges): add Pledges nav link to Header"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
npm run test:run 2>&1 | tail -20
```

Expected: all tests pass including the new schedule tests.

- [ ] **TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Commit any remaining changes**

```bash
git status
```

If anything is unstaged, add and commit before finishing.
