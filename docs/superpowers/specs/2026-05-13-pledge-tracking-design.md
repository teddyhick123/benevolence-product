# Pledge Tracking Design

## Overview

Full pledge tracking module for the Benevolence Donor CRM. Adds structured pledge and installment records, an org-wide pipeline dashboard at `/dashboard/pledges`, a Pledges tab on each donor profile, and a 3-step pledge creation modal.

Addresses backlog items **Dr-U3** (no pledge tracking UI) and **Dr-F6** (pledge tracking + installment schedule).

---

## Database — Migration `0038_pledges.sql`

### `pledges` table

```sql
CREATE TABLE pledges (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id),
  donor_id     uuid        NOT NULL REFERENCES donors(id),
  total_amount numeric(20,2) NOT NULL CHECK (total_amount > 0),
  currency     text        NOT NULL DEFAULT 'USD',
  start_date   date        NOT NULL,
  end_date     date,
  frequency    text        NOT NULL DEFAULT 'one_time',
    -- 'one_time' | 'monthly' | 'quarterly' | 'annually' | 'custom'
  status       text        NOT NULL DEFAULT 'active',
    -- 'active' | 'fulfilled' | 'cancelled' | 'defaulted'
  campaign     text,
  notes        text,
  created_by   uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
```

### `pledge_installments` table

