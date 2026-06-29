# Phase 1: Runtime Workflow Configuration — Design Spec

> **Roadmap reference:** `docs/CONFIGURABILITY_ROADMAP.md` Phase 1
> **Companion docs:** `PLATFORM_VISION.md`, `CONFIGURABILITY_ARCHITECTURE.md`

## Goal

Org admins can configure, via Builder chat, the rules governing their grant workflow: stage-gate checklists, required fields before advancing, stage label overrides, and approval annotations. A grant cannot advance past a stage until the org's configured conditions are met. No developer required.

---

## Scope

**In:**
- Stage checklist items (per stage, per org) with completion tracking on grant records
- Required field enforcement at stage transitions (existing canonical grant columns only)
- Stage label overrides (rename canonical stage key to org-specific display label)
- Approval requirement annotations (informational metadata, not a gate in Phase 1)
- 7 new Builder tools to configure all of the above
- Centralized stage label resolution hook for all UI consumers
- Read-only workflow config settings page
- Checklist panel on grant detail

**Out:**
- Custom fields as required items (Phase 2)
- Cross-module workflow rules (grants only)
- Automation triggers based on checklist state (Phase 3)
- Approval requirement as an enforced gate (Phase 3)
- Per-user checklist assignment or permissions beyond org-member write

---

## Schema (migration 0049)

### `org_workflow_config`

One row per config item. The UNIQUE constraint is the write key — all upserts use ON CONFLICT DO UPDATE.

```sql
CREATE TABLE IF NOT EXISTS public.org_workflow_config (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module       text        NOT NULL DEFAULT 'grant_management',
  config_type  text        NOT NULL CHECK (config_type IN (
                             'stage_checklist', 'stage_label',
                             'required_field', 'approval_requirement'
                           )),
  stage_key    text        NOT NULL,
  config_key   text        NOT NULL CHECK (config_key ~ '^[a-z0-9_]+$' OR config_key IN ('label', 'default')),
  config_value jsonb       NOT NULL,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, module, config_type, stage_key, config_key)
);

CREATE INDEX IF NOT EXISTS idx_org_workflow_config_org_module
  ON public.org_workflow_config (org_id, module);

ALTER TABLE public.org_workflow_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_workflow_config_read" ON public.org_workflow_config
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

CREATE POLICY "org_workflow_config_write" ON public.org_workflow_config
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "org_workflow_config_service" ON public.org_workflow_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_workflow_config TO authenticated;
GRANT ALL ON public.org_workflow_config TO service_role;

CREATE TRIGGER set_org_workflow_config_updated_at
  BEFORE UPDATE ON public.org_workflow_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

**`config_value` shapes by `config_type`:**

| config_type | config_key | config_value shape |
|---|---|---|
| `stage_checklist` | item slug e.g. `site_visit` | `{ "label": "Site visit completed", "required": true }` |
| `stage_label` | `label` | `{ "value": "Site Review" }` |
| `required_field` | field name e.g. `purpose` | `{ "field_name": "purpose", "error_message": "Grant purpose must be set before advancing" }` |
| `approval_requirement` | `default` | `{ "required": true, "description": "Board vote required" }` |

`config_key` for `stage_checklist` and `required_field` rows must match `^[a-z0-9_]+$` (enforced in both the DB CHECK and the Builder tool input validator). `stage_label` rows use the reserved key `label`; `approval_requirement` rows use `default` — both are exempt from the snake_case constraint.

---

### `grant_checklist_completions`

One row per checked item. Cleared atomically when the grant exits the stage.

```sql
CREATE TABLE IF NOT EXISTS public.grant_checklist_completions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  grant_id           uuid        NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  stage_key          text        NOT NULL,
  checklist_item_key text        NOT NULL,
  completed_by       uuid        REFERENCES auth.users(id),
  completed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grant_id, stage_key, checklist_item_key)
);

CREATE INDEX IF NOT EXISTS idx_grant_checklist_completions_grant_stage
  ON public.grant_checklist_completions (grant_id, stage_key);

CREATE INDEX IF NOT EXISTS idx_grant_checklist_completions_org
  ON public.grant_checklist_completions (org_id);

ALTER TABLE public.grant_checklist_completions ENABLE ROW LEVEL SECURITY;

-- Any member can read completions
CREATE POLICY "grant_checklist_completions_read" ON public.grant_checklist_completions
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

-- Members can insert completions attributed to themselves only
CREATE POLICY "grant_checklist_completions_insert" ON public.grant_checklist_completions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_org(org_id) AND completed_by = auth.uid());

