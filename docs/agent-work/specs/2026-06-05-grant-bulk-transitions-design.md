# Grant Bulk Pipeline Transitions — Design Spec

**Date:** 2026-06-05
**Status:** Approved
**Scope:** GM-3 — multi-select + bulk stage transition in the grant pipeline kanban

---

## Problem

Grant managers handling large portfolios need to transition multiple grants simultaneously — most commonly after a board meeting where several grants are approved, renewed, or closed together. The current pipeline forces one-at-a-time transitions, which is slow and repetitive for batches.

---

## Approach

Client-side selection state + one new bulk-transition API endpoint. No new schema or migrations. The endpoint first performs an org-scoped preflight fetch for every requested grant, then orchestrates calls to the existing `transitionGrant()` function, preserving lifecycle enforcement, decision requirements, and audit history already in place.

Important boundary: `transitionGrant()` enforces lifecycle correctness, not API authorization. The bulk endpoint owns auth, org scoping, request validation, stale-stage detection, and result aggregation.

---

## UI & Interaction Model

### Selection Mode

The grants dashboard toolbar above `GrantPipelineView` gains a **"Select"** button. Clicking it enters selection mode:

- Each grant card grows a checkbox in the top-left corner, revealed via a staggered fade-in per column (20ms stagger between cards per column)
- Each column header gains a **"Select all in stage"** checkbox
- The toolbar swaps to show selected count + an **"Exit"** button (CSS transition on swap)
- Clicking "Exit" or pressing Escape clears selection and returns to normal view

`app/dashboard/grants/page.tsx` owns `selectionMode`, `selectedIds`, and the post-apply refresh because the toolbar, pipeline cards, bulk action bar, and result modal all need the same state. `GrantPipelineView` receives selection props and callbacks; it should not own isolated selection state that the toolbar cannot see.

### BulkActionBar

While in selection mode with at least one grant selected, a `BulkActionBar` slides up from the bottom of the screen (spring transition on first render). It groups the current selection by lifecycle stage, showing one row per stage group:

```
recommended (4 grants)   →  Transition to: [Approved ▾]
active (2 grants)         →  Transition to: [Renewal Review ▾]
```

Each "Transition to" dropdown contains only the legal next stages for that stage, derived from `ALLOWED_TRANSITIONS` / `canTransition()` in `lib/grants/lifecycle.ts`. Selecting a target stage from a row queues that group for processing.

An **"Apply transitions"** button is enabled once at least one group has a target stage selected.

### Apply Flow

**Case 1 — No decision-required transitions in any group:**

1. Confirmation dialog: summary table (stage group | count | → target stage)
2. User confirms → API call → result modal

**Case 2 — One or more groups require a decision:**

`BulkDecisionQueue` modal opens and steps through each grant in decision-required groups one at a time:

- Grant name, current stage, and target stage shown as context
- Decision form fields: `decision_type`, `decision` (approved/declined/etc.), `rationale`, `decision_date` (optional, defaults server-side to today's ISO date), `board_meeting_date` (optional), `amount` (pre-filled from grant record, editable), `conditions` (optional)
- **"Skip this grant"** button always visible — skipped grants are excluded from the batch entirely
- Step indicator shows progress (e.g., "Grant 2 of 5")
- Slide-left animation between steps (forward-progress feel)

After all decision-required grants are handled or skipped, a **final summary screen** lists what will execute. User confirms → API call → result modal.

### Result Modal

- **Full success:** brief micro-animation (subtle checkmark burst), green success list
- **Partial success / failures:** neutral slide-in, successes in green, failures in red with the server-returned error reason per grant
- No rollback — each transition is independent and already committed

### Post-Apply State Sync

After any API response with at least one successful transition:

1. Apply an optimistic local update for successful grants by setting `lifecycle_stage = targetStage`.
2. Clear successful grant IDs from selection.
3. Bump `refreshKey` or otherwise refetch the grants list in `app/dashboard/grants/page.tsx` before the result modal is dismissed.

This prevents a successful bulk action from leaving cards visibly stuck in their old kanban columns.

---

## API

### `POST /api/org/[orgId]/grants/bulk-transition`

**Auth:** authenticated user + org admin check. Match the adjacent single-transition route: `user_org_role(orgId) in ('owner', 'admin')`. If the route standardizes on `is_org_admin(orgId)`, it must have identical owner/admin semantics.

**Request body:**
```typescript
{
  transitions: Array<{
    grantId: string;              // UUID
    expectedFromStage: LifecycleStage;
    targetStage: LifecycleStage;
    reason?: string;              // optional status-history reason, max 1000 chars
    decision?: {
      decision_type: 'approval' | 'decline' | 'defer' | 'renewal' | 'closeout' | 'payment_release';
      decision: 'approved' | 'declined' | 'deferred' | 'conditional' | 'not_applicable';
      rationale?: string;
      decision_date?: string;      // ISO date; defaults server-side to today
      board_meeting_date?: string; // ISO date
      amount?: number;             // finite, non-negative
      conditions?: string;
    };
  }>
}
```

**Behavior:**
1. Validate auth once at handler entry
2. Validate `transitions` is a non-empty array (max 50 items)
3. Reject the whole request with `400` before any mutation if the body shape is invalid
4. Prefetch all grants in one org-scoped query:

```typescript
const { data: scopedGrants } = await adminSupabase
  .from('grants')
  .select('id, lifecycle_stage, org_id')
  .eq('org_id', orgId)
  .in('id', grantIds);
```

5. Build a `Map<grantId, grant>` from that result. Any requested grant missing from the map is a per-grant failure with `error: 'Grant not found in organization'`; do not call `transitionGrant()` for missing grants.
6. For each scoped transition:
   - If the current DB stage differs from `expectedFromStage`, return a per-grant stale-stage failure and do not mutate that grant.
   - If `targetStage` is not legal from `expectedFromStage`, return a per-grant invalid-transition failure.
   - If `requiresDecision(expectedFromStage, targetStage)` is true and no `decision` was supplied, return a per-grant decision-required failure.
   - If a decision is supplied, normalize it to `DecisionPayload` by adding:
     - `decision_date: decision.decision_date ?? new Date().toISOString().slice(0, 10)`
     - `decided_by: user.id`
   - Call `transitionGrant(grantId, targetStage, user.id, reason, decisionPayload)` from `lib/grants/lifecycle.ts`.
   - Collect result (success or error message) — never short-circuit on per-grant failure.
7. Return `207 Multi-Status`:

```typescript
{
  successCount: number;
  failureCount: number;
  results: Array<{
    grantId: string;
    fromStage?: LifecycleStage;
    targetStage?: LifecycleStage;
    success: boolean;
    error?: string;
  }>
}
```

**No new schema.** Reuses `transitionGrant()`, `grant_decisions`, and `grant_status_history` identically to single-grant transitions.

### Runtime Validation

Use a Zod schema or equivalent explicit validation. Requirements:

- `transitions`: required array, length 1-50
- Request object: strict; no unknown top-level fields beyond `transitions`
- `grantId`: valid UUID
- `grantId` values: unique within the request; duplicate IDs reject the whole request with `400`
- `expectedFromStage`: required member of `LIFECYCLE_STAGES`
- `targetStage`: required member of `LIFECYCLE_STAGES`
- `reason`: optional string, max 1000 chars
- No unknown top-level fields inside a transition object
- `decision`: optional object; no unknown fields
- `decision.decision_type`: one of `DecisionPayload['decision_type']`
- `decision.decision`: one of `DecisionPayload['decision']`
- `decision.decision_date` and `decision.board_meeting_date`: optional ISO date strings (`YYYY-MM-DD`)
- `decision.amount`: optional finite non-negative number
- `decision.rationale`: optional string, max 5000 chars
- `decision.conditions`: optional string, max 5000 chars

Body-level validation failures return `400` and perform no transitions. Per-grant lifecycle, stale-stage, missing-in-org, or DB errors are represented in `results`.

---

## Components

| Component | File | Change |
|-----------|------|--------|
| `GrantsDashboard` | `app/dashboard/grants/page.tsx` | Own `selectionMode`, `selectedIds`, queued transitions, result modal state, optimistic updates, and `refreshKey` bump |
| `GrantPipelineView` | `components/grants/GrantPipelineView.tsx` | Accept selection props/callbacks; render card checkboxes and column header "Select all" |
| `BulkActionBar` | `components/grants/BulkActionBar.tsx` | New — fixed bottom bar with per-stage grouping and transition dropdowns; spring slide-up |
| `BulkDecisionQueue` | `components/grants/BulkDecisionQueue.tsx` | New — stepped modal for per-grant decisions with skip option and slide-left step animation |
| `BulkTransitionResultModal` | `components/grants/BulkTransitionResultModal.tsx` | New — shows success/partial/failure results and triggers final cleanup/refetch on close |

---

## API File

| File | Change |
|------|--------|
| `app/api/org/[orgId]/grants/bulk-transition/route.ts` | New — POST handler |

---

## Animations Summary

| Interaction | Animation |
|-------------|-----------|
| Enter selection mode | Toolbar swap via CSS transition; checkboxes stagger fade-in 20ms/column |
| BulkActionBar appears | Spring slide-up from bottom |
| BulkDecisionQueue steps | Slide-left between grants |
| Full success result | Subtle checkmark micro-animation |
| Partial/failure result | Neutral slide-in |

---

## Permissions

Identical to single-grant transitions at the role level: org admin only. The bulk endpoint checks `is_org_admin(orgId)` or `user_org_role(orgId) in ('owner', 'admin')` at the handler level.

The endpoint must also verify every requested grant belongs to `orgId` before mutation. This is mandatory because `transitionGrant()` uses a service client internally and fetches/updates by grant ID. Treat org-scoping as endpoint authorization, not as lifecycle helper behavior.

---

## Constraints

- Maximum 50 grants per bulk-transition request (enforced server-side)
- Decision-required transitions skipped by the user in `BulkDecisionQueue` are excluded from the batch entirely — not retried silently
- No auto-rollback on partial failure — each grant's transition is independent
- `transitionGrant()` must not be modified; the endpoint is an orchestration layer with validation, org-scoped preflight, stale-stage detection, and per-grant result aggregation

---

## Contract Tests

### API Tests

Add tests beside the existing grant transition route tests.

- Unauthenticated request returns `401`
- Non-admin org member returns `403`
- Empty `transitions` returns `400`
- More than 50 transitions returns `400`
- Duplicate `grantId` values return `400` and call no mutations
- Invalid UUID returns `400`
- Invalid `expectedFromStage` / `targetStage` returns `400`
- Invalid decision enum/date/amount returns `400`
- Unknown fields in transition or decision objects return `400`
- Requested grant outside `orgId` appears as per-grant failure and does not call `transitionGrant()`
- Stale `expectedFromStage` appears as per-grant failure and does not call `transitionGrant()`
- Decision-required transition without decision appears as per-grant failure
- Decision-required transition with decision defaults `decision_date` and `decided_by`
- Mixed success/failure returns `207`, `successCount`, `failureCount`, and one result per requested transition
- A valid transition calls `transitionGrant(grantId, targetStage, user.id, reason, decisionPayload)`

### UI / Component Tests

- Pipeline selection mode renders card checkboxes only when enabled
- "Select all in stage" toggles only grants in that stage
- BulkActionBar groups selected grants by `lifecycle_stage`
- Transition dropdowns use `ALLOWED_TRANSITIONS` and never show illegal targets
- BulkDecisionQueue includes only decision-required grants and excludes skipped grants from the final payload
- Successful API results update local grant stages and trigger a refetch/`refreshKey` bump
- Partial failures keep failed grant IDs selectable or clearly visible for retry

---

## What This Does Not Cover

- Bulk edit of grant fields (amount, owner, dates) — out of scope
- Bulk delete — out of scope
- Non-admin bulk transitions — out of scope per permission model
