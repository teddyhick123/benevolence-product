# Pledge Tracking Design

## Overview

Build a first-class pledge tracking system for Benevolence's Donor CRM. The feature should let an organization record donor commitments, generate and edit installment schedules, forecast expected receipts, record payments against installments, and see which commitments need attention.

This replaces the earlier v1 pledge draft. The main upgrade is that pledge tracking is treated as a real financial workflow, not just a UI table:

- Pledges are a module-gated feature with an explicit dependency on donor management.
- Pledge creation and payment mutations are transactional.
- Money validation happens in cents on the server.
- Paid pledge installments can create or link `contributions_received` records.
- Dashboard status is computed from installment state without read-time side effects.
- The donor profile becomes a complete commitment and giving history.

Addresses backlog items **Dr-U3** (no pledge tracking UI) and **Dr-F6** (pledge tracking plus installment schedule).

---

## Product Goals

1. Give fundraisers and finance users one reliable view of committed, received, outstanding, overdue, and upcoming pledge revenue.
2. Let users create pledge schedules quickly while still supporting custom schedules and edge cases.
3. Make "record payment" a clean operational path that updates pledge state and contribution history together.
4. Prevent cross-org data leakage or mismatched donor/contribution links at the database level.
5. Keep the first release implementation focused enough to ship, while leaving clean extension points for reminders, imports, accounting sync, and pledge documents.

## Non-Goals For This Release

- Automated email/SMS pledge reminders.
- QuickBooks pledge object sync.
- CSV import/export of pledge schedules.
- Soft-credit attribution and household giving.
- Document signing workflows.
- AI pledge tools.

These should be designed as extensions, not blockers for the core release.

---

## Architecture Decisions

### Module Model

Create a new first-class module named `pledge_tracking`.

```ts
// lib/modules/types.ts
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
```

Add it to:

- `lib/modules/types.ts`
- `lib/modules/registry.ts`
- `lib/modules/client-info.ts`
- `db/0060_organization_modules.sql` seed data
- module settings UI

Registry definition:

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

### Legacy Module Compatibility

This repo currently has both of these patterns in use:

- newer module rows: `modules` plus `organization_modules`
- legacy JSON flags: `organizations.modules`, with keys like `donors`, `tax`, `compliance`

The implementation must not add a third interpretation.

Use `pledge_tracking` as the canonical module id. For compatibility, update the existing `org_has_module` Postgres function (defined in `0001_extensions_and_shared_infra.sql`) inside `0038_pledge_tracking.sql` using `CREATE OR REPLACE FUNCTION` so these aliases work:

| Requested key | Canonical behavior |
| --- | --- |
| `donor_management` | true if `organization_modules` has `donor_management`, or legacy `organizations.modules.donors = true` |
| `donors` | alias for `donor_management` |
| `pledge_tracking` | true if `organization_modules` has `pledge_tracking`, or legacy `organizations.modules.pledges = true` |
| `pledges` | alias for `pledge_tracking` |

`/api/org` should continue returning a client-friendly `modules` object, but it should derive it from the canonical module system and include:

```ts
{
  donors: boolean,
  pledges: boolean,
  tax: boolean,
  compliance: boolean,
  quickbooks: boolean
}
```

The `/api/org/[orgId]/modules` route currently supports `GET` and `POST`; do not spec or implement a `PATCH` endpoint unless the route is intentionally changed.

### Permission Model

- View pledge data: org role `member` or higher, not viewer. Pledge records are donor CRM data and include PII-adjacent relationship information.
- Create/update pledge data: `member` or higher.
- Cancel/default/write off pledge: `admin` or owner.
- Delete is a soft delete and requires `admin` or owner.
- Service role has full access for API/RPC operations.

---

## Database

Create the next active migration. The current last migration is `0037_qb_sync_log.sql`, so use:

```text
db/migrations/0038_pledge_tracking.sql
```

### Enums

Prefer enums or strict `CHECK` constraints over free-form text.

```sql
CREATE TYPE pledge_frequency_enum AS ENUM (
  'one_time',
  'monthly',
  'quarterly',
  'annually',
  'custom'
);

CREATE TYPE pledge_status_enum AS ENUM (
  'active',
  'fulfilled',
  'cancelled',
  'defaulted',
  'written_off'
);

CREATE TYPE pledge_commitment_type_enum AS ENUM (
  'verbal',
  'written',
  'online',
  'imported'
);

CREATE TYPE pledge_installment_status_enum AS ENUM (
  'pending',
  'paid',
  'waived',
  'written_off'
);

CREATE TYPE pledge_event_type_enum AS ENUM (
  'created',
  'updated',
  'schedule_changed',
  'installment_paid',
  'installment_waived',
  'installment_reopened',
  'cancelled',
  'defaulted',
  'written_off',
  'fulfilled'
);
```