```sql
CREATE TABLE pledge_installments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pledge_id       uuid        NOT NULL REFERENCES pledges(id) ON DELETE CASCADE,
  org_id          uuid        NOT NULL REFERENCES organizations(id),
  due_date        date        NOT NULL,
  amount          numeric(20,2) NOT NULL CHECK (amount > 0),
  status          text        NOT NULL DEFAULT 'pending',
    -- 'pending' | 'paid' | 'waived'
  paid_at         timestamptz,
  payment_ref     text,
  contribution_id uuid        REFERENCES contributions_received(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### Indexes

```sql
CREATE INDEX idx_pledges_org_donor       ON pledges (org_id, donor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pledges_org_status      ON pledges (org_id, status)   WHERE deleted_at IS NULL;
CREATE INDEX idx_installments_pledge     ON pledge_installments (pledge_id);
CREATE INDEX idx_installments_org_due    ON pledge_installments (org_id, due_date);
```

### RLS Policies

Both tables use the same pattern:
- **SELECT**: `can_view_org(org_id) AND org_has_module(org_id, 'pledges')`
- **INSERT/UPDATE**: `can_edit_org(org_id) AND org_has_module(org_id, 'pledges')`
- `pledges` SELECT also requires `deleted_at IS NULL`

### Module enablement

`organizations.modules` gets the key `pledges: true`. The API enforces that `pledges` can only be enabled when `donors` is also `true`. The `org_has_module(org_id, 'pledges')` Postgres function already handles the JSONB lookup.

No new `ModuleId` entry in `lib/modules/types.ts` is needed — the AI tool registry uses a separate system and pledge tools are out of scope for this sprint.

---

## API Routes

All routes live under `/api/org/[orgId]/pledges`.

### `GET /api/org/[orgId]/pledges`

Returns the pipeline summary + pledge list.

**Response:**
```ts
{
  kpis: {
    pipeline: number,     // sum(total_amount) for active/fulfilled pledges
    received: number,     // sum(installments.amount) where status='paid'
    outstanding: number,  // pipeline - received
    overdue: number,      // sum(installments.amount) where pending + due_date < today
  },
  pledges: PledgeRow[],   // see type below
}
```

**`PledgeRow`:**
```ts
{
  id: string,
  donor_id: string,
  donor_name: string,       // first_name + last_name or organization_name
  total_amount: number,
  received: number,
  outstanding: number,
  next_due_date: string | null,
  next_due_amount: number | null,
  pipeline_status: 'overdue' | 'due_soon' | 'on_track' | 'fulfilled' | 'cancelled' | 'defaulted',
  status: string,
  frequency: string,
  start_date: string,
  installment_count: number,
  paid_count: number,
}
```

**Pipeline status rules** (computed at query time from installments):
- `cancelled` / `defaulted` → use pledge.status directly
- All installments paid or waived → `fulfilled` (also auto-updates pledge.status = 'fulfilled')
- Any `pending` installment with `due_date < today` → `overdue`
- Next `pending` installment `due_date` within 30 days → `due_soon`
- Otherwise → `on_track`

**Query filters** (URL params): `status` (active | fulfilled | cancelled | all), `donor_id`

### `POST /api/org/[orgId]/pledges`

Creates a pledge and its installment schedule in a single transaction.

**Request body:**
```ts
{
  donor_id: string,
  total_amount: number,
  currency?: string,         // default 'USD'
  start_date: string,        // ISO date
  end_date?: string,
  frequency: string,
  campaign?: string,
  notes?: string,
  installments: Array<{      // client-generated schedule
    due_date: string,
    amount: number,
    notes?: string,
  }>,
}
```

**Response:** Created `PledgeRow` + full installment list.

### `GET /api/org/[orgId]/pledges/[pledgeId]`

Returns single pledge with full installment list (with computed `effective_status` per installment).

### `PATCH /api/org/[orgId]/pledges/[pledgeId]`

Updates `status`, `notes`, `campaign`. Cannot modify `total_amount` or `donor_id` after creation.

### `DELETE /api/org/[orgId]/pledges/[pledgeId]`

Soft-delete: sets `deleted_at = now()` and `status = 'cancelled'`.

### `PATCH /api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]`

**Request body:**
```ts
{
  action: 'paid' | 'waive' | 'undo',
  paid_at?: string,          // ISO timestamp, defaults to now()
  payment_ref?: string,
  contribution_id?: string,  // link to contributions_received row
  notes?: string,
}
```

Sets installment `status` to `paid` / `waived` / `pending` (undo). After marking paid, if all installments are paid/waived, auto-sets pledge `status = 'fulfilled'`.

---

## Frontend

### File Map

| Action | Path |
|--------|------|
| Create | `app/dashboard/pledges/page.tsx` |
| Create | `components/pledges/PledgePipelineDashboard.tsx` |
| Create | `components/pledges/PledgeCreateModal.tsx` |
| Create | `components/pledges/PledgeDetailPanel.tsx` |
| Create | `lib/pledges/schedule.ts` |
| Modify | `components/donors/DonorDetail.tsx` |
| Modify | `components/Header.tsx` |

### `/dashboard/pledges/page.tsx` (server component)

Server component that:
1. Reads `orgId` from session (same pattern as `/dashboard/donors/page.tsx`)
2. Checks `org_has_module(org_id, 'pledges')` — redirects to `/dashboard/donors` if not enabled
3. Renders `<PledgePipelineDashboard orgId={orgId} />`

### `components/pledges/PledgePipelineDashboard.tsx` (client component)

Layout B: KPI bar + split panel.

**Top row — 4 KPI cards:**
- Pipeline (neutral)
- Received (green)
- Outstanding (neutral)
- Overdue (red when > 0)

**Below — two columns:**
- Left (~35%): "Needs Attention" panel
  - Red section: overdue items (pledge name, amount, was-due date)
  - Amber section: due-soon items (pledge name, amount, due date, days remaining)
  - Capped at 5 per section; "View all" link filters table
- Right (~65%): All Pledges table
  - Columns: Donor, Pledged, Received, Outstanding, Next Due, Status badge
  - Status badges: `overdue` (red), `due_soon` (amber), `on_track` (green), `fulfilled` (indigo), `cancelled` (gray)
  - Row click → opens `PledgeDetailPanel` slide-over
  - Filter bar: All / Active / Overdue / Fulfilled tabs + "New Pledge" button

**Data fetching:** SWR on mount, `GET /api/org/[orgId]/pledges`.

### `lib/pledges/schedule.ts` (pure utility)

Schedule generator — pure function, no imports, fully testable:

```ts
export type Frequency = 'one_time' | 'monthly' | 'quarterly' | 'annually' | 'custom';

export interface ScheduleInput {
  totalAmount: number;
  startDate: string;   // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD, required for monthly/quarterly/annually
  frequency: Frequency;
  installmentCount?: number; // override for custom count
}

export interface ScheduledInstallment {
  due_date: string;
  amount: number;
}

