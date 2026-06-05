# Grant Bulk Pipeline Transitions — Design Spec

**Date:** 2026-06-05
**Status:** Approved
**Scope:** GM-3 — multi-select + bulk stage transition in the grant pipeline kanban

---

## Problem

Grant managers handling large portfolios need to transition multiple grants simultaneously — most commonly after a board meeting where several grants are approved, renewed, or closed together. The current pipeline forces one-at-a-time transitions, which is slow and repetitive for batches.

---

## Approach

Entirely client-side selection state + one new bulk-transition API endpoint. No new schema or migrations. The endpoint orchestrates calls to the existing `transitionGrant()` function, preserving all lifecycle enforcement, decision requirements, and audit history already in place.

---

## UI & Interaction Model

### Selection Mode

The toolbar above `GrantPipelineView` gains a **"Select"** button. Clicking it enters selection mode:

- Each grant card grows a checkbox in the top-left corner, revealed via a staggered fade-in per column (20ms stagger between cards per column)
- Each column header gains a **"Select all in stage"** checkbox
- The toolbar swaps to show selected count + an **"Exit"** button (CSS transition on swap)
- Clicking "Exit" or pressing Escape clears selection and returns to normal view

### BulkActionBar

While in selection mode with at least one grant selected, a `BulkActionBar` slides up from the bottom of the screen (spring transition on first render). It groups the current selection by lifecycle stage, showing one row per stage group:

```
recommended (4 grants)   →  Transition to: [Approved ▾]
active (2 grants)         →  Transition to: [Renewal Review ▾]
```

Each "Transition to" dropdown contains only the legal next stages for that stage — identical logic to the existing single-grant transition menu. Selecting a target stage from a row queues that group for processing.

An **"Apply transitions"** button is enabled once at least one group has a target stage selected.

### Apply Flow

**Case 1 — No decision-required transitions in any group:**

1. Confirmation dialog: summary table (stage group | count | → target stage)
2. User confirms → API call → result modal

**Case 2 — One or more groups require a decision:**

`BulkDecisionQueue` modal opens and steps through each grant in decision-required groups one at a time:

- Grant name, current stage, and target stage shown as context
- Decision form fields: `decision_type`, `decision` (approved/declined/etc.), `rationale`, `board_meeting_date` (optional), `amount` (pre-filled from grant record, editable), `conditions` (optional)
- **"Skip this grant"** button always visible — skipped grants are excluded from the batch entirely
- Step indicator shows progress (e.g., "Grant 2 of 5")
- Slide-left animation between steps (forward-progress feel)

After all decision-required grants are handled or skipped, a **final summary screen** lists what will execute. User confirms → API call → result modal.

### Result Modal

- **Full success:** brief micro-animation (subtle checkmark burst), green success list
- **Partial success / failures:** neutral slide-in, successes in green, failures in red with the server-returned error reason per grant
- No rollback — each transition is independent and already committed

---

## API

### `POST /api/org/[orgId]/grants/bulk-transition`

**Auth:** authenticated user + `is_org_admin(orgId)`

**Request body:**
```typescript
{
  transitions: Array<{
    grantId: string;          // UUID
    targetStage: LifecycleStage;
    decision?: {
      decision_type: string;
      decision: string;
      rationale: string;
      board_meeting_date?: string;
      amount?: number;
      conditions?: string;
    };
  }>
}
```

**Behavior:**
1. Validate auth once at handler entry
2. Validate `transitions` is a non-empty array (max 50 items)
3. For each transition:
   - Call `transitionGrant(adminSupabase, orgId, grantId, targetStage, decision?)` from `lib/grants/lifecycle.ts`
   - Collect result (success or error message) — never short-circuit on failure
4. Return `207 Multi-Status`:

```typescript
{
  results: Array<{
    grantId: string;
    success: boolean;
    error?: string;
  }>
}
```

**No new schema.** Reuses `transitionGrant()`, `grant_decisions`, and `grant_status_history` identically to single-grant transitions.

---

## Components

| Component | File | Change |
|-----------|------|--------|
| `GrantPipelineView` | `components/grants/GrantPipelineView.tsx` | Add `selectionMode`, `selectedIds` state; staggered checkbox fade-in; column header "Select all" |
| `BulkActionBar` | `components/grants/BulkActionBar.tsx` | New — fixed bottom bar with per-stage grouping and transition dropdowns; spring slide-up |
| `BulkDecisionQueue` | `components/grants/BulkDecisionQueue.tsx` | New — stepped modal for per-grant decisions with skip option and slide-left step animation |
| Toolbar in grants page | `app/dashboard/grants/page.tsx` | Add "Select" button to the view-switcher toolbar; swap to selected-count + Exit when in selection mode |

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

Identical to single-grant transitions: org admin only. The bulk endpoint checks `is_org_admin(orgId)` at the handler level. No per-grant permission re-check beyond what `transitionGrant()` already enforces.

---

## Constraints

- Maximum 50 grants per bulk-transition request (enforced server-side)
- Decision-required transitions skipped by the user in `BulkDecisionQueue` are excluded from the batch entirely — not retried silently
- No auto-rollback on partial failure — each grant's transition is independent
- `transitionGrant()` must not be modified; the endpoint is a pure orchestration layer

---

## What This Does Not Cover

- Bulk edit of grant fields (amount, owner, dates) — out of scope
- Bulk delete — out of scope
- Non-admin bulk transitions — out of scope per permission model