-- Members can delete their own completions; admins can delete any
CREATE POLICY "grant_checklist_completions_delete" ON public.grant_checklist_completions
  FOR DELETE TO authenticated
  USING (completed_by = auth.uid() OR public.is_org_admin(org_id));

CREATE POLICY "grant_checklist_completions_service" ON public.grant_checklist_completions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON public.grant_checklist_completions TO authenticated;
GRANT ALL ON public.grant_checklist_completions TO service_role;
```

No UPDATE policy — completions are inserted or deleted, never updated.

---

### RPC update — `transition_grant_lifecycle` (CREATE OR REPLACE in 0049)

Add a DELETE before the history insert so completions clear atomically with the stage change. The RPC already holds a `FOR UPDATE` lock on the grants row, so the DELETE is safe.

```sql
-- Add this block immediately before the INSERT INTO grant_status_history:
DELETE FROM public.grant_checklist_completions
WHERE grant_id = p_grant_id
  AND stage_key = p_expected_from_stage;
```

No changes to function signature or return type.

---

## TypeScript

### New file: `lib/grants/workflow-config-constants.ts`

```typescript
export const REQUIRED_FIELD_ALLOWLIST = [
  'purpose',
  'internal_owner_id',
  'requested_amount',
  'approved_amount',
  'grant_period_start',
  'grant_period_end',
  'risk_level',
  'deliverables',
  'reporting_frequency',
] as const;

export type RequiredFieldName = typeof REQUIRED_FIELD_ALLOWLIST[number];

// Typed accessor — avoids dynamic string indexing on the grant row
export function getGrantFieldValue(
  grant: Record<string, unknown>,
  fieldName: RequiredFieldName
): unknown {
  return grant[fieldName];
}
```

### New file: `lib/grants/workflow-config.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LifecycleStage } from './lifecycle-shared';
import { getGrantFieldValue, type RequiredFieldName } from './workflow-config-constants';

export interface WorkflowConfigRow {
  id: string;
  config_type: 'stage_checklist' | 'stage_label' | 'required_field' | 'approval_requirement';
  stage_key: string;
  config_key: string;
  config_value: Record<string, unknown>;
  sort_order: number;
}

/**
 * Fetches all org_workflow_config rows for a given org and optional stage.
 * Uses service-role client — caller is responsible for org authorization.
 */
export async function loadWorkflowConfig(
  db: SupabaseClient,
  orgId: string,
  stageKey?: string
): Promise<WorkflowConfigRow[]> {
  let query = db
    .from('org_workflow_config')
    .select('id, config_type, stage_key, config_key, config_value, sort_order')
    .eq('org_id', orgId)
    .eq('module', 'grant_management')
    .order('sort_order', { ascending: true });

  if (stageKey) {
    query = query.eq('stage_key', stageKey);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load workflow config: ${error.message}`);
  return (data ?? []) as WorkflowConfigRow[];
}

export interface WorkflowGateResult {
  blocked: boolean;
  reasons: string[];
}

/**
 * Checks org-configured workflow gates for a stage transition.
 * Called by transitionGrant() with the already-fetched grant row to avoid a second DB round-trip.
 *
 * Checks:
 *   1. Required checklist items that have no completion row
 *   2. Required canonical grant fields that are null/undefined on the grant record
 *
 * approval_requirement rows are NOT a gate in Phase 1 — informational only.
 */
export async function checkWorkflowGate(
  db: SupabaseClient,
  orgId: string,
  grantId: string,
  fromStage: LifecycleStage,
  grantRow: Record<string, unknown>
): Promise<WorkflowGateResult> {
  const reasons: string[] = [];

  const config = await loadWorkflowConfig(db, orgId, fromStage);

  const checklistItems = config.filter(
    r => r.config_type === 'stage_checklist' && r.config_value.required === true
  );

  if (checklistItems.length > 0) {
    const { data: completions } = await db
      .from('grant_checklist_completions')
      .select('checklist_item_key')
      .eq('grant_id', grantId)
      .eq('stage_key', fromStage);

    const completedKeys = new Set((completions ?? []).map(c => c.checklist_item_key));

    for (const item of checklistItems) {
      if (!completedKeys.has(item.config_key)) {
        reasons.push(`Checklist item not complete: ${item.config_value.label ?? item.config_key}`);
      }
    }
  }

  const requiredFields = config.filter(r => r.config_type === 'required_field');

  for (const rule of requiredFields) {
    const fieldName = rule.config_value.field_name as RequiredFieldName;
    const value = getGrantFieldValue(grantRow, fieldName);
    if (value === null || value === undefined) {
      const msg = (rule.config_value.error_message as string | undefined)
        ?? `Required field not set: ${fieldName}`;
      reasons.push(msg);
    }
  }

  return { blocked: reasons.length > 0, reasons };
}
```

### Modified: `lib/grants/lifecycle.ts`

**New error class:**

```typescript
export class WorkflowGateBlockedError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Transition blocked by workflow configuration: ${reasons.join('; ')}`);
    this.reasons = reasons;
    this.name = 'WorkflowGateBlockedError';
  }
}
```

**Expanded grant fetch** — add all `REQUIRED_FIELD_ALLOWLIST` columns to the select so `checkWorkflowGate` receives a complete row without a second fetch:

```typescript
const { data: grant, error: fetchErr } = await db
  .from('grants')
  .select(
    'lifecycle_stage, org_id, purpose, internal_owner_id, requested_amount, ' +
    'approved_amount, grant_period_start, grant_period_end, risk_level, ' +
    'deliverables, reporting_frequency'
  )
  .eq('id', grantId)
  .maybeSingle();
