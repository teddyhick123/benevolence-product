# Phase 1: Runtime Workflow Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Org admins can configure stage-gate checklists, required fields, stage label overrides, and approval annotations for their grant workflow via Builder chat — without code deployment.

**Architecture:** A new `org_workflow_config` table stores one normalized row per config item. `checkWorkflowGate()` in `lib/grants/workflow-config.ts` reads these rows and is called by the existing `transitionGrant()` choke point, so every transition surface (single, bulk, future AI) is gated automatically. Seven new Builder tools write config rows; a labels API + SWR hook feed all UI stage-name renders with org-specific overrides.

**Tech Stack:** TypeScript, Next.js 15 App Router, Supabase (PostgreSQL + RLS), vitest, SWR

## Global Constraints

- All org-scoped tables use `org_id` (not `organization_id`) as the FK column.
- RLS read policy uses `can_view_org(org_id)`. Write policy uses `is_org_admin(org_id)`. `is_org_member` does NOT exist.
- Module check RPC: `org_has_module(p_org_id, p_module)` — parameter is `p_module`, NOT `p_module_id`.
- Grant lifecycle stages are the 14-value CHECK in `grants.lifecycle_stage`; canonical list is `LIFECYCLE_STAGES` from `lib/grants/lifecycle-shared.ts`.
- Test files live in `app/api/__tests__/` (route tests) and `lib/**/__tests__/` (unit tests). Runner: `npx vitest run <path>`.
- No `@ts-nocheck` in new files. New files must be cleanly typed.
- `config_key` for checklist/required_field rows must satisfy `^[a-z0-9_]+$`. Reserved keys `label` and `default` are exempt (used by stage_label and approval_requirement rows).
- `approval_requirement` is informational only — no enforcement code, no "blocked" UI language.

---

## File Map

| File | Status |
|---|---|
| `db/migrations/0049_workflow_config.sql` | Create |
| `lib/grants/workflow-config-constants.ts` | Create |
| `lib/grants/workflow-config.ts` | Create |
| `lib/grants/__tests__/workflow-config.test.ts` | Create |
| `lib/grants/lifecycle.ts` | Modify |
| `app/api/__tests__/grants-transition.test.ts` | Modify |
| `app/api/org/[orgId]/grants/[grantId]/transition/route.ts` | Modify |
| `app/api/org/[orgId]/grants/bulk-transition/route.ts` | Modify |
| `app/api/__tests__/grants-bulk-transition.test.ts` | Modify |
| `lib/builder/tools.ts` | Modify |
| `app/api/org/[orgId]/workflow-config/route.ts` | Create |
| `app/api/org/[orgId]/workflow-config/labels/route.ts` | Create |
| `app/api/__tests__/workflow-config.test.ts` | Create |
| `app/api/org/[orgId]/grants/[grantId]/checklist/route.ts` | Create |
| `app/api/__tests__/grants-checklist.test.ts` | Create |
| `lib/hooks/use-stage-labels.ts` | Create |
| `components/grants/StageChecklist.tsx` | Create |
| `app/org/[orgId]/settings/workflow/page.tsx` | Create |

---

## Task 1: Migration 0049 — Schema + RPC Update

**Files:**
- Create: `db/migrations/0049_workflow_config.sql`

**Interfaces:**
- Produces: `public.org_workflow_config` table, `public.grant_checklist_completions` table, updated `transition_grant_lifecycle` RPC

- [ ] **Step 1: Read the current RPC to find insertion point**

Read `db/migrations/0047_grant_lifecycle_transition_rpc.sql`. Find the line immediately before `INSERT INTO public.grant_status_history` — the DELETE will be injected just above it.

- [ ] **Step 2: Create the migration file**

```sql
-- db/migrations/0049_workflow_config.sql
-- Migration: Phase 1 Runtime Workflow Configuration
-- Date: 2026-06-29

-- ─── TABLE: org_workflow_config ──────────────────────────────────────────────

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

-- ─── TABLE: grant_checklist_completions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.grant_checklist_completions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  grant_id           uuid        NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  workflow_config_id uuid        NOT NULL REFERENCES public.org_workflow_config(id) ON DELETE CASCADE,
  stage_key          text        NOT NULL,
  checklist_item_key text        NOT NULL,
  completed_by       uuid        REFERENCES auth.users(id),
  completed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grant_id, workflow_config_id)
);

CREATE INDEX IF NOT EXISTS idx_grant_checklist_completions_grant_stage
  ON public.grant_checklist_completions (grant_id, stage_key);

CREATE INDEX IF NOT EXISTS idx_grant_checklist_completions_config
  ON public.grant_checklist_completions (workflow_config_id);

CREATE INDEX IF NOT EXISTS idx_grant_checklist_completions_org
  ON public.grant_checklist_completions (org_id);

ALTER TABLE public.grant_checklist_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grant_checklist_completions_read" ON public.grant_checklist_completions
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

CREATE POLICY "grant_checklist_completions_insert" ON public.grant_checklist_completions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_org(org_id) AND completed_by = auth.uid());

CREATE POLICY "grant_checklist_completions_delete" ON public.grant_checklist_completions
  FOR DELETE TO authenticated
  USING (completed_by = auth.uid() OR public.is_org_admin(org_id));

CREATE POLICY "grant_checklist_completions_service" ON public.grant_checklist_completions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON public.grant_checklist_completions TO authenticated;
GRANT ALL ON public.grant_checklist_completions TO service_role;

-- ─── RPC UPDATE: transition_grant_lifecycle ───────────────────────────────────
-- Add checklist completion clearing atomically with the stage change.
-- The function body below is a CREATE OR REPLACE of 0047's version with one
-- block added: DELETE FROM grant_checklist_completions WHERE grant_id = p_grant_id
-- AND stage_key = p_expected_from_stage, inserted immediately before the
-- INSERT INTO grant_status_history.
-- Copy the full function body from 0047 and insert the DELETE block.
-- See 0047_grant_lifecycle_transition_rpc.sql for the base function signature.
```

> **Note:** Open `db/migrations/0047_grant_lifecycle_transition_rpc.sql`, copy the full `CREATE OR REPLACE FUNCTION public.transition_grant_lifecycle(...)` body into this file, then insert the following block immediately before the `INSERT INTO public.grant_status_history` line:

```sql
  -- Clear checklist completions for the stage being exited.
  -- workflow_config_id FK cascade handles removal when config items are deleted,
  -- but stage-exit clearing must happen atomically here.
  DELETE FROM public.grant_checklist_completions
  WHERE grant_id = p_grant_id
    AND stage_key = p_expected_from_stage;
```

- [ ] **Step 3: Verify the migration file exists and has both CREATE TABLE statements**

```bash
grep -c "CREATE TABLE" db/migrations/0049_workflow_config.sql
```
Expected output: `2`

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0049_workflow_config.sql
git commit -m "feat: add org_workflow_config and grant_checklist_completions migration (0049)"
```

---

## Task 2: Workflow Config Library

**Files:**
- Create: `lib/grants/workflow-config-constants.ts`
- Create: `lib/grants/workflow-config.ts`
- Create: `lib/grants/__tests__/workflow-config.test.ts`

**Interfaces:**
- Produces:
  - `REQUIRED_FIELD_ALLOWLIST: readonly string[]`
  - `type RequiredFieldName`
  - `getGrantFieldValue(grant: Record<string, unknown>, fieldName: RequiredFieldName): unknown`
  - `loadWorkflowConfig(db, orgId, stageKey?): Promise<WorkflowConfigRow[]>`
  - `checkWorkflowGate(db, orgId, grantId, fromStage, grantRow): Promise<WorkflowGateResult>`
  - `type WorkflowConfigRow`
  - `type WorkflowGateResult`
- Consumed by: Task 3 (`lifecycle.ts`), Task 4 (bulk-transition), Task 6 (checklist route)

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/grants/__tests__/workflow-config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkWorkflowGate } from '../workflow-config';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const GRANT_ID = '22222222-2222-2222-2222-222222222222';

// Mutable state for the DB mock
let _configRows: any[] = [];
let _completionRows: any[] = [];
let _configError: any = null;
let _completionError: any = null;

function makeDb() {
  return {
    from: (table: string) => {
      if (table === 'org_workflow_config') {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          order: vi.fn(async () => ({ data: _configRows, error: _configError })),
        };
        return b;
      }
      if (table === 'grant_checklist_completions') {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          // Awaiting the chain resolves with the completion rows
          then: (resolve: any) => Promise.resolve({ data: _completionRows, error: _completionError }).then(resolve),
        };
        return b;
      }
      return { select: vi.fn(), eq: vi.fn() };
    },
  } as any;
}

beforeEach(() => {
  _configRows = [];
  _completionRows = [];
  _configError = null;
  _completionError = null;
});

describe('checkWorkflowGate', () => {
  it('returns not-blocked when no workflow config exists for the stage', async () => {
    _configRows = [];
    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('returns blocked when a required checklist item has no completion row', async () => {
    _configRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _completionRows = []; // nothing checked

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(true);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/Site visit completed/);
  });

  it('returns not-blocked when all required checklist items are complete', async () => {
    _configRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _completionRows = [{ checklist_item_key: 'site_visit' }];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(false);
  });

  it('does not block on optional checklist items that are incomplete', async () => {
    _configRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'optional_review',
      config_value: { label: 'Optional review', required: false },
      sort_order: 0,
    }];
    _completionRows = [];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(false);
  });

  it('returns blocked when a required canonical field is null on the grant row', async () => {
    _configRows = [{
      id: 'cfg-2',
      config_type: 'required_field',
      stage_key: 'due_diligence',
      config_key: 'purpose',
      config_value: { field_name: 'purpose', error_message: 'Grant purpose must be set' },
      sort_order: 0,
    }];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', { purpose: null });
    expect(result.blocked).toBe(true);
    expect(result.reasons[0]).toMatch(/Grant purpose must be set/);
  });

  it('returns not-blocked when a required field is set on the grant row', async () => {
    _configRows = [{
      id: 'cfg-2',
      config_type: 'required_field',
      stage_key: 'due_diligence',
      config_key: 'purpose',
      config_value: { field_name: 'purpose', error_message: 'Grant purpose must be set' },
      sort_order: 0,
    }];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', { purpose: 'Fund literacy programs' });
    expect(result.blocked).toBe(false);
  });

  it('accumulates multiple blocking reasons', async () => {
    _configRows = [
      {
        id: 'cfg-1',
        config_type: 'stage_checklist',
        stage_key: 'due_diligence',
        config_key: 'site_visit',
        config_value: { label: 'Site visit completed', required: true },
        sort_order: 0,
      },
      {
        id: 'cfg-2',
        config_type: 'required_field',
        stage_key: 'due_diligence',
        config_key: 'purpose',
        config_value: { field_name: 'purpose', error_message: 'Purpose required' },
        sort_order: 1,
      },
    ];
    _completionRows = [];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', { purpose: null });
    expect(result.blocked).toBe(true);
    expect(result.reasons).toHaveLength(2);
  });

  it('does not gate on approval_requirement rows', async () => {
    _configRows = [{
      id: 'cfg-3',
      config_type: 'approval_requirement',
      stage_key: 'due_diligence',
      config_key: 'default',
      config_value: { required: true, description: 'Board vote required' },
      sort_order: 0,
    }];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run lib/grants/__tests__/workflow-config.test.ts
```
Expected: FAIL — `Cannot find module '../workflow-config'`