### `pledges`

```sql
CREATE TABLE public.pledges (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_id              uuid NOT NULL,

  total_amount          numeric(20,2) NOT NULL CHECK (total_amount > 0),
  currency              text NOT NULL DEFAULT 'USD',

  start_date            date NOT NULL,
  end_date              date,
  frequency             pledge_frequency_enum NOT NULL DEFAULT 'one_time',
  status                pledge_status_enum NOT NULL DEFAULT 'active',
  commitment_type       pledge_commitment_type_enum NOT NULL DEFAULT 'written',

  campaign              text,
  fund_designation      text,
  restriction_purpose   text,
  relationship_manager  uuid REFERENCES auth.users(id),
  signed_at             timestamptz,
  source                text,
  external_id           text,
  notes                 text,
  custom_fields         jsonb NOT NULL DEFAULT '{}',

  created_by            uuid REFERENCES auth.users(id),
  cancelled_at          timestamptz,
  cancelled_by          uuid REFERENCES auth.users(id),
  cancellation_reason   text,
  deleted_at            timestamptz,
  deleted_by            uuid REFERENCES auth.users(id),

  CONSTRAINT pledges_end_after_start
    CHECK (end_date IS NULL OR end_date >= start_date)
);
```

Add a composite FK so a pledge cannot point at a donor from another org:

```sql
ALTER TABLE public.donors
  ADD CONSTRAINT donors_org_id_id_unique UNIQUE (org_id, id);

ALTER TABLE public.pledges
  ADD CONSTRAINT pledges_org_donor_fk
  FOREIGN KEY (org_id, donor_id)
  REFERENCES public.donors (org_id, id)
  ON DELETE RESTRICT;
```

Indexes:

```sql
CREATE INDEX idx_pledges_org_donor
  ON public.pledges (org_id, donor_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_pledges_org_status
  ON public.pledges (org_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_pledges_org_campaign
  ON public.pledges (org_id, campaign)
  WHERE campaign IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_pledges_external_id
  ON public.pledges (org_id, source, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;
```

### `pledge_installments`

```sql
CREATE TABLE public.pledge_installments (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pledge_id             uuid NOT NULL,

  due_date              date NOT NULL,
  amount                numeric(20,2) NOT NULL CHECK (amount > 0),
  status                pledge_installment_status_enum NOT NULL DEFAULT 'pending',

  paid_at               timestamptz,
  waived_at             timestamptz,
  written_off_at        timestamptz,
  acted_by              uuid REFERENCES auth.users(id),
  payment_ref           text,
  contribution_id       uuid,
  notes                 text,

  CONSTRAINT installment_paid_requires_paid_at
    CHECK (status != 'paid' OR paid_at IS NOT NULL),
  CONSTRAINT installment_unpaid_has_no_paid_at
    CHECK (status = 'paid' OR paid_at IS NULL)
);
```

Composite FK:

```sql
ALTER TABLE public.pledges
  ADD CONSTRAINT pledges_org_id_id_unique UNIQUE (org_id, id);

ALTER TABLE public.pledge_installments
  ADD CONSTRAINT pledge_installments_org_pledge_fk
  FOREIGN KEY (org_id, pledge_id)
  REFERENCES public.pledges (org_id, id)
  ON DELETE CASCADE;
```

Contribution link integrity:

```sql
ALTER TABLE public.contributions_received
  ADD CONSTRAINT contributions_received_org_id_id_unique UNIQUE (org_id, id);

ALTER TABLE public.pledge_installments
  ADD CONSTRAINT pledge_installments_org_contribution_fk
  FOREIGN KEY (org_id, contribution_id)
  REFERENCES public.contributions_received (org_id, id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_pledge_installments_contribution_unique
  ON public.pledge_installments (contribution_id)
  WHERE contribution_id IS NOT NULL;
```

Indexes:

```sql
CREATE INDEX idx_installments_pledge
  ON public.pledge_installments (pledge_id, due_date);

CREATE INDEX idx_installments_org_due
  ON public.pledge_installments (org_id, status, due_date);

CREATE INDEX idx_installments_org_overdue
  ON public.pledge_installments (org_id, due_date)
  WHERE status = 'pending';
```

### `pledge_events`

Immutable audit history for meaningful pledge changes.

```sql
CREATE TABLE public.pledge_events (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pledge_id      uuid NOT NULL REFERENCES public.pledges(id) ON DELETE CASCADE,
  installment_id uuid REFERENCES public.pledge_installments(id) ON DELETE SET NULL,
  event_type     pledge_event_type_enum NOT NULL,
  actor_id       uuid REFERENCES auth.users(id),
  before_values  jsonb,
  after_values   jsonb,
  notes          text
);

CREATE INDEX idx_pledge_events_pledge
  ON public.pledge_events (pledge_id, created_at DESC);

CREATE INDEX idx_pledge_events_org
  ON public.pledge_events (org_id, created_at DESC);
```

### Contribution Table Extension

`contributions_received` already has pledge-related fields in the donor migration. Add missing referential integrity and, if desired, a direct installment pointer.

```sql
ALTER TABLE public.contributions_received
  ADD CONSTRAINT contributions_received_pledge_fk
  FOREIGN KEY (pledge_id)
  REFERENCES public.pledges(id)
  ON DELETE SET NULL;

ALTER TABLE public.contributions_received
  ADD COLUMN IF NOT EXISTS pledge_installment_id uuid;

ALTER TABLE public.contributions_received
  ADD CONSTRAINT contributions_received_pledge_installment_fk
  FOREIGN KEY (pledge_installment_id)
  REFERENCES public.pledge_installments(id)
  ON DELETE SET NULL;
```

When a pledge installment creates a contribution:

- `contributions_received.org_id = pledge.org_id`
- `contributions_received.donor_id = pledge.donor_id`
- `contributions_received.amount = installment.amount`
- `contributions_received.contribution_date = paid_at::date`
- `contributions_received.currency = pledge.currency`
- `contributions_received.gift_type = 'pledge'` if using the canonical schema
- `contributions_received.pledge_id = pledge.id`
- `contributions_received.pledge_installment_id = installment.id`
- `contributions_received.is_pledge = false`

Important: the existing donor aggregate trigger excludes rows where `is_pledge = true`. A paid installment is an actual received gift, so it should remain `is_pledge = false`.

### Pipeline View

Create a read-only view for dashboard data. It should compute status without mutating data.

```sql
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
    WHEN d.is_organization THEN COALESCE(d.organization_name, 'Unknown Organization')
    ELSE NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '')
  END AS donor_name,
  COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) AS received,
  COALESCE(SUM(i.amount) FILTER (WHERE i.status IN ('pending')), 0) AS outstanding,
  COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'pending' AND i.due_date < CURRENT_DATE), 0) AS overdue,
  MIN(i.due_date) FILTER (WHERE i.status = 'pending') AS next_due_date,
  (
    SELECT i2.amount
    FROM public.pledge_installments i2
    WHERE i2.pledge_id = p.id
      AND i2.status = 'pending'
    ORDER BY i2.due_date ASC, i2.created_at ASC
    LIMIT 1
  ) AS next_due_amount,
  COUNT(i.id) AS installment_count,
  COUNT(i.id) FILTER (WHERE i.status = 'paid') AS paid_count,
  COUNT(i.id) FILTER (WHERE i.status IN ('paid', 'waived', 'written_off')) AS resolved_count,
  CASE
    WHEN p.status IN ('cancelled', 'defaulted', 'written_off') THEN p.status::text
    WHEN COUNT(i.id) > 0
      AND COUNT(i.id) = COUNT(i.id) FILTER (WHERE i.status IN ('paid', 'waived', 'written_off'))
      THEN 'fulfilled'
    WHEN EXISTS (
      SELECT 1 FROM public.pledge_installments overdue_i
      WHERE overdue_i.pledge_id = p.id
        AND overdue_i.status = 'pending'
        AND overdue_i.due_date < CURRENT_DATE
    ) THEN 'overdue'
    WHEN MIN(i.due_date) FILTER (WHERE i.status = 'pending') <= CURRENT_DATE + INTERVAL '30 days'
      THEN 'due_soon'
    ELSE 'on_track'
  END AS pipeline_status
FROM public.pledges p
JOIN public.donors d
  ON d.id = p.donor_id
LEFT JOIN public.pledge_installments i
  ON i.pledge_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, d.id;
```