```

**Gate check inserted between `canTransition` and `requiresDecision`:**

```typescript
// After: if (!canTransition(fromStage, toStage)) throw new InvalidTransitionError(...)
// Before: if (requiresDecision(...) && !decisionPayload) throw new DecisionRequiredError(...)

const gate = await checkWorkflowGate(db, orgId, grantId, fromStage, grant as Record<string, unknown>);
if (gate.blocked) throw new WorkflowGateBlockedError(gate.reasons);
```

### Modified: `lib/ai/assistant/executors/grants.ts`

Add catch for `WorkflowGateBlockedError` in the `transition_grant` tool case:

```typescript
} catch (err) {
  if (err instanceof WorkflowGateBlockedError) {
    return {
      action: null,
      output: {
        error: 'Transition blocked by workflow configuration.',
        blocking_items: err.reasons,
        hint: 'Complete the required checklist items or set required fields before advancing this grant.',
      },
    };
  }
  // ... existing error handling
}
```

### Modified: `app/api/org/[orgId]/grants/bulk-transition/route.ts`

Add `checkWorkflowGate` to the existing preflight validation loop. The preflight loop already runs unconditionally before the `rollbackOnError` branch decision, so this ensures gate enforcement regardless of execution path.

In the preflight loop, after the `canTransition` / `requiresDecision` checks:

```typescript
const gate = await checkWorkflowGate(adminSupabase, orgId, item.grant_id, fromStage, grantRow);
if (gate.blocked) {
  preflightErrors.push({
    grantId: item.grant_id,
    error: `Transition blocked: ${gate.reasons.join('; ')}`,
    blocking_items: gate.reasons,
  });
  continue;
}
```

The grant row for each item is already fetched during preflight — pass it through rather than fetching again.

---

## Builder Tools (7 new)

All added to `BUILDER_TOOLS[]` and handled in `executeTool()` switch in `lib/builder/tools.ts`. All validate `stage_key` against `LIFECYCLE_STAGES`. All check `org_has_module(orgId, 'grant_management')` before writing (return `{ type: 'error' }` if module not enabled). All emit `builder_events`.

### `add_checklist_item`

Args: `stage_key` (string), `item_key` (string, `^[a-z0-9_]+$`, max 64), `label` (string, max 200), `required` (boolean), `sort_order` (number, optional, default 0).

Upserts one `org_workflow_config` row with `config_type = 'stage_checklist'`. ON CONFLICT (unique key) DO UPDATE label and required.

### `remove_checklist_item`

Args: `stage_key` (string), `item_key` (string).

Deletes the `org_workflow_config` row. Also deletes matching `grant_checklist_completions` rows for `(org_id, stage_key, item_key)` — cleans up orphaned completion records.

### `set_required_field`

Args: `stage_key` (string), `field_name` (enum from `REQUIRED_FIELD_ALLOWLIST`), `error_message` (string, max 300, optional).

Validates `field_name` is in allowlist. Upserts `org_workflow_config` row with `config_type = 'required_field'`, `config_key = field_name`.

### `remove_required_field`

Args: `stage_key` (string), `field_name` (enum from `REQUIRED_FIELD_ALLOWLIST`).

Deletes the `org_workflow_config` row.

### `rename_stage`

Args: `stage_key` (string), `label` (string, max 60).

If `label` is non-empty: upserts `org_workflow_config` row with `config_type = 'stage_label'`, `config_key = 'label'`, `config_value = { "value": label }`.

If `label` is empty string: deletes the row (restores system default name).

### `set_approval_requirement`

Args: `stage_key` (string), `required` (boolean), `description` (string, max 300, optional).

Upserts `org_workflow_config` row with `config_type = 'approval_requirement'`, `config_key = 'default'`. If `required = false`, deletes the row instead.

Note: Informational only in Phase 1. Shown in settings page and grant detail sidebar. Not a transition gate.

### `list_workflow_config`

Args: none.

Reads all `org_workflow_config` rows for the org. Returns formatted text grouped by stage:

```
Stage: due_diligence (label: "Site Review")
  Checklist items:
    [required] site_visit — "Site visit completed"
    [optional] financial_review — "Financial statements reviewed"
  Required fields:
    purpose — "Grant purpose must be set before advancing"
  Approval: Board vote required