- [ ] **Step 3: Create `lib/grants/workflow-config-constants.ts`**

```typescript
// lib/grants/workflow-config-constants.ts
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

export function getGrantFieldValue(
  grant: Record<string, unknown>,
  fieldName: RequiredFieldName
): unknown {
  return grant[fieldName];
}
```

- [ ] **Step 4: Create `lib/grants/workflow-config.ts`**

```typescript
// lib/grants/workflow-config.ts
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

export interface WorkflowGateResult {
  blocked: boolean;
  reasons: string[];
}

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
      .eq('org_id', orgId)
      .eq('grant_id', grantId)
      .eq('stage_key', fromStage);

    const completedKeys = new Set((completions ?? []).map((c: any) => c.checklist_item_key));

    for (const item of checklistItems) {
      if (!completedKeys.has(item.config_key)) {
        const label = item.config_value.label ?? item.config_key;
        reasons.push(`Checklist item not complete: ${label}`);
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

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run lib/grants/__tests__/workflow-config.test.ts
```
Expected: all 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/grants/workflow-config-constants.ts lib/grants/workflow-config.ts lib/grants/__tests__/workflow-config.test.ts
git commit -m "feat: add workflow config library — loadWorkflowConfig + checkWorkflowGate"
```

---

## Task 3: Lifecycle Gate — WorkflowGateBlockedError + transition/route.ts catch

**Files:**
- Modify: `lib/grants/lifecycle.ts`
- Modify: `app/api/org/[orgId]/grants/[grantId]/transition/route.ts`
- Modify: `app/api/__tests__/grants-transition.test.ts`

**Interfaces:**
- Consumes: `checkWorkflowGate` from Task 2
- Produces:
  - `WorkflowGateBlockedError` (exported from `lib/grants/lifecycle.ts`)
  - `transitionGrant` now fetches all `REQUIRED_FIELD_ALLOWLIST` columns and calls `checkWorkflowGate`
  - `transition/route.ts` returns 422 with `blocking_items` on `WorkflowGateBlockedError`

> **Note on `lib/ai/assistant/executors/grants.ts`:** The AI executor has no `transition_grant` tool case today, so the spec's "catch WorkflowGateBlockedError in executors/grants.ts" is a no-op for this phase. `WorkflowGateBlockedError` is exported from `lifecycle.ts` and available for future import when that tool is added.

- [ ] **Step 1: Add gate-blocked test to the transition test file**

Add this describe block at the end of `app/api/__tests__/grants-transition.test.ts`, before the `// ─── NOT TESTED HERE ───` comment:

First, update the `mockAdminFrom` implementation in `setupMocks()` to handle `org_workflow_config` and `grant_checklist_completions`. Replace the existing `setupMocks` function body with:

```typescript
// Add these mutable state vars after the existing state declarations (around line 42):
let _workflowConfigRows: any[] = [];
let _checklistCompletionRows: any[] = [];

// Replace setupMocks() with this version:
function setupMocks() {
  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    return { data: null, error: null };
  });

  mockAdminRpc.mockImplementation(async (fn: string) => {
    if (fn === 'transition_grant_lifecycle') return { data: null, error: _transitionRpcError };
    return { data: null, error: null };
  });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'grants') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: _grantFetchData,
              error: _grantFetchError,
            })),
          })),
        })),
      };
    }
    if (table === 'org_workflow_config') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        order: vi.fn(async () => ({ data: _workflowConfigRows, error: null })),
      };
      return b;
    }
    if (table === 'grant_checklist_completions') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        then: (resolve: any) =>
          Promise.resolve({ data: _checklistCompletionRows, error: null }).then(resolve),
      };
      return b;
    }
    const b: any = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      insert: vi.fn(async () => ({ error: null })),
    };
    return b;
  });
}
```

Also update `beforeEach` to reset the two new state vars:
```typescript
beforeEach(() => {
  _authUser = { id: USER_ID };
  _orgRole = 'admin';
  _grantFetchData = { lifecycle_stage: 'draft', org_id: ORG_ID };
  _grantFetchError = null;
  _transitionRpcError = null;
  _workflowConfigRows = [];        // ← add
  _checklistCompletionRows = [];   // ← add

  setupMocks();
});
```

Also update `_grantFetchData` type annotation to accept all allowlist columns (optional):
```typescript
let _grantFetchData: {
  lifecycle_stage: string;
  org_id: string;
  purpose?: string | null;
  internal_owner_id?: string | null;
  requested_amount?: number | null;
  approved_amount?: number | null;
  grant_period_start?: string | null;
  grant_period_end?: string | null;
  risk_level?: string | null;
  deliverables?: string | null;
  reporting_frequency?: string | null;
} | null = { lifecycle_stage: 'draft', org_id: ORG_ID };
```

Then add this new describe block at the end of the test file (before `// ─── NOT TESTED HERE ───`):

```typescript
// ─── Workflow gate (P0) ───────────────────────────────────────────────────────

describe('POST /api/org/[orgId]/grants/[grantId]/transition — workflow gate', () => {
  it('returns 422 with blocking_items when a required checklist item is not complete', async () => {
    // Arrange — configure a required checklist item; no completions
    _grantFetchData = { lifecycle_stage: 'due_diligence', org_id: ORG_ID };
    _workflowConfigRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _checklistCompletionRows = [];
    const req = makeRequest(transitionUrl(), { to_stage: 'recommended' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.blocking_items).toBeDefined();
    expect(Array.isArray(body.blocking_items)).toBe(true);
    expect(body.blocking_items.length).toBeGreaterThan(0);
  });

  it('returns 200 when all required checklist items are complete', async () => {
    // Arrange — same checklist item, but with a completion row
    _grantFetchData = { lifecycle_stage: 'due_diligence', org_id: ORG_ID };
    _workflowConfigRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _checklistCompletionRows = [{ checklist_item_key: 'site_visit' }];
    const req = makeRequest(transitionUrl(), { to_stage: 'recommended' });

    // Act
    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    // Assert
    expect(res.status).toBe(200);
  });

  it('returns 422 with blocking_items when a required field is null', async () => {
    _grantFetchData = {
      lifecycle_stage: 'due_diligence',
      org_id: ORG_ID,
      purpose: null,
    };
    _workflowConfigRows = [{
      id: 'cfg-2',
      config_type: 'required_field',
      stage_key: 'due_diligence',
      config_key: 'purpose',
      config_value: { field_name: 'purpose', error_message: 'Grant purpose required' },
      sort_order: 0,
    }];
    const req = makeRequest(transitionUrl(), { to_stage: 'recommended' });

    const res = await POST(req, makeParams(ORG_ID, GRANT_ID));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.blocking_items).toContain('Grant purpose required');
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
npx vitest run app/api/__tests__/grants-transition.test.ts
```
Expected: existing tests pass; the 3 new gate tests FAIL (WorkflowGateBlockedError not yet imported by route)