export function generateSchedule(input: ScheduleInput): ScheduledInstallment[]
```

Rules:
- `one_time`: single installment, full amount, on `startDate`
- `monthly` / `quarterly` / `annually`: derive N from `startDate` → `endDate` (or use `installmentCount`). Amount = `totalAmount / N` rounded to 2 decimal places; last installment gets remainder to avoid rounding drift.
- `custom`: returns empty array (user adds installments manually)

### `components/pledges/PledgeCreateModal.tsx` (client component)

3-step modal. Renders as a centered dialog overlay.

**Step 1 — Pledge Details**
- Donor picker: text search input → dropdown from `GET /api/org/[orgId]/donors?search=<q>&limit=10`
- Total Amount (number input)
- Start Date (date input)
- End Date (date input, optional)
- Frequency (select: One-time / Monthly / Quarterly / Annually / Custom)
- Campaign (text, optional)
- Notes (textarea, optional)
- Validate: donor required, total_amount > 0, start_date required

**Step 2 — Installment Schedule**
- Calls `generateSchedule()` client-side using Step 1 values
- Shows preview table: #, Due Date, Amount
- For `custom` frequency: shows empty table with "+ Add Installment" row
- Amount validation: sum of installments must equal total_amount (shown as running total)
- User can edit individual due dates and amounts inline

**Step 3 — Review & Confirm**
- Summary card: donor name, total, frequency, N installments
- Abbreviated schedule (first 3 + last 1 if > 4)
- "Back" and "Create Pledge" buttons
- On submit: `POST /api/org/[orgId]/pledges` with installments array
- On success: close modal, invalidate SWR cache, show success toast

### `components/pledges/PledgeDetailPanel.tsx` (client component)

Slide-over panel from the right (Tailwind `translate-x` transition).

- Header: donor name + pledge status badge + "Edit" / "Cancel Pledge" actions
- Summary row: Total Pledged, Received, Outstanding
- Installment table: Due Date, Amount, Status badge, Actions
  - Action per installment: "Mark Paid" (if pending), "Waive" (if pending), "Undo" (if paid/waived)
  - "Mark Paid" opens a small inline form: paid_at (default today), payment_ref (optional)

### `components/donors/DonorDetail.tsx` (modify)

1. Add `showPledgesTab?: boolean` to the `Props` interface
2. Add `'pledges'` to `activeTab` union: `'contributions' | 'communications' | 'pledges'`
3. Add "Pledges" tab button rendered when `showPledgesTab === true`
4. Pledges tab content: fetches `GET /api/org/[orgId]/pledges?donor_id=<donorId>`, shows compact pledge list + "New Pledge" button that opens `PledgeCreateModal` pre-filled with this donor

The page at `app/dashboard/donors/[donorId]/page.tsx` already fetches org modules; pass `showPledgesTab={!!orgModules?.pledges}` to `DonorDetail`.

### `components/Header.tsx` (modify)

Add nav link in both desktop and mobile nav, after the existing Donors link:

```tsx
{orgModules.donors && orgModules.pledges && (
  <Link
    href="/dashboard/pledges"
    aria-current={pathname.startsWith('/dashboard/pledges') ? 'page' : undefined}
  >
    Pledges
  </Link>
)}
```

Also update the `aria-current` logic on the main Dashboard link to exclude `/dashboard/pledges` from matching.

---

## Module Activation

To enable pledges for an org:

```sql
UPDATE organizations
SET modules = modules || '{"pledges": true}'
WHERE id = '<org_id>' AND (modules->>'donors')::boolean = true;
```

The existing `/api/org/[orgId]/modules` PATCH endpoint handles this — no API changes needed, just ensure the UI in org settings can toggle `pledges`.

---

## Out of Scope (this sprint)

- Nightly cron to auto-mark overdue installments (pledge pipeline status is computed at read time)
- Email/push reminders for upcoming installments
- Linking pledges to QuickBooks
- Soft-credit attribution on pledges
- Bulk import of pledges from CSV

---

## Testing Targets

- `lib/pledges/schedule.ts`: unit tests covering one_time, monthly (even + uneven amounts), quarterly, annually, and edge case (1-installment monthly)
- `POST /api/org/[orgId]/pledges`: integration test — creates pledge + expected installment count
- `PATCH /api/org/[orgId]/pledges/[pledgeId]/installments/[id]`: mark paid, verify pledge auto-fulfills when last installment paid
- `GET /api/org/[orgId]/pledges`: verify pipeline KPI numbers match installment data