### RLS

Enable RLS on all new tables.

Policies:

```sql
-- pledges
CREATE POLICY "pledges_read" ON public.pledges
  FOR SELECT TO authenticated
  USING (
    public.org_role_gte(org_id, 'member')
    AND public.org_has_module(org_id, 'pledge_tracking')
    AND deleted_at IS NULL
  );

CREATE POLICY "pledges_member_write" ON public.pledges
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit_org(org_id)
    AND public.org_has_module(org_id, 'pledge_tracking')
  );

CREATE POLICY "pledges_member_update" ON public.pledges
  FOR UPDATE TO authenticated
  USING (
    public.can_edit_org(org_id)
    AND public.org_has_module(org_id, 'pledge_tracking')
    AND deleted_at IS NULL
  )
  WITH CHECK (
    public.can_edit_org(org_id)
    AND public.org_has_module(org_id, 'pledge_tracking')
  );

CREATE POLICY "pledges_service" ON public.pledges
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
```

Use equivalent policies for `pledge_installments`. `pledge_events` should allow authenticated users to read their org's pledge events, but only service/RPC paths should insert events.

### RPC Functions

Implement RPC functions for mutations that need atomicity.

#### `create_pledge_with_installments`

Inputs:

```sql
p_org_id uuid,
p_donor_id uuid,
p_total_amount numeric,
p_currency text,
p_start_date date,
p_end_date date,
p_frequency text,
p_commitment_type text,
p_campaign text,
p_fund_designation text,
p_restriction_purpose text,
p_relationship_manager uuid,
p_signed_at timestamptz,
p_notes text,
p_installments jsonb
```

Responsibilities:

- Verify `can_edit_org(p_org_id)`.
- Verify `org_has_module(p_org_id, 'pledge_tracking')`.
- Verify `org_has_module(p_org_id, 'donor_management')`.
- Verify donor belongs to the same org and is not deleted.
- Validate total amount and each installment amount in cents.
- Require at least one installment.
- Require installment amount sum exactly equals pledge total.
- Require due dates are valid and sorted or sort them deterministically before insert.
- Insert pledge, installments, and a `pledge_events.created` row in one transaction.
- Return the created pledge id or full row.

#### `update_pledge_installment_status`

Inputs:

```sql
p_org_id uuid,
p_pledge_id uuid,
p_installment_id uuid,
p_action text, -- 'mark_paid' | 'waive' | 'write_off' | 'reopen'
p_paid_at timestamptz,
p_payment_ref text,
p_contribution_id uuid,
p_create_contribution boolean,
p_notes text
```

Responsibilities:

- Verify permission and module access.
- Lock the pledge and installment rows with `FOR UPDATE`.
- Ensure pledge and installment belong to the same org.
- For `mark_paid`, require either `p_create_contribution = true` or a valid `p_contribution_id`.
- If linking an existing contribution, ensure it belongs to the same org and donor.
- If creating a contribution, insert the contribution row using canonical contribution columns.
- Update installment status, contribution id, `paid_at`, `payment_ref`, `acted_by`, and notes.
- If all installments are resolved, set pledge status to `fulfilled` and write a `fulfilled` event.
- If reopening an installment on a fulfilled pledge, set pledge status back to `active`.
- Write a `pledge_events.installment_*` row.
- Return the updated pledge summary and installment list.

Avoid read-time mutations in `GET` endpoints.

---

## Schedule Generation

Create:

```text
lib/pledges/schedule.ts
lib/pledges/schedule.test.ts
```

The client uses this utility for preview only. The server/RPC must revalidate the submitted schedule.

Types:

```ts
export type Frequency = 'one_time' | 'monthly' | 'quarterly' | 'annually' | 'custom';

export interface ScheduleInput {
  totalAmount: number;
  startDate: string;          // YYYY-MM-DD
  endDate?: string;           // required unless one_time or installmentCount is provided
  frequency: Frequency;
  installmentCount?: number;
  anchorDay?: number;         // default: day of startDate
}

export interface ScheduledInstallment {
  due_date: string;
  amount: number;
}

export function generateSchedule(input: ScheduleInput): ScheduledInstallment[];
```

Rules:

- Use integer cents internally. Never distribute by floating point math.
- `one_time`: one installment for full amount on `startDate`.
- `monthly`, `quarterly`, `annually`: generate dates from start date through end date, inclusive.
- If `installmentCount` is provided, generate exactly that many installments from `startDate` using the selected interval.
- If a target month lacks the anchor day, clamp to the last day of that month. Example: Jan 31 monthly -> Feb 28/29, Mar 31.
- Last installment receives the rounding remainder.
- `custom` returns an empty array and the UI requires manual rows.
- Throw typed validation errors for missing dates, invalid dates, zero/negative totals, zero/negative counts, or unsupported frequencies.

Test cases:

- one-time pledge
- even monthly split
- uneven monthly split with penny remainder
- quarterly schedule
- annual schedule
- end-of-month monthly schedule
- one-installment recurring schedule
- invalid end date before start date
- custom returns empty

---

## API Routes

All routes live under:

```text
app/api/org/[orgId]/pledges
```

Use `createServerClient()` for auth and RLS-aware reads. Use RPCs for mutation transactions. Validate request bodies with Zod in:

```text
lib/schemas/pledge.ts
```

### `GET /api/org/[orgId]/pledges`

Returns dashboard KPIs plus paginated pledge rows.

Query params:

```ts
{
  status?: 'active' | 'fulfilled' | 'cancelled' | 'defaulted' | 'written_off' | 'all',
  pipeline_status?: 'overdue' | 'due_soon' | 'on_track' | 'fulfilled' | 'cancelled' | 'defaulted' | 'written_off',
  donor_id?: string,
  campaign?: string,
  start_date?: string,
  end_date?: string,
  q?: string,
  limit?: number,
  offset?: number,
}
```

Response:

```ts
{
  kpis: {
    committed: number,
    received: number,
    outstanding: number,
    overdue: number,
    dueSoon: number,
    fulfillmentRate: number,
  },
  aging: {
    current: number,
    days1To30: number,
    days31To60: number,
    days61To90: number,
    days90Plus: number,
  },
  forecast: Array<{
    month: string,
    expected: number,
    received: number,
  }>,
  attention: {
    overdue: PledgeRow[],
    dueSoon: PledgeRow[],
  },
  pledges: PledgeRow[],
  total: number,
}
```

`PledgeRow`:

```ts
{
  id: string,
  donor_id: string,
  donor_name: string,
  total_amount: number,
  currency: string,
  received: number,
  outstanding: number,
  overdue: number,
  next_due_date: string | null,
  next_due_amount: number | null,
  pipeline_status: 'overdue' | 'due_soon' | 'on_track' | 'fulfilled' | 'cancelled' | 'defaulted' | 'written_off',
  status: 'active' | 'fulfilled' | 'cancelled' | 'defaulted' | 'written_off',
  frequency: Frequency,
  campaign: string | null,
  fund_designation: string | null,
  start_date: string,
  end_date: string | null,
  installment_count: number,
  paid_count: number,
  resolved_count: number,
}
```

### `POST /api/org/[orgId]/pledges`

Creates a pledge and installments by calling `create_pledge_with_installments`.

Request:

```ts
{
  donor_id: string,
  total_amount: number,
  currency?: string,
  start_date: string,
  end_date?: string,
  frequency: Frequency,
  commitment_type?: 'verbal' | 'written' | 'online' | 'imported',
  campaign?: string,
  fund_designation?: string,
  restriction_purpose?: string,
  relationship_manager?: string,
  signed_at?: string,
  notes?: string,
  installments: Array<{
    due_date: string,
    amount: number,
    notes?: string,
  }>,
}
```

Response:

```ts
{
  pledge: PledgeDetail,
  installments: PledgeInstallment[],
}
```

### `GET /api/org/[orgId]/pledges/[pledgeId]`

Returns:

- pledge detail
- full installment list
- linked contribution summaries
- event history

### `PATCH /api/org/[orgId]/pledges/[pledgeId]`

Updates editable pledge metadata:

- `campaign`
- `fund_designation`
- `restriction_purpose`
- `relationship_manager`
- `commitment_type`
- `signed_at`
- `notes`
- `custom_fields`

Do not allow direct edits to `total_amount`, `donor_id`, or generated installments through this endpoint. Schedule amendments should use a dedicated future endpoint because they need audit history and financial controls.

### `POST /api/org/[orgId]/pledges/[pledgeId]/cancel`

Admin-only. Soft-cancels the pledge:

- set status `cancelled`
- set `cancelled_at`, `cancelled_by`, `cancellation_reason`
- set unresolved pending installments to `waived` or leave pending based on request option
- write event

### `DELETE /api/org/[orgId]/pledges/[pledgeId]`

Admin-only soft delete:

- set `deleted_at`
- set `deleted_by`
- do not hard-delete installments or events

### `PATCH /api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]`

Calls `update_pledge_installment_status`.

Request:

```ts
{
  action: 'mark_paid' | 'waive' | 'write_off' | 'reopen',
  paid_at?: string,
  payment_ref?: string,
  contribution_id?: string,
  create_contribution?: boolean,
  notes?: string,
}
```

Behavior:

- `mark_paid` can link an existing contribution or create one.
- `waive` removes an installment from outstanding without recording received revenue.
- `write_off` removes an installment from collectible outstanding and should be visible in reporting.
- `reopen` returns an installment to pending and unlinks the contribution only if the contribution was pledge-created and has not been acknowledged/exported. Otherwise, block and explain why.

---

## Frontend

### File Map

| Action | Path |
| --- | --- |
| Create | `app/dashboard/pledges/page.tsx` |
| Create | `components/pledges/PledgePipelineDashboard.tsx` |
| Create | `components/pledges/PledgeCreateModal.tsx` |
| Create | `components/pledges/PledgeDetailPanel.tsx` |
| Create | `components/pledges/PledgeInstallmentAction.tsx` |
| Create | `lib/pledges/schedule.ts` |
| Create | `lib/schemas/pledge.ts` |
| Modify | `app/dashboard/donors/[donorId]/page.tsx` |
| Modify | `components/Header.tsx` |
| Modify | `lib/modules/*` |
| Modify | module settings UI |

Note: `components/donors/DonorDetail.tsx` appears to use legacy donor field names. Do not build the canonical pledge profile integration on top of that component without first reconciling it with the current donor schema.

### `/dashboard/pledges/page.tsx`

Server component responsibilities:

1. Resolve the active org from the same source used by `/api/org` and header navigation.
2. Verify the user has `member` or higher access.
3. Verify `org_has_module(org_id, 'pledge_tracking')`.
4. Redirect to `/dashboard/donors` with a lightweight notice if donor management is enabled but pledge tracking is not.
5. Render `<PledgePipelineDashboard orgId={orgId} />`.

### `PledgePipelineDashboard`

Use SWR to fetch `/api/org/[orgId]/pledges`.

Layout:

- KPI strip:
  - Committed
  - Received
  - Outstanding
  - Overdue
  - Fulfillment rate
- Forecast chart:
  - expected receipts by month
  - received pledge payments by month
- Attention queue:
  - overdue installments
  - due in next 30 days
  - capped with "View all"
- Pledge table:
  - Donor
  - Pledged
  - Received
  - Outstanding
  - Next due
  - Campaign/fund
  - Status
  - Row action menu

Filters:

- All
- Needs attention
- Overdue
- Due soon
- Active
- Fulfilled
- Cancelled/defaulted
- Campaign
- Donor search

Interactions:

- `New Pledge` opens `PledgeCreateModal`.
- Row click opens `PledgeDetailPanel`.
- Attention item click opens the relevant pledge and focuses the installment.
- Successful mutations revalidate the list and selected detail SWR keys.

### `PledgeCreateModal`

Use a four-step modal instead of three. The extra step prevents bad financial data and makes the experience feel less cramped.

1. **Donor and Terms**
   - donor picker using `GET /api/org/[orgId]/donors?name=<q>&limit=10`
   - total amount
   - currency
   - commitment type
   - campaign
   - fund designation
   - restriction purpose
   - relationship manager

2. **Schedule**
   - start date
   - end date
   - frequency
   - optional installment count override
   - generated preview

3. **Adjust Installments**
   - editable due dates and amounts
   - add/remove rows for custom schedules
   - running total with exact difference
   - disable continue until total matches pledge amount

4. **Review**
   - donor name
   - total pledge
   - schedule summary
   - first due date and final due date
   - "Create pledge" action

Validation:

- donor required
- total amount greater than zero
- schedule has at least one installment
- all installment amounts greater than zero
- installment sum exactly equals total amount
- end date required for recurring schedules unless installment count is provided

### `PledgeDetailPanel`

Slide-over panel with:

- header: donor name, pledge status, campaign/fund, edit/cancel actions
- summary: pledged, received, outstanding, overdue
- progress bar by resolved amount
- installment table with per-row actions
- linked contribution/receipt status where available
- event history

Installment actions:

- `Record Payment`
  - paid date
  - payment reference
  - create contribution checkbox, default true
  - optional link existing contribution
- `Waive`
- `Write Off`
- `Reopen`

Guard destructive actions with confirmation copy that names the financial effect.

### Donor Profile Integration

Modify `app/dashboard/donors/[donorId]/page.tsx` rather than assuming `DonorDetail` is canonical.

Add a Pledges section or tab when `pledge_tracking` is enabled:

- active pledges
- lifetime pledged
- received against pledges
- outstanding
- next due installment
- `New Pledge` button prefilled with this donor

The contribution history should identify pledge payments so users can see why a contribution exists.

### Header Navigation

In `components/Header.tsx`, add Pledges after Donors when both donor and pledge features are enabled:

```tsx
{orgModules.donors && orgModules.pledges && (
  <Link
    href="/dashboard/pledges"
    aria-current={pathname.startsWith('/dashboard/pledges') ? 'page' : undefined}
    className={navLinkClass}
  >
    Pledges
  </Link>
)}
```

Update Dashboard `aria-current` logic to exclude `/dashboard/pledges`.

Repeat for mobile navigation.

---

## UX Quality Bar

The implementation should feel like a working finance tool, not a demo screen.

Required states:

- loading skeletons
- empty state with "Create first pledge"
- no attention needed state
- validation errors inline near fields
- API error toast plus retry path
- disabled mutation controls while saving
- optimistic updates only when rollback is safe
- mobile table fallback to stacked rows

Accessibility:

- modal focus trap
- escape closes modal/panel unless a form is dirty
- buttons have clear names
- status badges are not color-only
- form errors use `aria-describedby`

Visual style:

- use existing Tailwind and brand tokens
- keep data-dense layout
- avoid marketing-style cards or oversized hero sections
- use compact tables, segmented filters, icon buttons where appropriate

---

## Testing Plan

### Unit Tests

- `lib/pledges/schedule.test.ts`
- `lib/schemas/pledge.test.ts`
- pipeline status helper tests if status logic is duplicated outside SQL

### Database/RPC Tests

Required scenarios:

- create pledge with valid schedule
- reject cross-org donor
- reject installment total mismatch
- reject empty installment list
- mark paid and create contribution
- mark paid and link existing same-org contribution
- reject linking cross-org contribution
- auto-fulfill pledge when all installments resolved
- reopen fulfilled pledge returns it to active
- cancelled pledge blocks payment mutation unless reopened
- RLS blocks viewer access
- module gating blocks org without pledge tracking

### API Tests

- `GET /pledges` returns correct KPIs, aging, attention, forecast
- `POST /pledges` calls transactional path and returns detail shape
- installment mutation handles paid, waive, write off, reopen
- admin-only cancellation and delete rules

### Frontend Tests

Use component tests for schedule editing and validation.

Use Playwright for:

1. create pledge from `/dashboard/pledges`
2. create pledge from donor profile
3. record installment payment and verify:
   - installment shows paid
   - pledge received/outstanding updates
   - donor contribution history includes payment
4. filter overdue/due soon
5. mobile dashboard renders without overlap

---

## Rollout Plan

1. Add module registry/types/client-info support for `pledge_tracking`.
2. Add database migration with enums, tables, RLS, views, RPCs, module seed, and compatibility alias behavior.
3. Add Zod schemas and schedule utility with tests.
4. Add API routes backed by RPCs.
5. Build dashboard and create/detail components.
6. Integrate donor profile and header navigation.
7. Add tests.
8. Run database migration locally and verify RLS/module behavior before shipping.

---

## Acceptance Criteria

- Admin can enable Pledge Tracking only when Donor Management is enabled.
- A member can create a pledge with a generated or custom installment schedule.
- Bad schedules cannot be created, including penny mismatches.
- The dashboard shows committed, received, outstanding, overdue, attention, and forecast numbers correctly.
- Marking an installment paid creates or links a contribution in the same org.
- Donor profile shows pledge commitments and pledge payment history.
- Fulfilled status is derived or updated only during write operations, not during reads.
- Cross-org donor/contribution links are blocked by database constraints or RPC validation.
- Viewer users cannot read pledge data.
- The feature is hidden when the module is disabled.