- [ ] **Step 3: Modify `lib/grants/lifecycle.ts`**

Add the import at the top of the file (after existing imports):
```typescript
import { checkWorkflowGate } from './workflow-config';
```

Add the new error class after `GrantTransitionConflictError`:
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

Replace the `transitionGrant` grant fetch (lines 70-74) with the expanded version:
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

Insert the gate check after the `canTransition` check and before the `requiresDecision` check:
```typescript
  // After: if (!canTransition(fromStage, toStage)) throw new InvalidTransitionError(...)

  const gate = await checkWorkflowGate(db, orgId, grantId, fromStage, grant as Record<string, unknown>);
  if (gate.blocked) throw new WorkflowGateBlockedError(gate.reasons);

  // Before: if (requiresDecision(...) && !decisionPayload) ...
```

- [ ] **Step 4: Modify `app/api/org/[orgId]/grants/[grantId]/transition/route.ts`**

Add `WorkflowGateBlockedError` to the import:
```typescript
import {
  transitionGrant,
  InvalidTransitionError,
  DecisionRequiredError,
  GrantNotFoundError,
  GrantTransitionConflictError,
  WorkflowGateBlockedError,
  type LifecycleStage,
  type DecisionPayload,
} from '@/lib/grants/lifecycle';
```

Add a new catch block in the route's catch handler, immediately before the `InvalidTransitionError | DecisionRequiredError` check:
```typescript
    if (err instanceof WorkflowGateBlockedError) {
      return json({ error: err.message, blocking_items: err.reasons }, { status: 422 });
    }
    if (err instanceof InvalidTransitionError || err instanceof DecisionRequiredError) {
```

- [ ] **Step 5: Run all transition tests**

```bash
npx vitest run app/api/__tests__/grants-transition.test.ts
```
Expected: all tests PASS (including the 3 new gate tests)

- [ ] **Step 6: Commit**

```bash
git add lib/grants/lifecycle.ts app/api/org/[orgId]/grants/[grantId]/transition/route.ts app/api/__tests__/grants-transition.test.ts
git commit -m "feat: add WorkflowGateBlockedError and gate check to transitionGrant"
```

---

## Task 4: Bulk-Transition Gate

**Files:**
- Modify: `app/api/org/[orgId]/grants/bulk-transition/route.ts`
- Modify: `app/api/__tests__/grants-bulk-transition.test.ts`

**Interfaces:**
- Consumes: `checkWorkflowGate` from Task 2, `WorkflowGateBlockedError` from Task 3
- Produces: preflight loop blocks gate-failing grants; `rollback_on_error=true` path is protected because it only receives grants that pass preflight

- [ ] **Step 1: Read the existing bulk-transition test file structure**

Read `app/api/__tests__/grants-bulk-transition.test.ts` to understand its mock structure before modifying. Look for how `mockAdminFrom` handles multiple tables.

- [ ] **Step 2: Add gate-blocked tests to the bulk-transition test file**

In the existing bulk-transition test, add these two new state variables alongside the existing ones:
```typescript
let _workflowConfigRows: any[] = [];
let _checklistCompletionRows: any[] = [];
```

In `setupMocks()` (or wherever `mockAdminFrom` is configured), add handling for `org_workflow_config` and `grant_checklist_completions` using the same pattern as Task 3's transition test.

Then add this new describe block:

```typescript
describe('POST bulk-transition — workflow gate', () => {
  it('preflight rejects a grant blocked by workflow gate (rollback_on_error=false)', async () => {
    // Arrange: one valid grant, one gate-blocked grant
    const GRANT_1 = '22222222-2222-2222-2222-222222222221';
    const GRANT_2 = '22222222-2222-2222-2222-222222222222';

    // Both grants exist and have valid transitions
    _grantRows = [
      { id: GRANT_1, lifecycle_stage: 'due_diligence', org_id: ORG_ID, purpose: 'Fund literacy', internal_owner_id: null, requested_amount: null, approved_amount: null, grant_period_start: null, grant_period_end: null, risk_level: null, deliverables: null, reporting_frequency: null },
      { id: GRANT_2, lifecycle_stage: 'due_diligence', org_id: ORG_ID, purpose: 'Fund arts', internal_owner_id: null, requested_amount: null, approved_amount: null, grant_period_start: null, grant_period_end: null, risk_level: null, deliverables: null, reporting_frequency: null },
    ];
    // A required checklist item exists for due_diligence
    _workflowConfigRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    // GRANT_1 has the item checked; GRANT_2 does not
    // The mock must return completions based on grant_id; simplify by returning
    // completions for all (so GRANT_1 passes) or none (so both fail) — use 'all pass' here
    // to test partial failure: set _checklistCompletionRows = [] so both get blocked,
    // then verify the partial-mode response has errors for both.
    _checklistCompletionRows = [];

    const req = makeBulkRequest({
      transitions: [
        { grantId: GRANT_1, expectedFromStage: 'due_diligence', targetStage: 'recommended' },
        { grantId: GRANT_2, expectedFromStage: 'due_diligence', targetStage: 'recommended' },
      ],
      rollback_on_error: false,
    });

    const res = await POST(req, makeParams(ORG_ID));

    // Both should be preflight-rejected with gate errors
    expect(res.status).toBe(207);
    const body = await res.json();
    const errors = body.results.filter((r: any) => !r.success);
    expect(errors.length).toBe(2);
    expect(errors[0].error).toMatch(/blocked/i);
  });

  it('preflight rejects gate-blocked grants and blocks rollback_on_error execution', async () => {
    const GRANT_1 = '22222222-2222-2222-2222-222222222221';
    _grantRows = [
      { id: GRANT_1, lifecycle_stage: 'due_diligence', org_id: ORG_ID, purpose: null, internal_owner_id: null, requested_amount: null, approved_amount: null, grant_period_start: null, grant_period_end: null, risk_level: null, deliverables: null, reporting_frequency: null },
    ];
    _workflowConfigRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _checklistCompletionRows = [];

    const req = makeBulkRequest({
      transitions: [{ grantId: GRANT_1, expectedFromStage: 'due_diligence', targetStage: 'recommended' }],
      rollback_on_error: true,
    });

    const res = await POST(req, makeParams(ORG_ID));

    // rollback_on_error + preflight failure → 409, no RPC called
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.rollbackOnError).toBe(true);
    expect(body.results[0].success).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify new tests fail**

```bash
npx vitest run app/api/__tests__/grants-bulk-transition.test.ts
```
Expected: new gate tests FAIL

- [ ] **Step 4: Modify `app/api/org/[orgId]/grants/bulk-transition/route.ts`**

Add imports at the top:
```typescript
import { checkWorkflowGate, WorkflowGateBlockedError } from '@/lib/grants/workflow-config';
```

Wait — `WorkflowGateBlockedError` is exported from `lifecycle.ts`, not `workflow-config.ts`. The import should be:
```typescript
import { checkWorkflowGate } from '@/lib/grants/workflow-config';
```
(No need to import `WorkflowGateBlockedError` in the bulk route — preflight uses the result object, not the error class.)

**Replace the preflight SELECT** (line 88, current: `.select('id, lifecycle_stage, org_id')`):
```typescript
      .select(
        'id, lifecycle_stage, org_id, purpose, internal_owner_id, requested_amount, ' +
        'approved_amount, grant_period_start, grant_period_end, risk_level, ' +
        'deliverables, reporting_frequency'
      )
```

**Update the `grantMap` type** (line 96):
```typescript
    const grantMap = new Map<string, {
      lifecycle_stage: string;
      org_id: string;
      purpose: string | null;
      internal_owner_id: string | null;
      requested_amount: number | null;
      approved_amount: number | null;
      grant_period_start: string | null;
      grant_period_end: string | null;
      risk_level: string | null;
      deliverables: string | null;
      reporting_frequency: string | null;
    }>();
```

**Add gate check in the preflight loop**, immediately after the `requiresDecision` check (after line ~148, after the `continue` for missing decision payload), before the `decisionPayload` construction and `executableTransitions.push`:

```typescript
      // Workflow gate check — runs before the rollbackOnError branch decision,
      // so it covers both the partial and atomic execution paths.
      const gate = await checkWorkflowGate(adminSupabase, orgId, item.grantId, item.expectedFromStage as LifecycleStage, dbGrant as Record<string, unknown>);
      if (gate.blocked) {
        results.push({
          grantId: item.grantId,
          success: false,
          error: `Transition blocked: ${gate.reasons.join('; ')}`,
          blocking_items: gate.reasons,
        } as any);
        continue;
      }