Stage: recommended
  Approval: Program officer sign-off required
```

---

## API Routes

### `GET /api/org/[orgId]/workflow-config`

Returns all `org_workflow_config` rows grouped by stage for the settings page.

- Auth: authenticated user, `is_org_admin` check
- Module check: `org_has_module(orgId, 'grant_management')`
- Client: service role (reads all config for the org)
- Response: `{ data: WorkflowConfigRow[] }`

### `GET /api/org/[orgId]/workflow-config/labels`

Returns a flat map of stage label overrides only. Used by `useStageLabels` hook.

- Auth: any authenticated org member (`can_view_org`)
- Module check: none (safe to call even if module toggles mid-session)
- Response: `{ labels: Record<string, string> }` — only stages with overrides; missing keys mean use system default
- Cache: `s-maxage=60, stale-while-revalidate=30`

### `GET /api/org/[orgId]/grants/[grantId]/checklist`

Returns checklist definition merged with completion state for all stages that have items.

- Auth: any org member
- Module check: `org_has_module(orgId, 'grant_management')`
- Response:
  ```typescript
  {
    data: Record<string, {            // keyed by stage_key
      items: Array<{
        key: string;
        label: string;
        required: boolean;
        sort_order: number;
        completed: boolean;
        completed_by: string | null;  // user id
        completed_at: string | null;  // ISO timestamp
      }>;
      approval_requirement: { required: boolean; description: string } | null;
    }>;
  }
  ```

### `POST /api/org/[orgId]/grants/[grantId]/checklist`

Check or uncheck a single item.

- Auth: any org member
- Module check: `org_has_module(orgId, 'grant_management')`
- Body: `{ stage_key: string; item_key: string; completed: boolean }`
- Validates that the checklist item exists in `org_workflow_config` before writing (prevents phantom completions)
- `completed: true` → INSERT with `completed_by = user.id` (ON CONFLICT DO NOTHING — idempotent)
- `completed: false` → DELETE WHERE `grant_id = ? AND stage_key = ? AND checklist_item_key = ? AND completed_by = user.id`
- Response: `{ success: true }`
- Error: 404 if item doesn't exist in config; 403 if not org member

### Modified: `app/api/org/[orgId]/grants/[grantId]/transition/route.ts`

New catch block:
```typescript
if (err instanceof WorkflowGateBlockedError) {
  return json({ error: err.message, blocking_items: err.reasons }, { status: 422 });
}
```

---

## UI

### `useStageLabels(orgId: string)` hook

```typescript
// lib/hooks/use-stage-labels.ts
import useSWR from 'swr';
import { LIFECYCLE_STAGES, type LifecycleStage } from '@/lib/grants/lifecycle-shared';