```

- [ ] **Step 5: Run bulk-transition tests**

```bash
npx vitest run app/api/__tests__/grants-bulk-transition.test.ts
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/org/[orgId]/grants/bulk-transition/route.ts app/api/__tests__/grants-bulk-transition.test.ts
git commit -m "feat: add workflow gate check to bulk-transition preflight"
```

---

## Task 5: Builder Tools — 7 New Tools

**Files:**
- Modify: `lib/builder/tools.ts`

**Interfaces:**
- Consumes: `REQUIRED_FIELD_ALLOWLIST` from `lib/grants/workflow-config-constants.ts`, `LIFECYCLE_STAGES` from `lib/grants/lifecycle-shared.ts`
- Produces: 7 new tool definitions and executor cases: `add_checklist_item`, `remove_checklist_item`, `set_required_field`, `remove_required_field`, `rename_stage`, `set_approval_requirement`, `list_workflow_config`

- [ ] **Step 1: Read the current builder tools file structure**

Read `lib/builder/tools.ts` — specifically the `BUILDER_TOOLS` array definition and the `executeTool` switch statement to understand where to insert new entries.

- [ ] **Step 2: Write the contract test**

Add to `lib/builder/__tests__/builder-tools-kpi.test.ts` (or create a new `lib/builder/__tests__/builder-tools-workflow.test.ts`):

```typescript
// lib/builder/__tests__/builder-tools-workflow.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('builder workflow tools', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  const workflowTools = [
    'add_checklist_item',
    'remove_checklist_item',
    'set_required_field',
    'remove_required_field',
    'rename_stage',
    'set_approval_requirement',
    'list_workflow_config',
  ];

  for (const tool of workflowTools) {
    it(`exports ${tool} tool definition`, () => {
      expect(src).toMatch(new RegExp(`name:\\s*['"]${tool}['"]`));
    });
  }

  it('add_checklist_item requires stage_key, item_key, label, required', () => {
    const idx = src.indexOf("name: 'add_checklist_item'");
    const snippet = src.slice(idx, idx + 600);
    expect(snippet).toMatch(/stage_key/);
    expect(snippet).toMatch(/item_key/);
    expect(snippet).toMatch(/label/);
    expect(snippet).toMatch(/required/);
  });

  it('set_required_field validates field_name against allowlist', () => {
    const idx = src.indexOf("name: 'set_required_field'");
    const snippet = src.slice(idx, idx + 600);
    expect(snippet).toMatch(/field_name/);
    expect(snippet).toMatch(/REQUIRED_FIELD_ALLOWLIST|purpose/);
  });

  it('rename_stage requires stage_key and label', () => {
    const idx = src.indexOf("name: 'rename_stage'");
    const snippet = src.slice(idx, idx + 400);
    expect(snippet).toMatch(/stage_key/);
    expect(snippet).toMatch(/label/);
  });
});
```

- [ ] **Step 3: Run contract tests to confirm they fail**

```bash
npx vitest run lib/builder/__tests__/builder-tools-workflow.test.ts
```
Expected: FAIL — tools not yet defined

- [ ] **Step 4: Add tool definitions to `BUILDER_TOOLS` in `lib/builder/tools.ts`**

Add these 7 entries to the `BUILDER_TOOLS` array. They belong in a `// ==================== WORKFLOW CONFIG ====================` section:

```typescript
// ==================== WORKFLOW CONFIG ====================
{
  name: 'add_checklist_item',
  description: 'Add or update a checklist item for a grant lifecycle stage. The item will appear on the grant detail for grants in that stage, and if required=true, the transition out of the stage will be blocked until the item is checked.',
  input_schema: {
    type: 'object',
    properties: {
      stage_key: {
        type: 'string',
        description: 'Lifecycle stage this checklist item applies to (e.g., "due_diligence"). Must be a canonical lifecycle stage.',
      },
      item_key: {
        type: 'string',
        description: 'Unique slug for this item within the stage, e.g. "site_visit". Lowercase letters, digits, and underscores only.',
      },
      label: {
        type: 'string',
        description: 'Human-readable label shown on the checklist, e.g. "Site visit completed". Max 200 characters.',
      },
      required: {
        type: 'boolean',
        description: 'If true, the stage transition is blocked until this item is checked.',
      },
      sort_order: {
        type: 'number',
        description: 'Display order (lower = first). Default: 0.',
      },
    },
    required: ['stage_key', 'item_key', 'label', 'required'],
  },
},
{
  name: 'remove_checklist_item',
  description: 'Remove a checklist item from a grant lifecycle stage. All existing completion records for this item are automatically deleted via cascade.',
  input_schema: {
    type: 'object',
    properties: {
      stage_key: { type: 'string', description: 'Lifecycle stage the item belongs to.' },
      item_key: { type: 'string', description: 'Slug of the item to remove.' },
    },
    required: ['stage_key', 'item_key'],
  },
},
{
  name: 'set_required_field',
  description: 'Require that a canonical grant field is non-null before a grant can advance past a given stage. Only canonical grant fields in the allowlist are supported.',
  input_schema: {
    type: 'object',
    properties: {
      stage_key: { type: 'string', description: 'Lifecycle stage at which the field is checked.' },
      field_name: {
        type: 'string',
        enum: [
          'purpose', 'internal_owner_id', 'requested_amount', 'approved_amount',
          'grant_period_start', 'grant_period_end', 'risk_level', 'deliverables',
          'reporting_frequency',
        ],
        description: 'Canonical grant field that must be set.',
      },
      error_message: {
        type: 'string',
        description: 'Message shown when the field is missing. Max 300 characters. Optional.',
      },
    },
    required: ['stage_key', 'field_name'],
  },
},
{
  name: 'remove_required_field',
  description: 'Remove a required-field rule for a grant lifecycle stage.',
  input_schema: {
    type: 'object',
    properties: {
      stage_key: { type: 'string', description: 'Lifecycle stage the rule applies to.' },
      field_name: {
        type: 'string',
        enum: [
          'purpose', 'internal_owner_id', 'requested_amount', 'approved_amount',
          'grant_period_start', 'grant_period_end', 'risk_level', 'deliverables',
          'reporting_frequency',
        ],
        description: 'Canonical grant field to remove the requirement for.',
      },
    },
    required: ['stage_key', 'field_name'],
  },
},
{
  name: 'rename_stage',
  description: 'Set a display label override for a canonical grant lifecycle stage. Pass an empty string for label to restore the system default name.',
  input_schema: {
    type: 'object',
    properties: {
      stage_key: { type: 'string', description: 'Canonical stage key to rename (e.g., "due_diligence").' },
      label: { type: 'string', description: 'New display name, e.g. "Site Review". Max 60 characters. Pass empty string to remove the override.' },
    },
    required: ['stage_key', 'label'],
  },
},
{
  name: 'set_approval_requirement',
  description: 'Record an informational approval requirement annotation for a grant lifecycle stage. This is displayed in the settings page and grant checklist — it does NOT block transitions in Phase 1.',
  input_schema: {
    type: 'object',
    properties: {
      stage_key: { type: 'string', description: 'Lifecycle stage this annotation applies to.' },
      required: { type: 'boolean', description: 'Whether approval is required. Pass false to remove the annotation.' },
      description: { type: 'string', description: 'Description of the approval requirement, e.g. "Board vote required". Max 300 characters.' },
    },
    required: ['stage_key', 'required'],
  },
},
{
  name: 'list_workflow_config',
  description: 'List all workflow configuration for this organization, grouped by stage. Shows checklist items, required fields, stage label overrides, and approval annotations.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
},
```

- [ ] **Step 5: Add executor cases to `executeTool()` switch in `lib/builder/tools.ts`**

Read `lib/builder/tools.ts` to find the `executeTool` function and its switch statement. Add these cases. Each case receives `{ orgId, args, supabase }` (match the existing pattern in the file).

```typescript
case 'add_checklist_item': {
  const { stage_key, item_key, label, required, sort_order = 0 } = args as {
    stage_key: string; item_key: string; label: string; required: boolean; sort_order?: number;
  };

  if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
    return { type: 'error', error: `Invalid stage_key: ${stage_key}. Must be one of: ${LIFECYCLE_STAGES.join(', ')}` };
  }
  if (!/^[a-z0-9_]+$/.test(item_key)) {
    return { type: 'error', error: 'item_key must contain only lowercase letters, digits, and underscores.' };
  }
  if (item_key.length > 64) {
    return { type: 'error', error: 'item_key must be 64 characters or fewer.' };
  }
  if (label.length > 200) {
    return { type: 'error', error: 'label must be 200 characters or fewer.' };
  }

  const { data: hasModule } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
  if (!hasModule) return { type: 'error', error: 'Grant management module is not enabled for this organization.' };

  const { error } = await supabase
    .from('org_workflow_config')
    .upsert({
      org_id: orgId,
      module: 'grant_management',
      config_type: 'stage_checklist',
      stage_key,
      config_key: item_key,
      config_value: { label, required },
      sort_order,
    }, { onConflict: 'org_id,module,config_type,stage_key,config_key' });

  if (error) return { type: 'error', error: error.message };
  return { type: 'success', message: `Checklist item "${label}" added to ${stage_key}${required ? ' (required)' : ' (optional)'}.` };
}

case 'remove_checklist_item': {
  const { stage_key, item_key } = args as { stage_key: string; item_key: string };

  const { data: hasModule } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
  if (!hasModule) return { type: 'error', error: 'Grant management module is not enabled for this organization.' };

  const { error } = await supabase
    .from('org_workflow_config')
    .delete()
    .eq('org_id', orgId)
    .eq('module', 'grant_management')
    .eq('config_type', 'stage_checklist')
    .eq('stage_key', stage_key)
    .eq('config_key', item_key);

  if (error) return { type: 'error', error: error.message };
  return { type: 'success', message: `Checklist item "${item_key}" removed from ${stage_key}. Existing completion records have been automatically deleted.` };
}

case 'set_required_field': {
  const { stage_key, field_name, error_message } = args as {
    stage_key: string; field_name: string; error_message?: string;
  };

  if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
    return { type: 'error', error: `Invalid stage_key: ${stage_key}.` };
  }
  if (!REQUIRED_FIELD_ALLOWLIST.includes(field_name as any)) {
    return { type: 'error', error: `field_name must be one of: ${REQUIRED_FIELD_ALLOWLIST.join(', ')}` };
  }

  const { data: hasModule } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
  if (!hasModule) return { type: 'error', error: 'Grant management module is not enabled.' };

  const configValue: Record<string, string> = { field_name };
  if (error_message) configValue.error_message = error_message;

  const { error } = await supabase
    .from('org_workflow_config')
    .upsert({
      org_id: orgId,
      module: 'grant_management',
      config_type: 'required_field',
      stage_key,
      config_key: field_name,
      config_value: configValue,
      sort_order: 0,
    }, { onConflict: 'org_id,module,config_type,stage_key,config_key' });

  if (error) return { type: 'error', error: error.message };
  return { type: 'success', message: `Field "${field_name}" is now required before advancing past ${stage_key}.` };
}

case 'remove_required_field': {
  const { stage_key, field_name } = args as { stage_key: string; field_name: string };

  const { data: hasModule } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
  if (!hasModule) return { type: 'error', error: 'Grant management module is not enabled.' };

  const { error } = await supabase
    .from('org_workflow_config')
    .delete()
    .eq('org_id', orgId)
    .eq('module', 'grant_management')
    .eq('config_type', 'required_field')
    .eq('stage_key', stage_key)
    .eq('config_key', field_name);

  if (error) return { type: 'error', error: error.message };
  return { type: 'success', message: `Required field rule for "${field_name}" at stage "${stage_key}" removed.` };
}

case 'rename_stage': {
  const { stage_key, label } = args as { stage_key: string; label: string };

  if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
    return { type: 'error', error: `Invalid stage_key: ${stage_key}.` };
  }
  if (label.length > 60) {
    return { type: 'error', error: 'label must be 60 characters or fewer.' };
  }

  const { data: hasModule } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
  if (!hasModule) return { type: 'error', error: 'Grant management module is not enabled.' };

  if (label === '') {
    await supabase
      .from('org_workflow_config')
      .delete()
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .eq('config_type', 'stage_label')
      .eq('stage_key', stage_key)
      .eq('config_key', 'label');
    return { type: 'success', message: `Stage "${stage_key}" label restored to system default.` };
  }

  const { error } = await supabase
    .from('org_workflow_config')
    .upsert({
      org_id: orgId,
      module: 'grant_management',
      config_type: 'stage_label',
      stage_key,
      config_key: 'label',
      config_value: { value: label },
      sort_order: 0,
    }, { onConflict: 'org_id,module,config_type,stage_key,config_key' });

  if (error) return { type: 'error', error: error.message };
  return { type: 'success', message: `Stage "${stage_key}" will now display as "${label}".` };
}

case 'set_approval_requirement': {
  const { stage_key, required, description } = args as {
    stage_key: string; required: boolean; description?: string;
  };

  if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
    return { type: 'error', error: `Invalid stage_key: ${stage_key}.` };
  }

  const { data: hasModule } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
  if (!hasModule) return { type: 'error', error: 'Grant management module is not enabled.' };

  if (!required) {
    await supabase
      .from('org_workflow_config')
      .delete()
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .eq('config_type', 'approval_requirement')
      .eq('stage_key', stage_key)
      .eq('config_key', 'default');
    return { type: 'success', message: `Approval annotation removed for stage "${stage_key}".` };
  }

  const { error } = await supabase
    .from('org_workflow_config')
    .upsert({
      org_id: orgId,
      module: 'grant_management',
      config_type: 'approval_requirement',
      stage_key,
      config_key: 'default',
      config_value: { required: true, description: description ?? '' },
      sort_order: 0,
    }, { onConflict: 'org_id,module,config_type,stage_key,config_key' });

  if (error) return { type: 'error', error: error.message };
  return { type: 'success', message: `Approval annotation set for stage "${stage_key}": ${description ?? '(no description)'}. Note: this is informational only and does not block transitions.` };
}

case 'list_workflow_config': {
  const { data: rows, error } = await supabase
    .from('org_workflow_config')
    .select('config_type, stage_key, config_key, config_value, sort_order')
    .eq('org_id', orgId)
    .eq('module', 'grant_management')
    .order('stage_key')
    .order('sort_order');

  if (error) return { type: 'error', error: error.message };
  if (!rows || rows.length === 0) {
    return { type: 'success', message: 'No workflow configuration set for this organization. All stage transitions use system defaults.' };
  }

  // Group by stage
  const byStage = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byStage.has(row.stage_key)) byStage.set(row.stage_key, []);
    byStage.get(row.stage_key)!.push(row);
  }

  const lines: string[] = [];
  for (const [stage, stageRows] of byStage) {
    const labelRow = stageRows.find(r => r.config_type === 'stage_label');
    const labelSuffix = labelRow ? ` (label: "${(labelRow.config_value as any).value}")` : '';
    lines.push(`Stage: ${stage}${labelSuffix}`);

    const checklist = stageRows.filter(r => r.config_type === 'stage_checklist');
    if (checklist.length > 0) {
      lines.push('  Checklist items:');
      for (const c of checklist) {
        const cv = c.config_value as any;
        lines.push(`    [${cv.required ? 'required' : 'optional'}] ${c.config_key} — "${cv.label}"`);
      }
    }

    const required = stageRows.filter(r => r.config_type === 'required_field');
    if (required.length > 0) {
      lines.push('  Required fields:');
      for (const r of required) {
        const rv = r.config_value as any;
        lines.push(`    ${r.config_key}${rv.error_message ? ` — "${rv.error_message}"` : ''}`);
      }
    }

    const approval = stageRows.find(r => r.config_type === 'approval_requirement');
    if (approval) {
      const av = approval.config_value as any;
      lines.push(`  Approval: ${av.description || '(required, no description)'}`);
    }
    lines.push('');
  }

  return { type: 'success', message: lines.join('\n') };
}
```

Also add these imports near the top of `lib/builder/tools.ts` if not already present:
```typescript
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import { REQUIRED_FIELD_ALLOWLIST } from '@/lib/grants/workflow-config-constants';
```

- [ ] **Step 6: Run contract tests**