export function useStageLabels(orgId: string) {
  const { data } = useSWR(
    `/api/org/${orgId}/workflow-config/labels`,
    (url) => fetch(url).then(r => r.json()).then(r => r.labels as Record<string, string>),
    { revalidateOnFocus: false }
  );

  return {
    getLabel: (stage: LifecycleStage): string =>
      data?.[stage] ?? stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    labels: data ?? {},
  };
}
```

All existing components that display stage names (pipeline kanban, grants table, status badges, transition dialogs) update to call `useStageLabels(orgId)` and use `getLabel(stage)`. The fallback is the humanized canonical name so the hook is safe to call before data loads.

### `components/grants/StageChecklist.tsx`

Renders on the grant detail page for the grant's current `lifecycle_stage`. Fetches from `GET /api/org/[orgId]/grants/[grantId]/checklist` via SWR. Shows only the items for the current stage.

- Each item is a checkbox. Any member can toggle. Optimistic update on click, reverts on error.
- Required items with `completed: false` show a red dot indicator.
- Optional items show no indicator when unchecked.
- `approval_requirement` for the current stage renders as a sidebar note: "Approval note: Board vote required" — clearly labeled as informational, not an enforcement banner.
- If no checklist items are configured for the current stage, the component renders nothing (no empty state shown).
- When the transition dialog returns 422 with `blocking_items`, the dialog body lists them: "Complete these items before advancing: [list]".

### `app/org/[orgId]/settings/workflow/page.tsx`

Server component. Fetches `GET /api/org/[orgId]/workflow-config`. Admin-only — redirects non-admins.

- One collapsible card per stage that has any configuration (stages with no config are hidden)
- Each card shows: label override (if set), checklist items with required badge, required fields, approval annotation
- `approval_requirement` shown as "Approval: [description]" annotation — no enforcement language
- "Configure in Builder" button at top links to Builder chat tab
- No inline editing — Builder is the sole edit surface

---

## File Map

| File | Change |
|---|---|
| `db/migrations/0049_workflow_config.sql` | New — both tables, indexes, RLS, grants, trigger, RPC update |
| `lib/grants/workflow-config-constants.ts` | New — allowlist, typed accessor |
| `lib/grants/workflow-config.ts` | New — `loadWorkflowConfig`, `checkWorkflowGate` |
| `lib/grants/lifecycle.ts` | Modified — expanded grant fetch, gate check, `WorkflowGateBlockedError` |
| `lib/grants/lifecycle-shared.ts` | Unchanged |
| `lib/builder/tools.ts` | Modified — 7 new tool definitions + executor cases |
| `lib/ai/assistant/executors/grants.ts` | Modified — catch `WorkflowGateBlockedError` |
| `app/api/org/[orgId]/grants/[grantId]/transition/route.ts` | Modified — new catch block |
| `app/api/org/[orgId]/grants/bulk-transition/route.ts` | Modified — gate check in preflight loop |
| `app/api/org/[orgId]/workflow-config/route.ts` | New — GET all config |
| `app/api/org/[orgId]/workflow-config/labels/route.ts` | New — GET label overrides |
| `app/api/org/[orgId]/grants/[grantId]/checklist/route.ts` | New — GET checklist+completions, POST check/uncheck |
| `lib/hooks/use-stage-labels.ts` | New — SWR hook |
| `components/grants/StageChecklist.tsx` | New — checklist panel |
| `app/org/[orgId]/settings/workflow/page.tsx` | New — read-only settings page |

---

## Acceptance Criteria

1. An org admin tells the Builder: "Require a site visit checklist before any grant can advance to recommended." The Builder creates the config. A grant in `due_diligence` shows the checklist item. Attempting to transition to `recommended` without checking it returns 422 with `blocking_items`. The AI assistant asked to transition the grant also receives the blocking message with item names.

2. An org admin tells the Builder: "Rename 'due_diligence' to 'Site Review' for our org." The pipeline, table view, grant detail, and transition dialog all show "Site Review." The canonical `due_diligence` value remains in the database. The `useStageLabels` hook resolves it.

3. A grant transitions from `renewal_review` to `active` (re-entry path). All `renewal_review` checklist completions are deleted atomically. The next time the grant enters `renewal_review`, the checklist starts fresh.

4. `rollback_on_error: true` bulk transition with a gate-blocked grant returns a preflight error for that grant, not a 500 or a bypassed gate.

5. A member checks an item — the completion row is attributed to `auth.uid()`. A different member cannot delete that completion (non-admin). An org admin can delete any completion.

---

## Security Notes

- `approval_requirement` is informational only. No enforcement code reads it. Do not add UI language that implies it blocks transitions.
- `checkWorkflowGate` runs with the service-role client (same as `transitionGrant` today). No user session permissions govern this check — it is an org-level policy applied to all transitions regardless of who initiates them.
- `config_key` for checklist items is constrained to `^[a-z0-9_]+$` in both the DB CHECK and Builder tool input validation. This prevents injection-style keys that could collide with system-reserved identifiers in later phases.
- The checklist POST endpoint validates that the item exists in `org_workflow_config` before inserting a completion row. This prevents phantom completions for items that no longer exist.