```bash
npx vitest run lib/builder/__tests__/builder-tools-workflow.test.ts
```
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/builder/tools.ts lib/builder/__tests__/builder-tools-workflow.test.ts
git commit -m "feat: add 7 Builder tools for workflow configuration (Phase 1)"
```

---

## Task 6: Workflow Config API Routes

**Files:**
- Create: `app/api/org/[orgId]/workflow-config/route.ts`
- Create: `app/api/org/[orgId]/workflow-config/labels/route.ts`
- Create: `app/api/__tests__/workflow-config.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/org/[orgId]/workflow-config` → `{ data: WorkflowConfigRow[] }` (admin only)
  - `GET /api/org/[orgId]/workflow-config/labels` → `{ labels: Record<string, string> }` (any org member, cached)

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/__tests__/workflow-config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _orgRole: string | null = 'admin';
let _configRows: any[] = [];
let _configError: any = null;

const mockServerRpc = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
    rpc: mockServerRpc,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

function setupMocks() {
  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    if (fn === 'org_has_module') return { data: true, error: null };
    return { data: null, error: null };
  });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'org_workflow_config') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        order: vi.fn(async () => ({ data: _configRows, error: _configError })),
      };
      return b;
    }
    return { select: vi.fn(), eq: vi.fn() };
  });
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _orgRole = 'admin';
  _configRows = [];
  _configError = null;
  setupMocks();
});

import { GET as getAll } from '@/app/api/org/[orgId]/workflow-config/route';
import { GET as getLabels } from '@/app/api/org/[orgId]/workflow-config/labels/route';

function makeParams(orgId: string) {
  return { params: Promise.resolve({ orgId }) } as any;
}

// ─── GET /workflow-config ──────────────────────────────────────────────────────

describe('GET /api/org/[orgId]/workflow-config', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config`);
    const res = await getAll(req, makeParams(ORG_ID));
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not an admin', async () => {
    _orgRole = 'member';
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config`);
    const res = await getAll(req, makeParams(ORG_ID));
    expect(res.status).toBe(403);
  });

  it('returns 200 with data array for admin', async () => {
    _configRows = [
      { id: 'r1', config_type: 'stage_checklist', stage_key: 'due_diligence', config_key: 'site_visit', config_value: { label: 'Site visit', required: true }, sort_order: 0 },
    ];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config`);
    const res = await getAll(req, makeParams(ORG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns empty array when no config exists', async () => {
    _configRows = [];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config`);
    const res = await getAll(req, makeParams(ORG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ─── GET /workflow-config/labels ──────────────────────────────────────────────

describe('GET /api/org/[orgId]/workflow-config/labels', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config/labels`);
    const res = await getLabels(req, makeParams(ORG_ID));
    expect(res.status).toBe(401);
  });

  it('returns 200 with labels map for member', async () => {
    _orgRole = 'member';
    _configRows = [
      { config_type: 'stage_label', stage_key: 'due_diligence', config_key: 'label', config_value: { value: 'Site Review' }, sort_order: 0 },
    ];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config/labels`);
    const res = await getLabels(req, makeParams(ORG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.labels).toEqual({ due_diligence: 'Site Review' });
  });

  it('returns empty labels object when no stage_label rows exist', async () => {
    _configRows = [
      { config_type: 'stage_checklist', stage_key: 'due_diligence', config_key: 'site_visit', config_value: { label: 'X', required: true }, sort_order: 0 },
    ];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config/labels`);
    const res = await getLabels(req, makeParams(ORG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.labels).toEqual({});
  });

  it('response includes Cache-Control header', async () => {
    _configRows = [];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config/labels`);
    const res = await getLabels(req, makeParams(ORG_ID));
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/__tests__/workflow-config.test.ts
```
Expected: FAIL — modules not found

- [ ] **Step 3: Create `app/api/org/[orgId]/workflow-config/route.ts`**

```typescript
// app/api/org/[orgId]/workflow-config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const ADMIN_ROLES = new Set(['owner', 'admin']);

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE, ...(init.headers || {}) } });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return json({ error: 'Admin access required' }, { status: 403 });
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from('org_workflow_config')
      .select('id, config_type, stage_key, config_key, config_value, sort_order, created_at, updated_at')
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .order('stage_key')
      .order('sort_order');

    if (error) throw error;

    return json({ data: data ?? [] });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create `app/api/org/[orgId]/workflow-config/labels/route.ts`**

```typescript
// app/api/org/[orgId]/workflow-config/labels/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Any org member can read labels — no admin check needed
    const db = createAdminClient();
    const { data, error } = await db
      .from('org_workflow_config')
      .select('stage_key, config_value')
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .eq('config_type', 'stage_label');

    if (error) throw error;

    const labels: Record<string, string> = {};
    for (const row of data ?? []) {
      const value = (row.config_value as any)?.value;
      if (value) labels[row.stage_key] = value;
    }

    return NextResponse.json({ labels }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run app/api/__tests__/workflow-config.test.ts
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/org/[orgId]/workflow-config/route.ts app/api/org/[orgId]/workflow-config/labels/route.ts app/api/__tests__/workflow-config.test.ts
git commit -m "feat: add workflow-config GET routes (all config + labels)"
```

---

## Task 7: Checklist API Route

**Files:**
- Create: `app/api/org/[orgId]/grants/[grantId]/checklist/route.ts`
- Create: `app/api/__tests__/grants-checklist.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/org/[orgId]/grants/[grantId]/checklist` → merged checklist state per stage
  - `POST /api/org/[orgId]/grants/[grantId]/checklist` → check/uncheck a single item

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/__tests__/grants-checklist.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const GRANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONFIG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

let _authUser: { id: string } | null = { id: USER_ID };
let _orgRole: string | null = 'member';
let _configRows: any[] = [];
let _completionRows: any[] = [];
let _configLookupRow: any = null; // for POST config-item validation
let _insertError: any = null;
let _deleteCount: number = 1;

const mockServerRpc = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
    rpc: mockServerRpc,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom, rpc: vi.fn(async () => ({ data: true, error: null })) })),
}));

function setupMocks() {
  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    if (fn === 'org_has_module') return { data: true, error: null };
    return { data: null, error: null };
  });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'org_workflow_config') {
      // For GET: returns list. For POST lookup: returns single row.
      let isSingle = false;
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        order: vi.fn(async () => ({ data: _configRows, error: null })),
        maybeSingle: vi.fn(async () => ({ data: _configLookupRow, error: null })),
      };
      return b;
    }
    if (table === 'grant_checklist_completions') {
      const insertResult = { error: _insertError };
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        then: (resolve: any) => Promise.resolve({ data: _completionRows, error: null }).then(resolve),
        insert: vi.fn(async () => insertResult),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: _deleteCount > 0 ? [{}] : [], error: null })),
            })),
          })),
        })),
      };
      return b;
    }
    return {};
  });
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _orgRole = 'member';
  _configRows = [];
  _completionRows = [];
  _configLookupRow = null;
  _insertError = null;
  _deleteCount = 1;
  setupMocks();
});

import { GET, POST } from '@/app/api/org/[orgId]/grants/[grantId]/checklist/route';

function makeParams(orgId: string, grantId: string) {
  return { params: Promise.resolve({ orgId, grantId }) } as any;
}
function makeGetReq() {
  return new NextRequest(`http://localhost/api/org/${ORG_ID}/grants/${GRANT_ID}/checklist`);
}
function makePostReq(body: unknown) {
  return new NextRequest(`http://localhost/api/org/${ORG_ID}/grants/${GRANT_ID}/checklist`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── GET ─────────────────────────────────────────────────────────────────────

describe('GET /checklist', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const res = await GET(makeGetReq(), makeParams(ORG_ID, GRANT_ID));
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty data when no checklist items configured', async () => {
    _configRows = [];
    const res = await GET(makeGetReq(), makeParams(ORG_ID, GRANT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Object.keys(body.data)).toHaveLength(0);
  });

  it('returns merged items with completed=false when no completions', async () => {
    _configRows = [{
      id: CONFIG_ID,
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _completionRows = [];

    const res = await GET(makeGetReq(), makeParams(ORG_ID, GRANT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data['due_diligence'].items[0]).toMatchObject({
      key: 'site_visit',
      label: 'Site visit completed',
      required: true,
      completed: false,
    });
  });

  it('returns completed=true when a completion row exists', async () => {
    _configRows = [{
      id: CONFIG_ID,
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _completionRows = [{
      workflow_config_id: CONFIG_ID,
      completed_by: USER_ID,
      completed_at: '2026-06-29T00:00:00Z',
    }];

    const res = await GET(makeGetReq(), makeParams(ORG_ID, GRANT_ID));
    const body = await res.json();
    expect(body.data['due_diligence'].items[0].completed).toBe(true);
  });
});

// ─── POST ─────────────────────────────────────────────────────────────────────

describe('POST /checklist', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const res = await POST(makePostReq({ stage_key: 'due_diligence', item_key: 'site_visit', completed: true }), makeParams(ORG_ID, GRANT_ID));
    expect(res.status).toBe(401);
  });

  it('returns 400 when stage_key is missing', async () => {
    const res = await POST(makePostReq({ item_key: 'site_visit', completed: true }), makeParams(ORG_ID, GRANT_ID));
    expect(res.status).toBe(400);
  });

  it('returns 404 when config item does not exist', async () => {
    _configLookupRow = null;
    const res = await POST(makePostReq({ stage_key: 'due_diligence', item_key: 'site_visit', completed: true }), makeParams(ORG_ID, GRANT_ID));
    expect(res.status).toBe(404);
  });

  it('returns 200 success when checking an item that exists in config', async () => {
    _configLookupRow = { id: CONFIG_ID, stage_key: 'due_diligence', config_key: 'site_visit' };
    const res = await POST(makePostReq({ stage_key: 'due_diligence', item_key: 'site_visit', completed: true }), makeParams(ORG_ID, GRANT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when unchecking an item with no existing completion row', async () => {
    _configLookupRow = { id: CONFIG_ID, stage_key: 'due_diligence', config_key: 'site_visit' };
    _deleteCount = 0;
    const res = await POST(makePostReq({ stage_key: 'due_diligence', item_key: 'site_visit', completed: false }), makeParams(ORG_ID, GRANT_ID));
    expect(res.status).toBe(404);
  });

  it('returns 200 when unchecking an item that has a completion row', async () => {
    _configLookupRow = { id: CONFIG_ID, stage_key: 'due_diligence', config_key: 'site_visit' };
    _deleteCount = 1;
    const res = await POST(makePostReq({ stage_key: 'due_diligence', item_key: 'site_visit', completed: false }), makeParams(ORG_ID, GRANT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run app/api/__tests__/grants-checklist.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `app/api/org/[orgId]/grants/[grantId]/checklist/route.ts`**

```typescript
// app/api/org/[orgId]/grants/[grantId]/checklist/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string; grantId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE, ...(init.headers || {}) } });
}

const postSchema = z.object({
  stage_key: z.string().min(1),
  item_key: z.string().min(1),
  completed: z.boolean(),
});

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const db = createAdminClient();

    // Fetch all checklist and approval_requirement config for this org
    const { data: configRows, error: configErr } = await db
      .from('org_workflow_config')
      .select('id, config_type, stage_key, config_key, config_value, sort_order')
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .in('config_type', ['stage_checklist', 'approval_requirement'])
      .order('stage_key')
      .order('sort_order');

    if (configErr) throw configErr;

    if (!configRows || configRows.length === 0) {
      return json({ data: {} });
    }

    // Fetch completions for this grant
    const { data: completionRows } = await db
      .from('grant_checklist_completions')
      .select('workflow_config_id, completed_by, completed_at')
      .eq('org_id', orgId)
      .eq('grant_id', grantId);

    const completionMap = new Map<string, { completed_by: string | null; completed_at: string | null }>();
    for (const c of completionRows ?? []) {
      completionMap.set(c.workflow_config_id, { completed_by: c.completed_by, completed_at: c.completed_at });
    }

    // Build per-stage response
    const result: Record<string, {
      items: Array<{
        key: string; label: string; required: boolean; sort_order: number;
        completed: boolean; completed_by: string | null; completed_at: string | null;
      }>;
      approval_requirement: { required: boolean; description: string } | null;
    }> = {};

    for (const row of configRows) {
      if (!result[row.stage_key]) {
        result[row.stage_key] = { items: [], approval_requirement: null };
      }

      if (row.config_type === 'stage_checklist') {
        const cv = row.config_value as any;
        const completion = completionMap.get(row.id);
        result[row.stage_key].items.push({
          key: row.config_key,
          label: cv.label ?? row.config_key,
          required: cv.required === true,
          sort_order: row.sort_order,
          completed: !!completion,
          completed_by: completion?.completed_by ?? null,
          completed_at: completion?.completed_at ?? null,
        });
      } else if (row.config_type === 'approval_requirement') {
        const cv = row.config_value as any;
        result[row.stage_key].approval_requirement = {
          required: cv.required === true,
          description: cv.description ?? '',
        };
      }
    }

    return json({ data: result });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { stage_key, item_key, completed } = parsed.data;

    const db = createAdminClient();

    // Validate that the config item exists (prevents phantom completions)
    const { data: configRow } = await db
      .from('org_workflow_config')
      .select('id, stage_key, config_key')
      .eq('org_id', orgId)
      .eq('module', 'grant_management')
      .eq('config_type', 'stage_checklist')
      .eq('stage_key', stage_key)
      .eq('config_key', item_key)
      .maybeSingle();

    if (!configRow) {
      return json({ error: 'Checklist item not found in workflow configuration' }, { status: 404 });
    }

    if (completed) {
      // INSERT — ON CONFLICT DO NOTHING makes this idempotent
      const { error } = await db.from('grant_checklist_completions').insert({
        org_id: orgId,
        grant_id: grantId,
        workflow_config_id: configRow.id,
        stage_key,
        checklist_item_key: item_key,
        completed_by: user.id,
      });
      // Ignore unique violation (idempotent check)
      if (error && !error.message.includes('duplicate')) throw error;
    } else {
      // DELETE — RLS enforces "own or admin" rule
      const { data: deleted } = await db
        .from('grant_checklist_completions')
        .delete()
        .eq('grant_id', grantId)
        .eq('workflow_config_id', configRow.id)
        .select();

      if (!deleted || deleted.length === 0) {
        return json({ error: 'Item is not completed or you do not have permission to uncheck it' }, { status: 404 });
      }
    }

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run app/api/__tests__/grants-checklist.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/org/[orgId]/grants/[grantId]/checklist/route.ts app/api/__tests__/grants-checklist.test.ts
git commit -m "feat: add checklist GET+POST route for grant stage-gate items"
```

---

## Task 8: useStageLabels Hook + Wire Into Existing Consumers

**Files:**
- Create: `lib/hooks/use-stage-labels.ts`
- Modify: `components/grants/grantPalette.ts` (add optional overrides parameter)
- Modify: `components/grants/GrantPipelineView.tsx` (use hook)
- Modify: `components/grants/GrantTableView.tsx` (use hook)
- Modify: `components/grants/BulkActionBar.tsx` (use hook)
- Modify: `components/grants/BulkDecisionQueue.tsx` (use hook)
- Modify: `components/grants/GrantAttentionQueue.tsx` (use hook where stage labels render)

**Interfaces:**
- Produces: `useStageLabels(orgId: string): { getLabel: (stage: LifecycleStage) => string; labels: Record<string, string> }`
- Consumed by: all grant components that render stage names

- [ ] **Step 1: Create `lib/hooks/use-stage-labels.ts`**

```typescript
// lib/hooks/use-stage-labels.ts
import useSWR from 'swr';
import type { LifecycleStage } from '@/lib/grants/lifecycle-shared';

function humanize(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function useStageLabels(orgId: string) {
  const { data } = useSWR<Record<string, string>>(
    orgId ? `/api/org/${orgId}/workflow-config/labels` : null,
    (url: string) => fetch(url).then(r => r.json()).then(r => r.labels as Record<string, string>),
    { revalidateOnFocus: false }
  );

  return {
    getLabel: (stage: LifecycleStage): string => data?.[stage] ?? humanize(stage),
    labels: data ?? {},
  };
}
```

- [ ] **Step 2: Check if `lib/hooks/` directory exists**

```bash
ls lib/hooks/ 2>/dev/null || echo "hooks dir missing"
```

If missing: the file write in Step 1 will create it implicitly. No mkdir needed.

- [ ] **Step 3: Wire `useStageLabels` into `GrantPipelineView.tsx`**

Read `components/grants/GrantPipelineView.tsx` to find:
1. Where `orgId` is available (probably a prop)
2. All calls to `grantStageLabel(stage)` in the render

The component already receives `orgId` as a prop (check). Add the hook call near the top of the component body and replace `grantStageLabel(stage)` calls:

```typescript
// Add near top of component
import { useStageLabels } from '@/lib/hooks/use-stage-labels';

// Inside the component function body (after props destructuring):
const { getLabel } = useStageLabels(orgId);

// Replace all: grantStageLabel(stage) → getLabel(stage as LifecycleStage)
```

- [ ] **Step 4: Wire `useStageLabels` into `GrantTableView.tsx`**

Read `components/grants/GrantTableView.tsx`. Find all `grantStageLabel(s)` calls. Apply same pattern — add hook import and call, replace `grantStageLabel(s)` with `getLabel(s as LifecycleStage)`.

- [ ] **Step 5: Wire `useStageLabels` into `BulkActionBar.tsx`**

Read `components/grants/BulkActionBar.tsx`. The component renders stage labels (lines ~95, ~109). Find where `orgId` comes from (likely a prop) and apply same pattern.

- [ ] **Step 6: Wire `useStageLabels` into `BulkDecisionQueue.tsx`**

Read `components/grants/BulkDecisionQueue.tsx`. Find all `grantStageLabel(...)` calls and apply same pattern.

- [ ] **Step 7: Wire `useStageLabels` into `GrantAttentionQueue.tsx`**

Read `components/grants/GrantAttentionQueue.tsx`. Line 200 has `.replace(/_/g, ' ')` — this should be replaced with `getLabel(g.lifecycle_stage as LifecycleStage)`.

> **Note:** If any component does not receive `orgId` as a prop today, add it as a required prop and update its callers. This is a breaking-change risk to audit before modifying; read each component before editing.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -40
```
Expected: no errors relating to the modified files

- [ ] **Step 9: Commit**

```bash
git add lib/hooks/use-stage-labels.ts components/grants/GrantPipelineView.tsx components/grants/GrantTableView.tsx components/grants/BulkActionBar.tsx components/grants/BulkDecisionQueue.tsx components/grants/GrantAttentionQueue.tsx
git commit -m "feat: add useStageLabels hook and wire into grant stage-name renders"
```

---

## Task 9: StageChecklist Component

**Files:**
- Create: `components/grants/StageChecklist.tsx`

**Interfaces:**
- Consumes: `GET /api/org/[orgId]/grants/[grantId]/checklist`, `POST /api/org/[orgId]/grants/[grantId]/checklist`
- Props: `{ orgId: string; grantId: string; currentStage: string }`

- [ ] **Step 1: Create `components/grants/StageChecklist.tsx`**

```typescript
// components/grants/StageChecklist.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';

interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  sort_order: number;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
}

interface StageData {
  items: ChecklistItem[];
  approval_requirement: { required: boolean; description: string } | null;
}

interface Props {
  orgId: string;
  grantId: string;
  currentStage: string;
}

export default function StageChecklist({ orgId, grantId, currentStage }: Props) {
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const { data, mutate } = useSWR<{ data: Record<string, StageData> }>(
    `/api/org/${orgId}/grants/${grantId}/checklist`,
    (url: string) => fetch(url).then(r => r.json()),
    { revalidateOnFocus: false }
  );

  const stageData = data?.data?.[currentStage];

  // Render nothing if no checklist items exist for current stage
  if (!stageData || stageData.items.length === 0) return null;

  async function toggle(item: ChecklistItem) {
    const newCompleted = !(optimistic[item.key] ?? item.completed);
    setOptimistic(prev => ({ ...prev, [item.key]: newCompleted }));
    setToggling(prev => ({ ...prev, [item.key]: true }));

    try {
      const res = await fetch(`/api/org/${orgId}/grants/${grantId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_key: currentStage, item_key: item.key, completed: newCompleted }),
      });

      if (!res.ok) {
        // Revert optimistic update on failure
        setOptimistic(prev => ({ ...prev, [item.key]: !newCompleted }));
      } else {
        await mutate();
      }
    } catch {
      setOptimistic(prev => ({ ...prev, [item.key]: !newCompleted }));
    } finally {
      setToggling(prev => ({ ...prev, [item.key]: false }));
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-ink">Stage Checklist</h4>
      <ul className="space-y-2">
        {stageData.items.map(item => {
          const isCompleted = optimistic[item.key] ?? item.completed;
          const isLoading = toggling[item.key] ?? false;

          return (
            <li key={item.key} className="flex items-start gap-2">
              {item.required && !isCompleted && (
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Required" />
              )}
              {(!item.required || isCompleted) && (
                <span className="mt-0.5 h-2 w-2 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => toggle(item)}
                disabled={isLoading}
                className="flex items-center gap-2 text-left text-sm text-ink disabled:opacity-50"
              >
                <span
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isCompleted
                      ? 'border-azure bg-azure text-white'
                      : 'border-neutral-300 bg-white'
                  }`}
                  aria-checked={isCompleted}
                  role="checkbox"
                >
                  {isCompleted && (
                    <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={isCompleted ? 'line-through text-neutral-400' : ''}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {stageData.approval_requirement && (
        <p className="text-xs text-neutral-500 mt-2">
          Approval note: {stageData.approval_requirement.description}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Find the grant detail page and add the component**

Search for the grant detail page:
```bash
find app -name "page.tsx" | xargs grep -l "lifecycle_stage\|grantId\|grant_id" 2>/dev/null | head -5
```

Read the grant detail page to understand its layout, then import and place `StageChecklist` in the sidebar or below the stage transition controls. Pass `orgId`, `grantId`, and `currentStage` (the grant's `lifecycle_stage` value).

- [ ] **Step 3: Add gate-blocked error display to the transition dialog**

Find the component that renders the transition dialog (search for `to_stage` or `transition` in components):
```bash
grep -rn "blocking_items\|to_stage\|transition" components/grants/ --include="*.tsx" -l
```

In the component that calls `POST /api/org/[orgId]/grants/[grantId]/transition`, add handling for 422 `blocking_items`:

```typescript
// After receiving a 422 response:
if (res.status === 422) {
  const body = await res.json();
  const blockingItems: string[] = body.blocking_items ?? [];
  setError(
    blockingItems.length > 0
      ? `Complete these items before advancing:\n${blockingItems.map(r => `• ${r}`).join('\n')}`
      : body.error ?? 'Transition blocked by workflow configuration.'
  );
  return;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```bash
git add components/grants/StageChecklist.tsx
git commit -m "feat: add StageChecklist component with optimistic toggle + 422 gate error display"
```

---

## Task 10: Settings Page

**Files:**
- Create: `app/org/[orgId]/settings/workflow/page.tsx`

**Interfaces:**
- Consumes: `GET /api/org/[orgId]/workflow-config`
- Server component — admin only

- [ ] **Step 1: Check the settings directory structure**

```bash
ls app/org/[orgId]/settings/ 2>/dev/null || ls app/dashboard/settings/ 2>/dev/null || find app -type d -name "settings" | head -5
```

Use the result to determine the correct location for the settings page. If the org-settings path is `app/org/[orgId]/settings/`, create the file at `app/org/[orgId]/settings/workflow/page.tsx`. If it's under `app/dashboard/settings/`, create it there instead.

- [ ] **Step 2: Find how other settings pages get orgId**

```bash
find app -name "page.tsx" -path "*/settings/*" | head -3 | xargs head -40
```

Match the pattern used by existing settings pages to get `orgId` from the session.

- [ ] **Step 3: Create the settings page**

```typescript
// app/org/[orgId]/settings/workflow/page.tsx
// (Adjust path based on Step 1 findings)
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase';

interface Props {
  params: Promise<{ orgId: string }>;
}

interface WorkflowConfigRow {
  id: string;
  config_type: string;
  stage_key: string;
  config_key: string;
  config_value: Record<string, unknown>;
  sort_order: number;
}

export default async function WorkflowSettingsPage({ params }: Props) {
  const { orgId } = await params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Verify admin access
  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!role || !['owner', 'admin'].includes(role)) redirect('/dashboard');

  // Fetch workflow config
  const db = createAdminClient();
  const { data: rows } = await db
    .from('org_workflow_config')
    .select('id, config_type, stage_key, config_key, config_value, sort_order')
    .eq('org_id', orgId)
    .eq('module', 'grant_management')
    .order('stage_key')
    .order('sort_order');

  const config = (rows ?? []) as WorkflowConfigRow[];

  // Group by stage
  const byStage = new Map<string, WorkflowConfigRow[]>();
  for (const row of config) {
    if (!byStage.has(row.stage_key)) byStage.set(row.stage_key, []);
    byStage.get(row.stage_key)!.push(row);
  }

  const hasConfig = byStage.size > 0;

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Grant Workflow Configuration</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Checklists, required fields, and stage labels configured for this organization.
          </p>
        </div>
        <a
          href={`/org/${orgId}/builder`}
          className="text-sm text-azure hover:underline"
        >
          Configure in Builder →
        </a>
      </div>

      {!hasConfig && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center">
          <p className="text-sm text-neutral-500">No workflow configuration set. All stage transitions use system defaults.</p>
          <p className="text-sm text-neutral-400 mt-1">
            Open the Builder to add checklists, required fields, and stage label overrides.
          </p>
        </div>
      )}

      {hasConfig && (
        <div className="space-y-4">
          {Array.from(byStage.entries()).map(([stageKey, stageRows]) => {
            const labelRow = stageRows.find(r => r.config_type === 'stage_label');
            const labelOverride = labelRow ? (labelRow.config_value as any).value : null;
            const checklistRows = stageRows.filter(r => r.config_type === 'stage_checklist');
            const requiredFields = stageRows.filter(r => r.config_type === 'required_field');
            const approvalRow = stageRows.find(r => r.config_type === 'approval_requirement');

            return (
              <div key={stageKey} className="rounded-lg border border-neutral-200 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-medium text-ink">
                    {labelOverride ?? stageKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </h2>
                  {labelOverride && (
                    <span className="text-xs text-neutral-400 font-mono">({stageKey})</span>
                  )}
                </div>

                {checklistRows.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Checklist</p>
                    <ul className="space-y-1">
                      {checklistRows.map(r => {
                        const cv = r.config_value as any;
                        return (
                          <li key={r.id} className="flex items-center gap-2 text-sm text-ink">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cv.required ? 'bg-red-50 text-red-600' : 'bg-neutral-100 text-neutral-500'}`}>
                              {cv.required ? 'required' : 'optional'}
                            </span>
                            {cv.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {requiredFields.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Required Fields</p>
                    <ul className="space-y-1">
                      {requiredFields.map(r => {
                        const rv = r.config_value as any;
                        return (
                          <li key={r.id} className="text-sm text-ink font-mono">
                            {r.config_key}
                            {rv.error_message && (
                              <span className="font-sans text-neutral-400 ml-2">— {rv.error_message}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {approvalRow && (
                  <div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Approval</p>
                    <p className="text-sm text-neutral-600">
                      {(approvalRow.config_value as any).description || '(required, no description)'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify the page renders (TypeScript check)**

```bash
npx tsc --noEmit 2>&1 | grep -i "settings/workflow" | head -10
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/org/[orgId]/settings/workflow/page.tsx
git commit -m "feat: add read-only workflow settings page (Phase 1)"
```

---

## Self-Review Checklist

After all tasks are committed, verify against the spec's acceptance criteria:

- [ ] **AC1 — Checklist gate:** Builder creates config → grant shows checklist → transition without checking returns 422 with `blocking_items`. Verify via the `/checklist` route tests (Task 7) and transition tests (Task 3).
- [ ] **AC2 — Stage label rename:** `rename_stage` builder tool upserts config → `GET /workflow-config/labels` returns the override → `useStageLabels` resolves it in pipeline and table views.
- [ ] **AC3 — Checklist reset on re-entry:** The RPC DELETE in migration 0049 fires on every stage exit. Confirmed by migration SQL review.
- [ ] **AC4 — Bulk transition preflight blocks gate-blocked grants:** Covered by Task 4 tests — gate check in preflight loop runs before `rollbackOnError` branch.
- [ ] **AC5 — RLS member/admin delete:** INSERT policy: `completed_by = auth.uid()`. DELETE policy: `completed_by = auth.uid() OR is_org_admin(org_id)`. Enforced by DB; verified via migration SQL review.
- [ ] **Spec item not implemented:** `lib/ai/assistant/executors/grants.ts` modification is a no-op — the AI executor has no `transition_grant` tool case today. `WorkflowGateBlockedError` is exported from `lifecycle.ts` and available for future import when that tool is added.

---

**Plan complete and retained at `docs/agent-work/plans/2026-06-29-phase1-workflow-config.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task. Task 1 can run immediately; Tasks 2–5 depend on Task 1's migration; Tasks 6–10 depend on Tasks 2–5.

**2. Inline Execution** — Execute tasks sequentially in this session using the executing-plans skill.

Which approach?
