# Task Automation Producers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the task automation producer layer that proactively creates, updates, and resolves canonical `tasks` across compliance deadlines, pledge installments, grant obligations, and import review — all driven by a single job route with secret auth and run logging.

**Architecture:** A shared `task-writer.ts` handles idempotent upsert/complete/cancel using the Supabase admin client; five producer modules query source tables and call the writer; `POST /api/jobs/tasks/generate` dispatches producers with `CRON_SECRET` auth, dry-run support, concurrent-run protection, and run logging in `task_automation_runs`; source mutation routes call the writer as side effects when obligations are resolved.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase JS admin client, Vitest contract tests.

---

## File Map

**Create:**
- `db/migrations/0042_task_automation_runs.sql` — run log table + `try_task_automation_lock` RPC
- `lib/tasks/automation/types.ts` — `TASK_ENTITY_TYPES`, `TaskProducerResult`, `UpsertGeneratedTaskInput`, `ProducerOptions`
- `lib/tasks/automation/task-writer.ts` — `upsertGeneratedTask`, `completeGeneratedTasks`, `cancelGeneratedTasks`
- `lib/tasks/automation/run.ts` — producer registry, `runProducers`
- `lib/tasks/automation/producers/compliance.ts` — `complianceDeadlinesProducer`
- `lib/tasks/automation/producers/pledges.ts` — `pledgeFollowUpProducer`
- `lib/tasks/automation/producers/grants.ts` — `grantObligationsProducer`
- `lib/tasks/automation/producers/imports.ts` — `importReviewProducer`
- `lib/tasks/automation/producers/reports.ts` — stub returning empty result
- `app/api/jobs/tasks/generate/route.ts` — POST handler
- `app/api/jobs/tasks/runs/route.ts` — GET handler
- `lib/tasks/automation/__tests__/task-writer.test.ts` — unit tests
- `lib/tasks/automation/__tests__/producers.pledge.test.ts`
- `lib/tasks/automation/__tests__/producers.compliance.test.ts`
- `lib/tasks/automation/__tests__/producers.grants.test.ts`
- `lib/tasks/automation/__tests__/producers.imports.test.ts`
- `lib/__tests__/task-automation-contract.test.ts` — contract tests

**Modify:**
- `app/api/org/[orgId]/tasks/[taskId]/complete/route.ts` — add grant milestone reverse sync
- `app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts` — add task hooks
- `app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts` — add task cancel hooks
- `app/api/org/[orgId]/compliance/filing-calendar/route.ts` — add task hooks on PATCH

---

## Codebase Invariants (read before writing any code)

- Admin client: `import { createAdminClient } from '@/lib/supabase'` — use this in all producer and writer code. Never use `createServerClient()` in producers.
- `CRON_SECRET` lives in `process.env.CRON_SECRET`. Check with `req.headers.get('x-job-secret') === process.env.CRON_SECRET`.
- `task_entity_links` has **no unique constraint** — always check for existing link before inserting.
- `organization_members` role column is `role` (type `member_role_enum`), not `member_role`.
- `grant_milestones` and `grant_payments` have no `org_id` column — join via `grant_details → holdings.org_id`.
- Filing `reminder_days` is `int[]` (e.g., `[30, 14, 7]`). Treat its maximum value as the earliest reminder window.
- `import_status_enum`: `'pending', 'processing', 'needs_review', 'approved', 'rejected', 'completed', 'failed'`
- All task status values: `'open', 'in_progress', 'blocked', 'waiting', 'completed', 'cancelled'`
- All task priority values: `'low', 'normal', 'high', 'urgent'`
- All task type values: `'task', 'approval', 'reminder', 'follow_up', 'review', 'checklist_step'`
- All task source values: `'manual', 'system', 'automation', 'ai', 'template'`
- All task event types: `'created', 'assigned', 'status_changed', 'due_date_changed', 'commented', 'completed', 'cancelled', 'linked', 'notification_sent'`

---

## Task 1: DB Migration + Automation Types

**Files:**
- Create: `db/migrations/0042_task_automation_runs.sql`
- Create: `lib/tasks/automation/types.ts`

- [ ] **Step 1: Write the migration**

```sql
-- db/migrations/0042_task_automation_runs.sql
-- Task automation run log and advisory lock helper.
-- Depends on: 0001, 0002, 0041
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.task_automation_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  producer        text,
  org_id          uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  dry_run         boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'failed')),
  scanned         int NOT NULL DEFAULT 0,
  created_count   int NOT NULL DEFAULT 0,
  updated_count   int NOT NULL DEFAULT 0,
  completed_count int NOT NULL DEFAULT 0,
  skipped_count   int NOT NULL DEFAULT 0,
  error_count     int NOT NULL DEFAULT 0,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_task_automation_runs_created
  ON public.task_automation_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_automation_runs_producer_org_running
  ON public.task_automation_runs (producer, org_id, created_at DESC)
  WHERE status = 'running';

ALTER TABLE public.task_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_automation_runs: org admins read"
  ON public.task_automation_runs FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_admin(org_id));

CREATE POLICY "task_automation_runs: service role"
  ON public.task_automation_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.task_automation_runs TO authenticated;
GRANT ALL    ON public.task_automation_runs TO service_role;

-- Advisory lock helper. Note: pg_try_advisory_xact_lock is transaction-scoped;
-- in Supabase's pooled connections each RPC call is its own transaction, so this
-- releases immediately. Use task_automation_runs status check as the primary
-- concurrency gate; this function is an additional best-effort signal.
CREATE OR REPLACE FUNCTION public.try_task_automation_lock(lock_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_try_advisory_xact_lock(hashtext(lock_key)::bigint);
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_task_automation_lock(text) TO service_role;
```

- [ ] **Step 2: Create types file**

```typescript
// lib/tasks/automation/types.ts

export const TASK_ENTITY_TYPES = [
  'filing',
  'state_registration',
  'pledge_installment',
  'pledge',
  'donor',
  'grant_milestone',
  'grant_report',
  'grant_payment',
  'grant',
  'holding',
  'portfolio',
  'import_job',
  'workflow_instance',
] as const;

export type TaskEntityType = typeof TASK_ENTITY_TYPES[number];

export type TaskProducerResult = {
  producer: string;
  orgId?: string;
  scanned: number;
  created: number;
  updated: number;
  completed: number;
  skipped: number;
  errors: Array<{ sourceType: string; sourceId: string; message: string }>;
};

export type TaskLink = {
  entityType: TaskEntityType;
  entityId: string;
  relationship?: 'primary' | 'context';
};

export type UpsertGeneratedTaskInput = {
  orgId: string;
  portfolioId?: string | null;
  sourceKey: string;
  title: string;
  description: string;
  taskType: 'reminder' | 'follow_up' | 'review' | 'approval';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueAt?: string | null;
  assignedTo?: string | null;
  metadata: {
    producer: string;
    reason: string;
    source_status: string;
    escalation_state?: string;
    generated_at: string;
    [key: string]: unknown;
  };
  links: TaskLink[];
  reopenResolved?: boolean;
};

export type ProducerOptions = {
  orgId?: string;
  sourceType?: string;
  sourceId?: string;
  dryRun?: boolean;
  now?: Date;
};

export type Producer = {
  id: string;
  run: (options: ProducerOptions) => Promise<TaskProducerResult[]>;
};
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | grep "automation/types" || echo "types.ts OK"
```

Expected: no errors from `types.ts`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0042_task_automation_runs.sql lib/tasks/automation/types.ts
git commit -m "feat: task automation run log migration and shared types"
```

---

## Task 2: Task Writer

**Files:**
- Create: `lib/tasks/automation/task-writer.ts`
- Create: `lib/tasks/automation/__tests__/task-writer.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/tasks/automation/__tests__/task-writer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal Supabase mock builder
function makeDb(overrides: Record<string, unknown> = {}) {
  const store: Record<string, unknown[]> = { tasks: [], task_entity_links: [], task_events: [] };

  const chainable = (tableName: string, rows: unknown[]) => {
    let filtered = [...rows];
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((col: string, val: unknown) => {
        filtered = filtered.filter((r: any) => r[col] === val);
        return chain;
      }),
      in: vi.fn((col: string, vals: unknown[]) => {
        filtered = filtered.filter((r: any) => vals.includes(r[col]));
        return chain;
      }),
      is: vi.fn((col: string, val: unknown) => {
        filtered = filtered.filter((r: any) => val === null ? r[col] == null : r[col] === val);
        return chain;
      }),
      like: vi.fn((col: string, pat: string) => {
        const prefix = pat.replace('%', '');
        filtered = filtered.filter((r: any) => String(r[col]).startsWith(prefix));
        return chain;
      }),
      maybeSingle: vi.fn(async () => ({ data: filtered[0] ?? null, error: null })),
      single: vi.fn(async () => ({ data: filtered[0] ?? null, error: null })),
      then: undefined,
    };
    return chain;
  };

  let lastInserted: unknown = null;

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockImplementation(() => chainable(table, store[table] ?? [])),
      insert: vi.fn(async (row: unknown) => {
        const r = Array.isArray(row) ? row : [row];
        r.forEach((item: any) => {
          item.id = item.id ?? crypto.randomUUID();
          (store[table] = store[table] ?? []).push(item);
        });
        lastInserted = r[0];
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: lastInserted, error: null })),
          error: null,
        };
      }),
      update: vi.fn(async (patch: unknown) => ({
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: { ...((store[table] ?? [])[0] as object), ...(patch as object) }, error: null })),
        error: null,
      })),
      upsert: vi.fn(async () => ({ error: null })),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      single: vi.fn(async () => ({ data: null, error: null })),
    })),
    _store: store,
    ...overrides,
  } as any;
}

import {
  upsertGeneratedTask,
  completeGeneratedTasks,
  cancelGeneratedTasks,
} from '../task-writer';
import { UpsertGeneratedTaskInput } from '../types';

const baseInput: UpsertGeneratedTaskInput = {
  orgId: 'org-1',
  sourceKey: 'pledge_installment:inst-1:due_soon',
  title: 'Follow up on installment',
  description: 'Installment of $500 is due in 5 days',
  taskType: 'follow_up',
  priority: 'normal',
  dueAt: '2026-05-20T09:00:00.000Z',
  assignedTo: null,
  metadata: {
    producer: 'pledge_follow_up',
    reason: 'Installment due in 5 days',
    source_status: 'pending',
    generated_at: '2026-05-15T12:00:00.000Z',
  },
  links: [
    { entityType: 'pledge_installment', entityId: 'inst-1', relationship: 'primary' },
    { entityType: 'pledge', entityId: 'pledge-1', relationship: 'context' },
  ],
};

describe('upsertGeneratedTask', () => {
  it('creates a new task when none exists', async () => {
    const db = makeDb();
    const result = await upsertGeneratedTask(db, baseInput);
    expect(result).toBe('created');
    expect(db.from).toHaveBeenCalledWith('tasks');
    expect(db.from).toHaveBeenCalledWith('task_entity_links');
    expect(db.from).toHaveBeenCalledWith('task_events');
  });

  it('returns skipped when existing task is completed and reopenResolved is false', async () => {
    const db = makeDb();
    // Pre-seed a completed task
    const existingTask = {
      id: 'task-1',
      org_id: 'org-1',
      source_key: baseInput.sourceKey,
      status: 'completed',
      deleted_at: null,
      metadata: {},
    };
    db._store.tasks = [existingTask];
    // Override select to return the existing task
    db.from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: existingTask, error: null })),
          insert: vi.fn(async () => ({ select: vi.fn().mockReturnThis(), single: vi.fn(async () => ({ data: existingTask, error: null })), error: null })),
          update: vi.fn(async () => ({ eq: vi.fn().mockReturnThis(), error: null })),
          upsert: vi.fn(async () => ({ error: null })),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: null, error: null })), insert: vi.fn(async () => ({ error: null })), update: vi.fn(async () => ({ eq: vi.fn().mockReturnThis(), error: null })), upsert: vi.fn(async () => ({ error: null })) };
    }) as any;

    const result = await upsertGeneratedTask(db, { ...baseInput, reopenResolved: false });
    expect(result).toBe('skipped');
  });

  it('returns updated when open task already exists', async () => {
    const existingTask = {
      id: 'task-1',
      org_id: 'org-1',
      source_key: baseInput.sourceKey,
      status: 'open',
      deleted_at: null,
      title: 'Old title',
      description: 'Old desc',
      priority: 'low',
      due_at: null,
      assigned_to: null,
      metadata: { producer: 'pledge_follow_up' },
    };
    const db = makeDb();
    db.from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: existingTask, error: null })),
          update: vi.fn(async () => ({ eq: vi.fn().mockReturnThis(), error: null })),
          upsert: vi.fn(async () => ({ error: null })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        insert: vi.fn(async () => ({ error: null })),
        upsert: vi.fn(async () => ({ error: null })),
      };
    }) as any;

    const result = await upsertGeneratedTask(db, { ...baseInput, priority: 'high' });
    expect(result).toBe('updated');
  });
});

describe('completeGeneratedTasks', () => {
  it('completes open automation tasks matching the source key', async () => {
    const db = makeDb();
    const result = await completeGeneratedTasks(db, 'org-1', 'pledge_installment:inst-1:due_soon', 'Installment paid');
    expect(result).toBe(0); // no tasks in store
  });

  it('throws when prefix has fewer than 2 colons', async () => {
    const db = makeDb();
    await expect(
      completeGeneratedTasks(db, 'org-1', 'pledge_installment:', 'reason')
    ).rejects.toThrow('at least 2 colons');
  });

  it('accepts prefix with 2+ colons', async () => {
    const db = makeDb();
    // Should not throw
    await completeGeneratedTasks(db, 'org-1', 'pledge_installment:inst-1:', 'reason');
  });
});

describe('cancelGeneratedTasks', () => {
  it('throws when prefix has fewer than 2 colons', async () => {
    const db = makeDb();
    await expect(
      cancelGeneratedTasks(db, 'org-1', 'filing:', 'waived')
    ).rejects.toThrow('at least 2 colons');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/tasks/automation/__tests__/task-writer.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../task-writer'`

- [ ] **Step 3: Write the task writer**

```typescript
// lib/tasks/automation/task-writer.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { UpsertGeneratedTaskInput, TaskLink } from './types';

export type UpsertResult = 'created' | 'updated' | 'skipped';

export async function upsertGeneratedTask(
  db: SupabaseClient,
  input: UpsertGeneratedTaskInput
): Promise<UpsertResult> {
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from('tasks')
    .select('id, status, title, description, priority, due_at, assigned_to, metadata')
    .eq('org_id', input.orgId)
    .eq('source_key', input.sourceKey)
    .is('deleted_at', null)
    .maybeSingle();

  if (!existing) {
    const { data: task, error } = await db
      .from('tasks')
      .insert({
        org_id: input.orgId,
        portfolio_id: input.portfolioId ?? null,
        title: input.title,
        description: input.description,
        status: 'open',
        priority: input.priority,
        task_type: input.taskType,
        source: 'automation',
        source_key: input.sourceKey,
        due_at: input.dueAt ?? null,
        assigned_to: input.assignedTo ?? null,
        metadata: { ...input.metadata, generated_at: now },
      })
      .select('id')
      .single();

    if (error || !task) throw error ?? new Error('Task insert returned no data');

    if (input.links.length > 0) {
      await db.from('task_entity_links').insert(
        input.links.map((l) => ({
          task_id: task.id,
          org_id: input.orgId,
          entity_type: l.entityType,
          entity_id: l.entityId,
          relationship: l.relationship ?? 'primary',
        }))
      );
    }

    await db.from('task_events').insert({
      task_id: task.id,
      org_id: input.orgId,
      event_type: 'created',
      after_values: { source_key: input.sourceKey, producer: input.metadata.producer },
    });

    return 'created';
  }

  if (['completed', 'cancelled'].includes(existing.status) && !input.reopenResolved) {
    return 'skipped';
  }

  const patch: Record<string, unknown> = {
    updated_at: now,
    metadata: { ...((existing.metadata as Record<string, unknown>) ?? {}), ...input.metadata, generated_at: now },
  };
  const events: Array<{ event_type: string; before_values: unknown; after_values: unknown }> = [];

  if (existing.title !== input.title) patch.title = input.title;
  if (existing.description !== input.description) patch.description = input.description;

  if (existing.priority !== input.priority) {
    events.push({ event_type: 'status_changed', before_values: { priority: existing.priority }, after_values: { priority: input.priority } });
    patch.priority = input.priority;
  }
  if ((existing.due_at ?? null) !== (input.dueAt ?? null)) {
    events.push({ event_type: 'due_date_changed', before_values: { due_at: existing.due_at }, after_values: { due_at: input.dueAt ?? null } });
    patch.due_at = input.dueAt ?? null;
  }
  if ((existing.assigned_to ?? null) !== (input.assignedTo ?? null)) {
    events.push({ event_type: 'assigned', before_values: { assigned_to: existing.assigned_to }, after_values: { assigned_to: input.assignedTo ?? null } });
    patch.assigned_to = input.assignedTo ?? null;
  }

  await db.from('tasks').update(patch).eq('id', existing.id);

  if (events.length > 0) {
    await db.from('task_events').insert(
      events.map((e) => ({ task_id: existing.id, org_id: input.orgId, ...e }))
    );
  }

  // Ensure all links exist (no unique constraint on task_entity_links, check first)
  for (const link of input.links) {
    const { data: existingLink } = await db
      .from('task_entity_links')
      .select('id')
      .eq('task_id', existing.id)
      .eq('entity_type', link.entityType)
      .eq('entity_id', link.entityId)
      .maybeSingle();

    if (!existingLink) {
      await db.from('task_entity_links').insert({
        task_id: existing.id,
        org_id: input.orgId,
        entity_type: link.entityType,
        entity_id: link.entityId,
        relationship: link.relationship ?? 'primary',
      });
    }
  }

  return 'updated';
}

function assertPrefixSafe(prefix: string) {
  const colonCount = (prefix.match(/:/g) ?? []).length;
  if (colonCount < 2) {
    throw new Error(
      `Source key prefix must contain at least 2 colons to be scoped to a single source record. Got: "${prefix}"`
    );
  }
}

export async function completeGeneratedTasks(
  db: SupabaseClient,
  orgId: string,
  sourceKey: string,
  reason: string,
  actorId: string | null = null
): Promise<number> {
  const isPrefix = sourceKey.endsWith(':');
  if (isPrefix) assertPrefixSafe(sourceKey);

  let query = db
    .from('tasks')
    .select('id, metadata')
    .eq('org_id', orgId)
    .eq('source', 'automation')
    .in('status', ['open', 'in_progress', 'blocked', 'waiting'])
    .is('deleted_at', null);

  const { data: tasks } = isPrefix
    ? await (query as any).like('source_key', `${sourceKey}%`)
    : await query.eq('source_key', sourceKey);

  if (!tasks || tasks.length === 0) return 0;

  const now = new Date().toISOString();

  for (const t of tasks) {
    const existingMeta = (t.metadata as Record<string, unknown>) ?? {};
    await db
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: now,
        updated_at: now,
        metadata: { ...existingMeta, completed_by_automation: true, completion_reason: reason },
      })
      .eq('id', t.id);
  }

  await db.from('task_events').insert(
    tasks.map((t: { id: string }) => ({
      task_id: t.id,
      org_id: orgId,
      actor_id: actorId,
      event_type: 'completed',
      after_values: { reason, completed_by_automation: true },
    }))
  );

  return tasks.length;
}

export async function cancelGeneratedTasks(
  db: SupabaseClient,
  orgId: string,
  sourceKey: string,
  cancelReason: string,
  actorId: string | null = null
): Promise<number> {
  const isPrefix = sourceKey.endsWith(':');
  if (isPrefix) assertPrefixSafe(sourceKey);

  let query = db
    .from('tasks')
    .select('id, metadata')
    .eq('org_id', orgId)
    .eq('source', 'automation')
    .in('status', ['open', 'in_progress', 'blocked', 'waiting'])
    .is('deleted_at', null);

  const { data: tasks } = isPrefix
    ? await (query as any).like('source_key', `${sourceKey}%`)
    : await query.eq('source_key', sourceKey);

  if (!tasks || tasks.length === 0) return 0;

  const now = new Date().toISOString();

  for (const t of tasks) {
    const existingMeta = (t.metadata as Record<string, unknown>) ?? {};
    await db
      .from('tasks')
      .update({
        status: 'cancelled',
        updated_at: now,
        metadata: { ...existingMeta, cancel_reason: cancelReason },
      })
      .eq('id', t.id);
  }

  await db.from('task_events').insert(
    tasks.map((t: { id: string }) => ({
      task_id: t.id,
      org_id: orgId,
      actor_id: actorId,
      event_type: 'cancelled',
      after_values: { cancel_reason: cancelReason },
    }))
  );

  return tasks.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/tasks/automation/__tests__/task-writer.test.ts 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/automation/task-writer.ts lib/tasks/automation/__tests__/task-writer.test.ts
git commit -m "feat: shared task writer with upsert, complete, and cancel helpers"
```

---

## Task 3: Producer Run Registry + Job Route

**Files:**
- Create: `lib/tasks/automation/run.ts`
- Create: `app/api/jobs/tasks/generate/route.ts`
- Create: `app/api/jobs/tasks/runs/route.ts`
- Create: `app/api/jobs/tasks/__tests__/generate.test.ts`

- [ ] **Step 1: Write failing tests for the job route**

```typescript
// app/api/jobs/tasks/__tests__/generate.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync('app/api/jobs/tasks/generate/route.ts', 'utf8');
const runSrc = readFileSync('lib/tasks/automation/run.ts', 'utf8');

describe('generate route contract', () => {
  it('checks x-job-secret header', () => {
    expect(src).toContain('x-job-secret');
    expect(src).toContain('CRON_SECRET');
  });

  it('supports dry_run flag', () => {
    expect(src).toContain('dry_run');
  });

  it('logs run to task_automation_runs', () => {
    expect(src).toContain('task_automation_runs');
  });

  it('checks for in-flight runs before starting', () => {
    expect(src).toContain('status');
    expect(src).toContain('running');
  });

  it('run.ts exports runProducers and PRODUCERS', () => {
    expect(runSrc).toContain('runProducers');
    expect(runSrc).toContain('PRODUCERS');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run app/api/jobs/tasks/__tests__/generate.test.ts 2>&1 | tail -10
```

Expected: FAIL — files not found.

- [ ] **Step 3: Create the run registry**

```typescript
// lib/tasks/automation/run.ts
import { Producer, ProducerOptions, TaskProducerResult } from './types';
import { complianceDeadlinesProducer } from './producers/compliance';
import { pledgeFollowUpProducer } from './producers/pledges';
import { grantObligationsProducer } from './producers/grants';
import { importReviewProducer } from './producers/imports';
import { reportApprovalsProducer } from './producers/reports';

export const PRODUCERS: Producer[] = [
  { id: 'compliance_deadlines', run: complianceDeadlinesProducer },
  { id: 'pledge_follow_up',     run: pledgeFollowUpProducer },
  { id: 'grant_obligations',    run: grantObligationsProducer },
  { id: 'import_review',        run: importReviewProducer },
  { id: 'report_approvals',     run: reportApprovalsProducer },
];

export const PRODUCER_IDS = PRODUCERS.map((p) => p.id);

export async function runProducers(
  options: ProducerOptions & { producerId?: string }
): Promise<TaskProducerResult[]> {
  const targets = options.producerId
    ? PRODUCERS.filter((p) => p.id === options.producerId)
    : PRODUCERS;

  const results: TaskProducerResult[] = [];

  for (const producer of targets) {
    try {
      const producerResults = await producer.run(options);
      results.push(...producerResults);
    } catch (err) {
      results.push({
        producer: producer.id,
        orgId: options.orgId,
        scanned: 0,
        created: 0,
        updated: 0,
        completed: 0,
        skipped: 0,
        errors: [{ sourceType: 'producer', sourceId: producer.id, message: String(err) }],
      });
    }
  }

  return results;
}
```

- [ ] **Step 4: Create the generate route**

```typescript
// app/api/jobs/tasks/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { runProducers, PRODUCER_IDS } from '@/lib/tasks/automation/run';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth
  const secret = req.headers.get('x-job-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    producer?: string;
    org_id?: string;
    source_type?: string;
    source_id?: string;
    dry_run?: boolean;
    now?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { producer, org_id, source_type, source_id, dry_run = false, now: nowStr } = body;

  if (producer && !PRODUCER_IDS.includes(producer)) {
    return NextResponse.json({ error: `Unknown producer: ${producer}. Valid: ${PRODUCER_IDS.join(', ')}` }, { status: 400 });
  }

  const now = nowStr ? new Date(nowStr) : new Date();
  const db = createAdminClient();
  const runId = crypto.randomUUID();

  // Concurrent run check
  const lockKey = `task_automation:${producer ?? 'all'}:${org_id ?? 'all'}`;
  const { data: lockAcquired } = await db.rpc('try_task_automation_lock', { lock_key: lockKey });

  const { data: inflight } = await db
    .from('task_automation_runs')
    .select('id')
    .eq('status', 'running')
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .maybeSingle();

  // Apply producer/org filter if provided
  let inflightQuery = db
    .from('task_automation_runs')
    .select('id')
    .eq('status', 'running')
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
  if (producer) inflightQuery = inflightQuery.eq('producer', producer);
  if (org_id) inflightQuery = inflightQuery.eq('org_id', org_id);
  const { data: inflightRun } = await inflightQuery.maybeSingle();

  if (inflightRun) {
    return NextResponse.json({ error: 'Concurrent run in progress', run_id: inflightRun.id }, { status: 409 });
  }

  if (!dry_run) {
    await db.from('task_automation_runs').insert({
      id: runId,
      producer: producer ?? null,
      org_id: org_id ?? null,
      dry_run: false,
      status: 'running',
    });
  }

  try {
    const results = await runProducers({
      producerId: producer,
      orgId: org_id,
      sourceType: source_type,
      sourceId: source_id,
      dryRun: dry_run,
      now,
    });

    const totals = results.reduce(
      (acc, r) => ({
        scanned: acc.scanned + r.scanned,
        created: acc.created + r.created,
        updated: acc.updated + r.updated,
        completed: acc.completed + r.completed,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors.length,
      }),
      { scanned: 0, created: 0, updated: 0, completed: 0, skipped: 0, errors: 0 }
    );

    if (!dry_run) {
      await db.from('task_automation_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        scanned: totals.scanned,
        created_count: totals.created,
        updated_count: totals.updated,
        completed_count: totals.completed,
        skipped_count: totals.skipped,
        error_count: totals.errors,
        metadata: { results },
      }).eq('id', runId);
    }

    return NextResponse.json({ ok: true, run_id: runId, results });
  } catch (err: any) {
    if (!dry_run) {
      await db.from('task_automation_runs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        metadata: { error: err.message },
      }).eq('id', runId);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Create the runs GET route**

```typescript
// app/api/jobs/tasks/runs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const producer = searchParams.get('producer');
  const orgId = searchParams.get('org_id');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  // Allow CRON_SECRET header OR org admin session when filtering by specific org
  const secret = req.headers.get('x-job-secret');
  const isJobSecret = process.env.CRON_SECRET && secret === process.env.CRON_SECRET;

  if (!isJobSecret) {
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const db = createAdminClient();
  let query = db
    .from('task_automation_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (producer) query = query.eq('producer', producer);
  if (orgId) query = query.eq('org_id', orgId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ runs: data ?? [] });
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run app/api/jobs/tasks/__tests__/generate.test.ts 2>&1 | tail -15
```

Expected: all tests pass (note: producer stubs will be empty results for now; tests will confirm after producers are added in later tasks).

- [ ] **Step 7: Commit**

```bash
git add lib/tasks/automation/run.ts \
        app/api/jobs/tasks/generate/route.ts \
        app/api/jobs/tasks/runs/route.ts \
        app/api/jobs/tasks/__tests__/generate.test.ts
git commit -m "feat: task automation job route with run logging and concurrent-run protection"
```

Note: at this step, the 5 producer imports in `run.ts` will require stub files to exist. Create them as part of this task (see Step 3 note below). Each stub returns `[]`.

**Stub template for producers not yet implemented:**
```typescript
// lib/tasks/automation/producers/reports.ts (and any not-yet-implemented producer)
import { ProducerOptions, TaskProducerResult } from '../types';
export async function reportApprovalsProducer(_options: ProducerOptions): Promise<TaskProducerResult[]> {
  return [];
}
```
Create all 5 stub files before this task's commit. Tasks 4-8 will replace stubs with real implementations.

---

## Task 4: Pledge Producer + Source Hooks

**Files:**
- Create: `lib/tasks/automation/producers/pledges.ts`
- Create: `lib/tasks/automation/__tests__/producers.pledge.test.ts`
- Modify: `app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts`
- Modify: `app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts`

- [ ] **Step 1: Write failing producer tests**

```typescript
// lib/tasks/automation/__tests__/producers.pledge.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync('lib/tasks/automation/producers/pledges.ts', 'utf8');
const installmentSrc = readFileSync(
  'app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts',
  'utf8'
);
const cancelSrc = readFileSync(
  'app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts',
  'utf8'
);

describe('pledge producer contract', () => {
  it('uses pledge_installment entity type from TASK_ENTITY_TYPES', () => {
    expect(src).toContain('pledge_installment');
    expect(src).toContain('TASK_ENTITY_TYPES');
  });

  it('uses source key pledge_installment:{id}:due_soon pattern', () => {
    expect(src).toMatch(/pledge_installment.*due_soon/);
  });

  it('uses source key pledge_installment:{id}:overdue pattern', () => {
    expect(src).toMatch(/pledge_installment.*overdue/);
  });

  it('queries pledges and pledge_installments tables', () => {
    expect(src).toContain("'pledges'");
    expect(src).toContain("'pledge_installments'");
  });

  it('assigns to relationship_manager when present', () => {
    expect(src).toContain('relationship_manager');
  });

  it('installment route hooks completeGeneratedTasks on paid', () => {
    expect(installmentSrc).toContain('completeGeneratedTasks');
    expect(installmentSrc).toContain('paid');
  });

  it('installment route hooks cancelGeneratedTasks on waived/written_off', () => {
    expect(installmentSrc).toContain('cancelGeneratedTasks');
  });

  it('cancel route hooks cancelGeneratedTasks', () => {
    expect(cancelSrc).toContain('cancelGeneratedTasks');
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run lib/tasks/automation/__tests__/producers.pledge.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement the pledge producer**

Replace the stub at `lib/tasks/automation/producers/pledges.ts`:

```typescript
// lib/tasks/automation/producers/pledges.ts
import { createAdminClient } from '@/lib/supabase';
import { upsertGeneratedTask, completeGeneratedTasks, cancelGeneratedTasks } from '../task-writer';
import { ProducerOptions, TaskProducerResult, TASK_ENTITY_TYPES } from '../types';

type InstallmentRow = {
  id: string;
  org_id: string;
  pledge_id: string;
  due_date: string;
  amount: number;
  status: string;
  pledge: {
    id: string;
    org_id: string;
    status: string;
    relationship_manager: string | null;
    campaign: string | null;
    fund_designation: string | null;
    donor_id: string;
    deleted_at: string | null;
  } | null;
  donor: { id: string; display_name?: string } | null;
};

function escalationState(daysOverdue: number): string {
  if (daysOverdue >= 30) return 'overdue_30';
  if (daysOverdue >= 7) return 'overdue_7';
  return 'overdue_1';
}

function overduePriority(daysOverdue: number): 'high' | 'urgent' {
  return daysOverdue >= 7 ? 'urgent' : 'high';
}

async function validateAssignee(db: ReturnType<typeof createAdminClient>, orgId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await db
    .from('organization_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ? userId : null;
}

export async function pledgeFollowUpProducer(options: ProducerOptions): Promise<TaskProducerResult[]> {
  const db = createAdminClient();
  const now = options.now ?? new Date();
  const nowStr = now.toISOString();
  const result: TaskProducerResult = {
    producer: 'pledge_follow_up',
    orgId: options.orgId,
    scanned: 0,
    created: 0,
    updated: 0,
    completed: 0,
    skipped: 0,
    errors: [],
  };

  if (options.dryRun) return [{ ...result }];

  // Upcoming: due in next 14 days
  const dueSoonCutoff = new Date(now);
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 14);

  let upcomingQuery = db
    .from('pledge_installments')
    .select(`
      id, org_id, pledge_id, due_date, amount, status,
      pledge:pledges!inner(id, org_id, status, relationship_manager, campaign, fund_designation, donor_id, deleted_at)
    `)
    .eq('status', 'pending')
    .gte('due_date', now.toISOString().slice(0, 10))
    .lte('due_date', dueSoonCutoff.toISOString().slice(0, 10));

  if (options.orgId) upcomingQuery = upcomingQuery.eq('org_id', options.orgId);
  if (options.sourceId) upcomingQuery = upcomingQuery.eq('id', options.sourceId);

  const { data: upcoming, error: upcomingErr } = await upcomingQuery;
  if (upcomingErr) {
    result.errors.push({ sourceType: 'pledge_installment', sourceId: 'query', message: upcomingErr.message });
    return [result];
  }

  for (const inst of (upcoming ?? []) as InstallmentRow[]) {
    result.scanned++;
    const pledge = inst.pledge;
    if (!pledge || pledge.status !== 'active' || pledge.deleted_at) { result.skipped++; continue; }

    try {
      const assignedTo = await validateAssignee(db, inst.org_id, pledge.relationship_manager);
      const dueAt = `${inst.due_date}T09:00:00.000Z`;
      const description = [
        `Installment of $${Number(inst.amount).toLocaleString()} due on ${inst.due_date}.`,
        pledge.campaign ? `Campaign: ${pledge.campaign}.` : null,
        pledge.fund_designation ? `Fund: ${pledge.fund_designation}.` : null,
      ].filter(Boolean).join(' ');

      const r = await upsertGeneratedTask(db, {
        orgId: inst.org_id,
        sourceKey: `pledge_installment:${inst.id}:due_soon`,
        title: 'Follow up on upcoming pledge installment',
        description,
        taskType: 'follow_up',
        priority: 'normal',
        dueAt,
        assignedTo,
        metadata: {
          producer: 'pledge_follow_up',
          reason: `Installment due on ${inst.due_date}`,
          source_status: inst.status,
          escalation_state: 'due_soon',
          generated_at: nowStr,
          source_due_date: inst.due_date,
        },
        links: [
          { entityType: 'pledge_installment', entityId: inst.id, relationship: 'primary' },
          { entityType: 'pledge', entityId: pledge.id, relationship: 'context' },
          { entityType: 'donor', entityId: pledge.donor_id, relationship: 'context' },
        ],
      });

      if (r === 'created') result.created++;
      else if (r === 'updated') result.updated++;
      else result.skipped++;
    } catch (err) {
      result.errors.push({ sourceType: 'pledge_installment', sourceId: inst.id, message: String(err) });
    }
  }

  // Overdue: due_date < today
  let overdueQuery = db
    .from('pledge_installments')
    .select(`
      id, org_id, pledge_id, due_date, amount, status,
      pledge:pledges!inner(id, org_id, status, relationship_manager, campaign, fund_designation, donor_id, deleted_at)
    `)
    .eq('status', 'pending')
    .lt('due_date', now.toISOString().slice(0, 10));

  if (options.orgId) overdueQuery = overdueQuery.eq('org_id', options.orgId);
  if (options.sourceId) overdueQuery = overdueQuery.eq('id', options.sourceId);

  const { data: overdue } = await overdueQuery;

  for (const inst of (overdue ?? []) as InstallmentRow[]) {
    result.scanned++;
    const pledge = inst.pledge;
    if (!pledge || pledge.status !== 'active' || pledge.deleted_at) { result.skipped++; continue; }

    try {
      const daysOverdue = Math.floor((now.getTime() - new Date(inst.due_date).getTime()) / 86400000);
      const assignedTo = await validateAssignee(db, inst.org_id, pledge.relationship_manager);

      const description = [
        `Installment of $${Number(inst.amount).toLocaleString()} was due on ${inst.due_date} (${daysOverdue} days overdue).`,
        pledge.campaign ? `Campaign: ${pledge.campaign}.` : null,
      ].filter(Boolean).join(' ');

      const r = await upsertGeneratedTask(db, {
        orgId: inst.org_id,
        sourceKey: `pledge_installment:${inst.id}:overdue`,
        title: 'Overdue pledge installment',
        description,
        taskType: 'follow_up',
        priority: overduePriority(daysOverdue),
        dueAt: `${inst.due_date}T09:00:00.000Z`,
        assignedTo,
        metadata: {
          producer: 'pledge_follow_up',
          reason: `Installment overdue by ${daysOverdue} days`,
          source_status: inst.status,
          escalation_state: escalationState(daysOverdue),
          generated_at: nowStr,
          source_due_date: inst.due_date,
        },
        links: [
          { entityType: 'pledge_installment', entityId: inst.id, relationship: 'primary' },
          { entityType: 'pledge', entityId: pledge.id, relationship: 'context' },
          { entityType: 'donor', entityId: pledge.donor_id, relationship: 'context' },
        ],
      });

      if (r === 'created') result.created++;
      else if (r === 'updated') result.updated++;
      else result.skipped++;

      // Complete the due-soon task for the same installment
      await completeGeneratedTasks(
        db, inst.org_id,
        `pledge_installment:${inst.id}:due_soon`,
        'Installment is now overdue'
      );
    } catch (err) {
      result.errors.push({ sourceType: 'pledge_installment', sourceId: inst.id, message: String(err) });
    }
  }

  return [result];
}
```

- [ ] **Step 4: Add source hooks to installment PATCH route**

In `app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts`, add after the successful RPC call (after line 34 `if (error) return ...`):

```typescript
// Add imports at top of file:
import { createAdminClient } from '@/lib/supabase';
import { completeGeneratedTasks, cancelGeneratedTasks } from '@/lib/tasks/automation/task-writer';

// After the successful RPC result, before fetching pledge/installments:
    const action = d.action; // 'pay', 'waive', 'write_off', etc.
    const adminDb = createAdminClient();
    if (action === 'pay') {
      await completeGeneratedTasks(adminDb, orgId, `pledge_installment:${installmentId}:`, 'Installment paid');
    } else if (action === 'waive' || action === 'write_off') {
      await cancelGeneratedTasks(adminDb, orgId, `pledge_installment:${installmentId}:`, `Installment ${action.replace('_', ' ')}`);
    }
```

The full modified PATCH handler becomes:

```typescript
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; pledgeId: string; installmentId: string }> }
) {
  try {
    const { orgId, pledgeId, installmentId } = await params;
    const supabase = await createServerClient();
    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
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

    // Task hooks — fire and forget errors (do not fail the request)
    try {
      const adminDb = createAdminClient();
      if (d.action === 'pay') {
        await completeGeneratedTasks(adminDb, orgId, `pledge_installment:${installmentId}:`, 'Installment paid');
      } else if (d.action === 'waive' || d.action === 'write_off') {
        await cancelGeneratedTasks(adminDb, orgId, `pledge_installment:${installmentId}:`, `Installment ${d.action.replace('_', ' ')}`);
      }
    } catch (hookErr) {
      console.warn('[tasks] pledge installment hook error:', hookErr);
    }

    const { data: pledge }       = await supabase.from('v_pledge_pipeline').select('*').eq('id', pledgeId).single();
    const { data: installments } = await supabase.from('pledge_installments').select('*').eq('pledge_id', pledgeId).order('due_date');

    return NextResponse.json({ result, pledge, installments });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

Add imports at the top of the installment route:
```typescript
import { createAdminClient } from '@/lib/supabase';
import { completeGeneratedTasks, cancelGeneratedTasks } from '@/lib/tasks/automation/task-writer';
```

- [ ] **Step 5: Add source hooks to pledge cancel route**

In `app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts`, add after the successful pledge cancel update:

```typescript
// Add imports at top:
import { createAdminClient } from '@/lib/supabase';
import { cancelGeneratedTasks } from '@/lib/tasks/automation/task-writer';

// Inside POST, after the pledge update succeeds (after the `if (pe) return` check):
    // Cancel all open generated tasks for pending installments of this pledge
    try {
      const adminDb = createAdminClient();
      // Get pending installment IDs
      const { data: pendingInstallments } = await supabase
        .from('pledge_installments')
        .select('id')
        .eq('pledge_id', pledgeId)
        .eq('org_id', orgId)
        .in('status', ['pending']);
      if (pendingInstallments) {
        for (const inst of pendingInstallments) {
          await cancelGeneratedTasks(adminDb, orgId, `pledge_installment:${inst.id}:`, 'Pledge cancelled');
        }
      }
    } catch (hookErr) {
      console.warn('[tasks] pledge cancel hook error:', hookErr);
    }
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run lib/tasks/automation/__tests__/producers.pledge.test.ts 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/tasks/automation/producers/pledges.ts \
        lib/tasks/automation/__tests__/producers.pledge.test.ts \
        "app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts" \
        "app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts"
git commit -m "feat: pledge follow-up producer with due-soon, overdue, and source hooks"
```

---

## Task 5: Compliance Producer + Source Hooks

**Files:**
- Create: `lib/tasks/automation/producers/compliance.ts`
- Create: `lib/tasks/automation/__tests__/producers.compliance.test.ts`
- Modify: `app/api/org/[orgId]/compliance/filing-calendar/route.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/tasks/automation/__tests__/producers.compliance.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync('lib/tasks/automation/producers/compliance.ts', 'utf8');
const filingRouteSrc = readFileSync(
  'app/api/org/[orgId]/compliance/filing-calendar/route.ts',
  'utf8'
);

describe('compliance producer contract', () => {
  it('uses filing entity type', () => {
    expect(src).toContain("'filing'");
    expect(src).toContain('TASK_ENTITY_TYPES');
  });

  it('uses state_registration entity type', () => {
    expect(src).toContain("'state_registration'");
  });

  it('queries filing_calendar table', () => {
    expect(src).toContain("'filing_calendar'");
  });

  it('queries state_registrations table', () => {
    expect(src).toContain("'state_registrations'");
  });

  it('uses filing:{id}:reminder source key pattern', () => {
    expect(src).toMatch(/filing:.*:reminder/);
  });

  it('uses filing:{id}:overdue source key pattern', () => {
    expect(src).toMatch(/filing:.*:overdue/);
  });

  it('uses state_registration:{id}:renewal source key pattern', () => {
    expect(src).toMatch(/state_registration:.*:renewal/);
  });

  it('uses extension_due_date when status is extended', () => {
    expect(src).toContain('extension_due_date');
    expect(src).toContain('extended');
  });

  it('filing PATCH route hooks complete/cancel tasks on filed/waived', () => {
    expect(filingRouteSrc).toContain('completeGeneratedTasks');
    expect(filingRouteSrc).toContain('cancelGeneratedTasks');
    expect(filingRouteSrc).toContain('filed');
    expect(filingRouteSrc).toContain('waived');
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run lib/tasks/automation/__tests__/producers.compliance.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement the compliance producer**

Replace stub at `lib/tasks/automation/producers/compliance.ts`:

```typescript
// lib/tasks/automation/producers/compliance.ts
import { createAdminClient } from '@/lib/supabase';
import { upsertGeneratedTask, completeGeneratedTasks, cancelGeneratedTasks } from '../task-writer';
import { ProducerOptions, TaskProducerResult, TASK_ENTITY_TYPES } from '../types';

function filingEscalationState(daysRemaining: number): string {
  if (daysRemaining >= 15) return 'reminder_30';
  if (daysRemaining >= 8) return 'reminder_14';
  return 'reminder_7';
}

function filingPriority(daysRemaining: number): 'normal' | 'high' | 'urgent' {
  if (daysRemaining >= 15) return 'normal';
  if (daysRemaining >= 8) return 'high';
  return 'urgent';
}

function overdueFilingEscalation(daysOverdue: number): string {
  if (daysOverdue >= 30) return 'overdue_30';
  if (daysOverdue >= 7) return 'overdue_7';
  return 'overdue_1';
}

function stateRenewalEscalationState(daysRemaining: number): string {
  if (daysRemaining > 30) return 'renewal_60';
  if (daysRemaining > 14) return 'renewal_30';
  if (daysRemaining > 7) return 'renewal_14';
  return 'renewal_7';
}

function stateRenewalPriority(daysRemaining: number): 'normal' | 'high' | 'urgent' {
  if (daysRemaining > 30) return 'normal';
  if (daysRemaining > 7) return 'high';
  return 'urgent';
}

export async function complianceDeadlinesProducer(options: ProducerOptions): Promise<TaskProducerResult[]> {
  const db = createAdminClient();
  const now = options.now ?? new Date();
  const nowStr = now.toISOString();
  const today = now.toISOString().slice(0, 10);

  const result: TaskProducerResult = {
    producer: 'compliance_deadlines',
    orgId: options.orgId,
    scanned: 0,
    created: 0,
    updated: 0,
    completed: 0,
    skipped: 0,
    errors: [],
  };

  if (options.dryRun) return [{ ...result }];

  // ── Filing reminders ──────────────────────────────────────────────────────
  let filingQuery = db
    .from('filing_calendar')
    .select('id, org_id, title, due_date, extension_due_date, status, reminder_days')
    .in('status', ['upcoming', 'in_progress', 'extended', 'overdue'])
    .is('deleted_at', null);

  if (options.orgId) filingQuery = filingQuery.eq('org_id', options.orgId);
  if (options.sourceId) filingQuery = filingQuery.eq('id', options.sourceId);

  const { data: filings, error: filingErr } = await filingQuery;
  if (filingErr) {
    result.errors.push({ sourceType: 'filing', sourceId: 'query', message: filingErr.message });
    return [result];
  }

  for (const filing of filings ?? []) {
    result.scanned++;
    try {
      const effectiveDue = (filing.status === 'extended' && filing.extension_due_date)
        ? filing.extension_due_date
        : filing.due_date;

      const effectiveDate = new Date(effectiveDue);
      const msRemaining = effectiveDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(msRemaining / 86400000);

      if (effectiveDue < today) {
        // Overdue
        const daysOverdue = Math.floor((now.getTime() - effectiveDate.getTime()) / 86400000);

        const r = await upsertGeneratedTask(db, {
          orgId: filing.org_id,
          sourceKey: `filing:${filing.id}:overdue`,
          title: `OVERDUE: ${filing.title}`,
          description: `Filing "${filing.title}" was due on ${effectiveDue} (${daysOverdue} days overdue).`,
          taskType: 'reminder',
          priority: 'urgent',
          dueAt: `${effectiveDue}T09:00:00.000Z`,
          assignedTo: null,
          metadata: {
            producer: 'compliance_deadlines',
            reason: `Filing overdue by ${daysOverdue} days`,
            source_status: filing.status,
            escalation_state: overdueFilingEscalation(daysOverdue),
            generated_at: nowStr,
            source_due_date: effectiveDue,
          },
          links: [{ entityType: 'filing', entityId: filing.id, relationship: 'primary' }],
        });

        if (r === 'created') result.created++;
        else if (r === 'updated') result.updated++;
        else result.skipped++;

        // Close the reminder task now that filing is overdue
        const completed = await completeGeneratedTasks(
          db, filing.org_id, `filing:${filing.id}:reminder`, 'Filing is now overdue'
        );
        result.completed += completed;

        // Optionally mark filing status as overdue
        if (filing.status !== 'overdue') {
          await db.from('filing_calendar').update({ status: 'overdue' }).eq('id', filing.id);
        }
      } else {
        // Upcoming: only create reminder if within earliest window
        const reminderDays = (filing.reminder_days as number[]) ?? [30, 14, 7];
        const maxWindow = Math.max(...reminderDays);
        if (daysRemaining > maxWindow) { result.skipped++; continue; }

        const r = await upsertGeneratedTask(db, {
          orgId: filing.org_id,
          sourceKey: `filing:${filing.id}:reminder`,
          title: `Prepare ${filing.title}`,
          description: `Filing "${filing.title}" is due on ${effectiveDue} (${daysRemaining} days remaining).`,
          taskType: 'reminder',
          priority: filingPriority(daysRemaining),
          dueAt: `${effectiveDue}T09:00:00.000Z`,
          assignedTo: null,
          metadata: {
            producer: 'compliance_deadlines',
            reason: `Filing due in ${daysRemaining} days`,
            source_status: filing.status,
            escalation_state: filingEscalationState(daysRemaining),
            generated_at: nowStr,
            source_due_date: effectiveDue,
          },
          links: [{ entityType: 'filing', entityId: filing.id, relationship: 'primary' }],
        });

        if (r === 'created') result.created++;
        else if (r === 'updated') result.updated++;
        else result.skipped++;
      }
    } catch (err) {
      result.errors.push({ sourceType: 'filing', sourceId: filing.id, message: String(err) });
    }
  }

  // ── State registration renewals ───────────────────────────────────────────
  let regQuery = db
    .from('state_registrations')
    .select('id, org_id, state, renewal_due_date, expiration_date, status')
    .in('status', ['active', 'renewal_due'])
    .not('renewal_due_date', 'is', null);

  if (options.orgId) regQuery = regQuery.eq('org_id', options.orgId);
  if (options.sourceId) regQuery = regQuery.eq('id', options.sourceId);

  const { data: registrations, error: regErr } = await regQuery;
  if (regErr) {
    result.errors.push({ sourceType: 'state_registration', sourceId: 'query', message: regErr.message });
    return [result];
  }

  for (const reg of registrations ?? []) {
    result.scanned++;
    try {
      const renewalDate = new Date(reg.renewal_due_date);
      const daysRemaining = Math.ceil((renewalDate.getTime() - now.getTime()) / 86400000);
      const isOverdue = reg.renewal_due_date < today;

      // Only within 60 days or overdue
      if (!isOverdue && daysRemaining > 60) { result.skipped++; continue; }

      const priority = isOverdue ? 'urgent' : stateRenewalPriority(daysRemaining);
      const escalation = isOverdue ? 'overdue' : stateRenewalEscalationState(daysRemaining);
      const reason = isOverdue
        ? `State registration renewal overdue (was due ${reg.renewal_due_date})`
        : `State registration renewal due in ${daysRemaining} days`;

      const r = await upsertGeneratedTask(db, {
        orgId: reg.org_id,
        sourceKey: `state_registration:${reg.id}:renewal`,
        title: `Renew ${reg.state} state registration`,
        description: `${reg.state} state registration renewal is due on ${reg.renewal_due_date}. ${reason}.`,
        taskType: 'reminder',
        priority,
        dueAt: `${reg.renewal_due_date}T09:00:00.000Z`,
        assignedTo: null,
        metadata: {
          producer: 'compliance_deadlines',
          reason,
          source_status: reg.status,
          escalation_state: escalation,
          generated_at: nowStr,
          source_due_date: reg.renewal_due_date,
        },
        links: [{ entityType: 'state_registration', entityId: reg.id, relationship: 'primary' }],
      });

      if (r === 'created') result.created++;
      else if (r === 'updated') result.updated++;
      else result.skipped++;

      // Mark renewal_due if inside 30 days and still active
      if (!isOverdue && daysRemaining <= 30 && reg.status === 'active') {
        await db.from('state_registrations').update({ status: 'renewal_due' }).eq('id', reg.id);
      }
    } catch (err) {
      result.errors.push({ sourceType: 'state_registration', sourceId: reg.id, message: String(err) });
    }
  }

  return [result];
}
```

- [ ] **Step 4: Add hooks to the filing calendar PATCH route**

In `app/api/org/[orgId]/compliance/filing-calendar/route.ts`, add to PATCH after the successful update:

Add imports at the top of the file:
```typescript
import { createAdminClient } from '@/lib/supabase';
import { completeGeneratedTasks, cancelGeneratedTasks } from '@/lib/tasks/automation/task-writer';
```

After the `const { data, error } = await supabase.from('filing_calendar').update(...)...single()` and before the final `return NextResponse.json({ data })`:

```typescript
    // Task hooks for resolved filing statuses
    if (!error && data && 'status' in updates) {
      try {
        const adminDb = createAdminClient();
        if (updates.status === 'filed') {
          await completeGeneratedTasks(adminDb, orgId, `filing:${id}:`, 'Filing marked as filed');
        } else if (updates.status === 'waived' || updates.status === 'not_applicable') {
          await cancelGeneratedTasks(adminDb, orgId, `filing:${id}:`, `Filing marked as ${updates.status}`);
        }
      } catch (hookErr) {
        console.warn('[tasks] filing calendar hook error:', hookErr);
      }
    }
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run lib/tasks/automation/__tests__/producers.compliance.test.ts 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/tasks/automation/producers/compliance.ts \
        lib/tasks/automation/__tests__/producers.compliance.test.ts \
        "app/api/org/[orgId]/compliance/filing-calendar/route.ts"
git commit -m "feat: compliance deadlines producer with filing and state registration tasks"
```

---

## Task 6: Grant Producer + Milestone Reverse Sync

**Files:**
- Create: `lib/tasks/automation/producers/grants.ts`
- Create: `lib/tasks/automation/__tests__/producers.grants.test.ts`
- Modify: `app/api/org/[orgId]/tasks/[taskId]/complete/route.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/tasks/automation/__tests__/producers.grants.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync('lib/tasks/automation/producers/grants.ts', 'utf8');
const completeSrc = readFileSync(
  'app/api/org/[orgId]/tasks/[taskId]/complete/route.ts',
  'utf8'
);

describe('grant obligations producer contract', () => {
  it('uses grant_milestone entity type', () => {
    expect(src).toContain("'grant_milestone'");
    expect(src).toContain('TASK_ENTITY_TYPES');
  });

  it('uses grant_report entity type', () => {
    expect(src).toContain("'grant_report'");
  });

  it('uses grant_payment entity type', () => {
    expect(src).toContain("'grant_payment'");
  });

  it('queries grant_milestones via join to holdings for org scoping', () => {
    expect(src).toContain('grant_milestones');
    expect(src).toContain('grant_details');
    // Must NOT use direct org_id filter on grant_milestones (no org_id column)
    expect(src).not.toMatch(/from\(['"]grant_milestones['"]\)[\s\S]{0,200}\.eq\(['"]org_id/);
  });

  it('uses grant_milestone:{id}:due source key', () => {
    expect(src).toMatch(/grant_milestone:.*:due/);
  });

  it('uses grant_report:{id}:due source key', () => {
    expect(src).toMatch(/grant_report:.*:due/);
  });

  it('uses grant_payment:{id}:conditions source key', () => {
    expect(src).toMatch(/grant_payment:.*:conditions/);
  });

  it('complete route adds milestone reverse sync', () => {
    expect(completeSrc).toContain('grant_obligations');
    expect(completeSrc).toContain('grant_milestone');
    expect(completeSrc).toContain('completed_date');
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run lib/tasks/automation/__tests__/producers.grants.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement the grant producer**

Replace stub at `lib/tasks/automation/producers/grants.ts`:

```typescript
// lib/tasks/automation/producers/grants.ts
import { createAdminClient } from '@/lib/supabase';
import { upsertGeneratedTask, completeGeneratedTasks, cancelGeneratedTasks } from '../task-writer';
import { ProducerOptions, TaskProducerResult, TASK_ENTITY_TYPES } from '../types';

function milestonePriority(daysRemaining: number, isOverdue: boolean): 'normal' | 'high' | 'urgent' {
  if (isOverdue) return 'urgent';
  if (daysRemaining <= 14) return 'high';
  return 'normal';
}

function reportPriority(daysRemaining: number, isOverdue: boolean): 'normal' | 'high' | 'urgent' {
  if (isOverdue) return 'urgent';
  if (daysRemaining <= 15) return 'high';
  return 'normal';
}

export async function grantObligationsProducer(options: ProducerOptions): Promise<TaskProducerResult[]> {
  const db = createAdminClient();
  const now = options.now ?? new Date();
  const nowStr = now.toISOString();
  const today = now.toISOString().slice(0, 10);

  const result: TaskProducerResult = {
    producer: 'grant_obligations',
    orgId: options.orgId,
    scanned: 0,
    created: 0,
    updated: 0,
    completed: 0,
    skipped: 0,
    errors: [],
  };

  if (options.dryRun) return [{ ...result }];

  // ── Grant Milestones ──────────────────────────────────────────────────────
  // grant_milestones has no org_id — join via grant_details → holdings
  const window30 = new Date(now);
  window30.setDate(window30.getDate() + 30);

  let milestoneQuery = db
    .from('grant_milestones')
    .select(`
      id, milestone_name, description, due_date, status, grant_id,
      grant_details!inner(id, holding_id, holdings!inner(id, portfolio_id, org_id, name))
    `)
    .in('status', ['pending', 'in_progress', 'overdue'])
    .not('due_date', 'is', null)
    .lte('due_date', window30.toISOString().slice(0, 10));

  if (options.sourceId) milestoneQuery = milestoneQuery.eq('id', options.sourceId);

  const { data: milestones, error: mErr } = await milestoneQuery;
  if (mErr) {
    result.errors.push({ sourceType: 'grant_milestone', sourceId: 'query', message: mErr.message });
    return [result];
  }

  for (const ms of milestones ?? []) {
    const holding = (ms as any).grant_details?.holdings;
    const orgId = holding?.org_id;
    if (!orgId) { result.skipped++; continue; }
    if (options.orgId && orgId !== options.orgId) { result.skipped++; continue; }

    result.scanned++;
    try {
      const isOverdue = ms.due_date < today;
      const daysRemaining = isOverdue ? 0 : Math.ceil((new Date(ms.due_date).getTime() - now.getTime()) / 86400000);
      const daysOverdue = isOverdue ? Math.floor((now.getTime() - new Date(ms.due_date).getTime()) / 86400000) : 0;

      const reason = isOverdue
        ? `Grant milestone overdue by ${daysOverdue} days`
        : `Grant milestone due in ${daysRemaining} days`;

      const r = await upsertGeneratedTask(db, {
        orgId,
        sourceKey: `grant_milestone:${ms.id}:due`,
        title: `Grant milestone: ${ms.milestone_name}`,
        description: `${ms.description ?? ms.milestone_name} — due ${ms.due_date}. ${reason}.`,
        taskType: 'review',
        priority: milestonePriority(daysRemaining, isOverdue),
        dueAt: `${ms.due_date}T09:00:00.000Z`,
        assignedTo: null,
        metadata: {
          producer: 'grant_obligations',
          reason,
          source_status: ms.status,
          escalation_state: isOverdue ? `overdue_${daysOverdue >= 30 ? '30' : daysOverdue >= 7 ? '7' : '1'}` : 'due_soon',
          generated_at: nowStr,
          source_due_date: ms.due_date,
        },
        links: [
          { entityType: 'grant_milestone', entityId: ms.id, relationship: 'primary' },
          { entityType: 'grant', entityId: ms.grant_id, relationship: 'context' },
          { entityType: 'holding', entityId: holding.id, relationship: 'context' },
          { entityType: 'portfolio', entityId: holding.portfolio_id, relationship: 'context' },
        ],
      });

      if (r === 'created') result.created++;
      else if (r === 'updated') result.updated++;
      else result.skipped++;
    } catch (err) {
      result.errors.push({ sourceType: 'grant_milestone', sourceId: ms.id, message: String(err) });
    }
  }

  // Complete/cancel milestones that are now resolved
  const { data: resolved } = await db
    .from('grant_milestones')
    .select(`id, status, grant_details!inner(holdings!inner(org_id))`)
    .in('status', ['completed', 'cancelled']);

  for (const ms of resolved ?? []) {
    const orgId = (ms as any).grant_details?.holdings?.org_id;
    if (!orgId) continue;
    if (options.orgId && orgId !== options.orgId) continue;
    if (ms.status === 'completed') {
      const n = await completeGeneratedTasks(db, orgId, `grant_milestone:${ms.id}:due`, 'Milestone completed');
      result.completed += n;
    } else {
      const n = await cancelGeneratedTasks(db, orgId, `grant_milestone:${ms.id}:due`, 'Milestone cancelled');
      result.completed += n;
    }
  }

  // ── Grant Reports ──────────────────────────────────────────────────────────
  const window45 = new Date(now);
  window45.setDate(window45.getDate() + 45);

  let reportQuery = db
    .from('grant_reports')
    .select(`
      id, grant_id, due_date, submitted_date, received_at,
      grant_details!inner(id, holding_id, holdings!inner(id, portfolio_id, org_id))
    `)
    .is('submitted_date', null)
    .is('received_at', null)
    .not('due_date', 'is', null)
    .lte('due_date', window45.toISOString().slice(0, 10));

  if (options.sourceId) reportQuery = reportQuery.eq('id', options.sourceId);

  const { data: reports } = await reportQuery;

  for (const rpt of reports ?? []) {
    const holding = (rpt as any).grant_details?.holdings;
    const orgId = holding?.org_id;
    if (!orgId) { result.skipped++; continue; }
    if (options.orgId && orgId !== options.orgId) { result.skipped++; continue; }

    result.scanned++;
    try {
      const isOverdue = rpt.due_date < today;
      const daysRemaining = isOverdue ? 0 : Math.ceil((new Date(rpt.due_date).getTime() - now.getTime()) / 86400000);
      const daysOverdue = isOverdue ? Math.floor((now.getTime() - new Date(rpt.due_date).getTime()) / 86400000) : 0;
      const reason = isOverdue ? `Grant report overdue by ${daysOverdue} days` : `Grant report due in ${daysRemaining} days`;

      const r = await upsertGeneratedTask(db, {
        orgId,
        sourceKey: `grant_report:${rpt.id}:due`,
        title: 'Grant report due',
        description: `Grant report is due on ${rpt.due_date}. ${reason}.`,
        taskType: 'review',
        priority: reportPriority(daysRemaining, isOverdue),
        dueAt: `${rpt.due_date}T09:00:00.000Z`,
        assignedTo: null,
        metadata: {
          producer: 'grant_obligations',
          reason,
          source_status: 'pending',
          generated_at: nowStr,
          source_due_date: rpt.due_date,
        },
        links: [
          { entityType: 'grant_report', entityId: rpt.id, relationship: 'primary' },
          { entityType: 'grant', entityId: rpt.grant_id, relationship: 'context' },
          { entityType: 'holding', entityId: holding.id, relationship: 'context' },
          { entityType: 'portfolio', entityId: holding.portfolio_id, relationship: 'context' },
        ],
      });

      if (r === 'created') result.created++;
      else if (r === 'updated') result.updated++;
      else result.skipped++;
    } catch (err) {
      result.errors.push({ sourceType: 'grant_report', sourceId: rpt.id, message: String(err) });
    }
  }

  // ── Grant Payments ────────────────────────────────────────────────────────
  const window14 = new Date(now);
  window14.setDate(window14.getDate() + 14);

  let paymentQuery = db
    .from('grant_payments')
    .select(`
      id, grant_id, scheduled_date, status, conditions_met,
      grant_details!inner(id, holding_id, holdings!inner(id, portfolio_id, org_id))
    `)
    .in('status', ['scheduled', 'approved', 'processing'])
    .not('scheduled_date', 'is', null)
    .eq('conditions_met', false)
    .lte('scheduled_date', window14.toISOString().slice(0, 10));

  if (options.sourceId) paymentQuery = paymentQuery.eq('id', options.sourceId);

  const { data: payments } = await paymentQuery;

  for (const pmt of payments ?? []) {
    const holding = (pmt as any).grant_details?.holdings;
    const orgId = holding?.org_id;
    if (!orgId) { result.skipped++; continue; }
    if (options.orgId && orgId !== options.orgId) { result.skipped++; continue; }

    result.scanned++;
    try {
      const isOverdue = pmt.scheduled_date < today;
      const daysOverdue = isOverdue ? Math.floor((now.getTime() - new Date(pmt.scheduled_date).getTime()) / 86400000) : 0;
      const reason = isOverdue
        ? `Grant payment conditions unmet and payment is ${daysOverdue} days overdue`
        : `Grant payment scheduled soon — conditions must be met`;

      const r = await upsertGeneratedTask(db, {
        orgId,
        sourceKey: `grant_payment:${pmt.id}:conditions`,
        title: 'Grant payment — confirm conditions met',
        description: `Grant payment scheduled for ${pmt.scheduled_date} requires conditions to be marked met. ${reason}.`,
        taskType: 'approval',
        priority: isOverdue ? 'urgent' : 'high',
        dueAt: `${pmt.scheduled_date}T09:00:00.000Z`,
        assignedTo: null,
        metadata: {
          producer: 'grant_obligations',
          reason,
          source_status: pmt.status,
          generated_at: nowStr,
          source_due_date: pmt.scheduled_date,
        },
        links: [
          { entityType: 'grant_payment', entityId: pmt.id, relationship: 'primary' },
          { entityType: 'grant', entityId: pmt.grant_id, relationship: 'context' },
          { entityType: 'holding', entityId: holding.id, relationship: 'context' },
        ],
      });

      if (r === 'created') result.created++;
      else if (r === 'updated') result.updated++;
      else result.skipped++;
    } catch (err) {
      result.errors.push({ sourceType: 'grant_payment', sourceId: pmt.id, message: String(err) });
    }
  }

  return [result];
}
```

- [ ] **Step 4: Add milestone reverse sync to task complete route**

The file at `app/api/org/[orgId]/tasks/[taskId]/complete/route.ts` already exists. Modify it to add milestone reverse sync after the task is updated. Replace the file content with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; taskId: string }>;
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, taskId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const adminClient = createAdminClient();
    const { data: existing } = await adminClient
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (!ADMIN_ROLES.has(role) && existing.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Not authorized to complete this task' }, { status: 403 });
    }

    const { data: task, error } = await adminClient
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: user.id,
      })
      .eq('id', taskId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await adminClient.from('task_events').insert({
      task_id: taskId,
      org_id: orgId,
      actor_id: user.id,
      event_type: 'completed',
      before_values: existing,
      after_values: task,
    });

    // Grant milestone reverse sync: if this task was generated for a grant milestone, mark it complete
    try {
      const metadata = (existing.metadata as Record<string, unknown>) ?? {};
      if (metadata.producer === 'grant_obligations') {
        const { data: links } = await adminClient
          .from('task_entity_links')
          .select('entity_id')
          .eq('task_id', taskId)
          .eq('entity_type', 'grant_milestone')
          .maybeSingle();

        if (links?.entity_id) {
          // DB enforces: status='completed' requires completed_date IS NOT NULL
          await adminClient
            .from('grant_milestones')
            .update({ status: 'completed', completed_date: new Date().toISOString().slice(0, 10) })
            .eq('id', links.entity_id);
        }
      }
    } catch (syncErr) {
      console.warn('[tasks] grant milestone reverse sync error:', syncErr);
    }

    return NextResponse.json({ task });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run lib/tasks/automation/__tests__/producers.grants.test.ts 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/tasks/automation/producers/grants.ts \
        lib/tasks/automation/__tests__/producers.grants.test.ts \
        "app/api/org/[orgId]/tasks/[taskId]/complete/route.ts"
git commit -m "feat: grant obligations producer with milestone, report, payment tasks and reverse sync"
```

---

## Task 7: Import Producer

**Files:**
- Create: `lib/tasks/automation/producers/imports.ts`
- Create: `lib/tasks/automation/__tests__/producers.imports.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/tasks/automation/__tests__/producers.imports.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync('lib/tasks/automation/producers/imports.ts', 'utf8');

describe('import review producer contract', () => {
  it('uses import_job entity type', () => {
    expect(src).toContain("'import_job'");
    expect(src).toContain('TASK_ENTITY_TYPES');
  });

  it('queries import_jobs table', () => {
    expect(src).toContain("'import_jobs'");
  });

  it('uses import_job:{id}:review_errors source key', () => {
    expect(src).toMatch(/import_job:.*:review_errors/);
  });

  it('uses import_job:{id}:approval source key', () => {
    expect(src).toMatch(/import_job:.*:approval/);
  });

  it('checks error_rows, rejected_rows, error_message columns', () => {
    expect(src).toContain('error_rows');
    expect(src).toContain('rejected_rows');
    expect(src).toContain('error_message');
  });

  it('checks reviewed_by and approved_rows for approval task', () => {
    expect(src).toContain('reviewed_by');
    expect(src).toContain('approved_rows');
  });

  it('does not query terminal statuses completed/failed/rejected', () => {
    expect(src).toContain("'completed'");
    expect(src).toContain("'failed'");
    expect(src).toContain("'rejected'");
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run lib/tasks/automation/__tests__/producers.imports.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement the import producer**

Replace stub at `lib/tasks/automation/producers/imports.ts`:

```typescript
// lib/tasks/automation/producers/imports.ts
import { createAdminClient } from '@/lib/supabase';
import { upsertGeneratedTask, completeGeneratedTasks, cancelGeneratedTasks } from '../task-writer';
import { ProducerOptions, TaskProducerResult, TASK_ENTITY_TYPES } from '../types';

// import_status_enum: 'pending', 'processing', 'needs_review', 'approved', 'rejected', 'completed', 'failed'
const TERMINAL_STATUSES = ['completed', 'failed', 'rejected'] as const;

export async function importReviewProducer(options: ProducerOptions): Promise<TaskProducerResult[]> {
  const db = createAdminClient();
  const now = options.now ?? new Date();
  const nowStr = now.toISOString();

  const result: TaskProducerResult = {
    producer: 'import_review',
    orgId: options.orgId,
    scanned: 0,
    created: 0,
    updated: 0,
    completed: 0,
    skipped: 0,
    errors: [],
  };

  if (options.dryRun) return [{ ...result }];

  let query = db
    .from('import_jobs')
    .select('id, org_id, portfolio_id, status, error_rows, rejected_rows, approved_rows, error_message, reviewed_by, ai_data_quality_report, created_at')
    .not('status', 'in', `(${TERMINAL_STATUSES.map(s => `"${s}"`).join(',')})`)
    .order('created_at', { ascending: false });

  if (options.orgId) query = query.eq('org_id', options.orgId);
  if (options.sourceId) query = query.eq('id', options.sourceId);

  const { data: jobs, error: jobErr } = await query;
  if (jobErr) {
    result.errors.push({ sourceType: 'import_job', sourceId: 'query', message: jobErr.message });
    return [result];
  }

  for (const job of jobs ?? []) {
    result.scanned++;
    try {
      const hasErrors = (job.error_rows ?? 0) > 0 || (job.rejected_rows ?? 0) > 0 || !!job.error_message;
      const needsApproval = (job.approved_rows ?? 0) > 0 && !job.reviewed_by && !TERMINAL_STATUSES.includes(job.status as any);

      const links = [
        { entityType: 'import_job' as const, entityId: job.id, relationship: 'primary' as const },
        ...(job.portfolio_id ? [{ entityType: 'portfolio' as const, entityId: job.portfolio_id, relationship: 'context' as const }] : []),
      ];

      if (hasErrors) {
        const errorCount = (job.error_rows ?? 0) + (job.rejected_rows ?? 0);
        const r = await upsertGeneratedTask(db, {
          orgId: job.org_id,
          sourceKey: `import_job:${job.id}:review_errors`,
          title: 'Import job has errors requiring review',
          description: `Import job has ${errorCount} error/rejected rows${job.error_message ? `: ${job.error_message}` : '.'}`,
          taskType: 'review',
          priority: 'high',
          dueAt: null,
          assignedTo: null,
          metadata: {
            producer: 'import_review',
            reason: `Import has ${errorCount} errors`,
            source_status: job.status,
            generated_at: nowStr,
          },
          links,
        });
        if (r === 'created') result.created++;
        else if (r === 'updated') result.updated++;
        else result.skipped++;
      } else {
        // No errors — complete any open error task
        const n = await completeGeneratedTasks(db, job.org_id, `import_job:${job.id}:review_errors`, 'Errors resolved');
        result.completed += n;
      }

      if (needsApproval) {
        const r = await upsertGeneratedTask(db, {
          orgId: job.org_id,
          sourceKey: `import_job:${job.id}:approval`,
          title: 'Approve and commit import job',
          description: `Import job has ${job.approved_rows} approved rows ready to commit. Review and approve to complete the import.`,
          taskType: 'approval',
          priority: 'normal',
          dueAt: null,
          assignedTo: null,
          metadata: {
            producer: 'import_review',
            reason: `${job.approved_rows} rows awaiting approval`,
            source_status: job.status,
            generated_at: nowStr,
          },
          links,
        });
        if (r === 'created') result.created++;
        else if (r === 'updated') result.updated++;
        else result.skipped++;
      } else if (job.reviewed_by) {
        const n = await completeGeneratedTasks(db, job.org_id, `import_job:${job.id}:approval`, 'Import reviewed');
        result.completed += n;
      }
    } catch (err) {
      result.errors.push({ sourceType: 'import_job', sourceId: job.id, message: String(err) });
    }
  }

  // Cancel tasks for terminal jobs where user action is no longer needed
  const { data: terminalJobs } = await db
    .from('import_jobs')
    .select('id, org_id, status')
    .in('status', ['failed', 'rejected']);

  for (const job of terminalJobs ?? []) {
    if (options.orgId && job.org_id !== options.orgId) continue;
    const n = await cancelGeneratedTasks(db, job.org_id, `import_job:${job.id}:`, `Import ${job.status}`);
    result.completed += n;
  }

  return [result];
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/tasks/automation/__tests__/producers.imports.test.ts 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/automation/producers/imports.ts \
        lib/tasks/automation/__tests__/producers.imports.test.ts
git commit -m "feat: import review producer for error and approval task generation"
```

---

## Task 8: Report Producer Stub + Full Contract Test Suite

**Files:**
- Modify: `lib/tasks/automation/producers/reports.ts` (already a stub; confirm it matches spec)
- Create: `lib/__tests__/task-automation-contract.test.ts`

- [ ] **Step 1: Confirm reports stub is correct**

The file should already exist as a stub from Task 3. Ensure it matches:

```typescript
// lib/tasks/automation/producers/reports.ts
import { ProducerOptions, TaskProducerResult } from '../types';

// Stub: implement after confirming active reporting schema (generated_documents, report_schedules)
export async function reportApprovalsProducer(_options: ProducerOptions): Promise<TaskProducerResult[]> {
  return [];
}
```

- [ ] **Step 2: Write the contract test suite**

```typescript
// lib/__tests__/task-automation-contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TASK_ENTITY_TYPES } from '../../lib/tasks/automation/types';

const MIGRATION_DIR = 'db/migrations';
const AUTOMATION_DIR = 'lib/tasks/automation';

function readMigration(name: string): string {
  return readFileSync(join(MIGRATION_DIR, name), 'utf8');
}

function readProducer(name: string): string {
  return readFileSync(join(AUTOMATION_DIR, 'producers', name), 'utf8');
}

function allProducerSources(): string[] {
  return readdirSync(join(AUTOMATION_DIR, 'producers'))
    .filter(f => f.endsWith('.ts'))
    .map(f => readFileSync(join(AUTOMATION_DIR, 'producers', f), 'utf8'));
}

// Active tables used by producers (confirm each exists in a migration)
const ACTIVE_PRODUCER_TABLES = [
  'filing_calendar',
  'state_registrations',
  'pledges',
  'pledge_installments',
  'grant_milestones',
  'grant_reports',
  'grant_payments',
  'grant_details',
  'holdings',
  'import_jobs',
  'tasks',
  'task_entity_links',
  'task_events',
  'task_automation_runs',
  'organization_members',
];

describe('task automation contract: migration tables', () => {
  const allMigrations = readdirSync(MIGRATION_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => readMigration(f))
    .join('\n');

  for (const table of ACTIVE_PRODUCER_TABLES) {
    it(`table ${table} exists in active migrations`, () => {
      expect(allMigrations).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS (?:public\\.)?${table}\\b`, 'i'));
    });
  }

  it('task_automation_runs table is in 0042 migration', () => {
    const src = readMigration('0042_task_automation_runs.sql');
    expect(src).toContain('task_automation_runs');
    expect(src).toContain('try_task_automation_lock');
  });
});

describe('task automation contract: entity types', () => {
  const allProducers = allProducerSources().join('\n');

  it('all TASK_ENTITY_TYPES are registered in types.ts', () => {
    const src = readFileSync(join(AUTOMATION_DIR, 'types.ts'), 'utf8');
    for (const t of TASK_ENTITY_TYPES) {
      expect(src).toContain(`'${t}'`);
    }
  });

  it('all entity_type strings used in producers are in TASK_ENTITY_TYPES', () => {
    // Extract all strings used as entityType in producers
    const entityTypeMatches = allProducers.matchAll(/entityType:\s*['"]([^'"]+)['"]/g);
    const usedTypes = new Set([...entityTypeMatches].map(m => m[1]));
    const validSet = new Set(TASK_ENTITY_TYPES);
    for (const t of usedTypes) {
      expect(validSet, `"${t}" must be in TASK_ENTITY_TYPES`).toContain(t as any);
    }
  });
});

describe('task automation contract: task values', () => {
  const writerSrc = readFileSync(join(AUTOMATION_DIR, 'task-writer.ts'), 'utf8');
  const allProducers = allProducerSources().join('\n');

  it('task writer uses source: automation', () => {
    expect(writerSrc).toContain("source: 'automation'");
  });

  it('all producer task_type values are valid', () => {
    const VALID_TYPES = new Set(['reminder', 'follow_up', 'review', 'approval']);
    const matches = allProducers.matchAll(/taskType:\s*['"]([^'"]+)['"]/g);
    for (const m of matches) {
      expect(VALID_TYPES, `taskType "${m[1]}" must be valid`).toContain(m[1]);
    }
  });

  it('all producer priority values are valid', () => {
    const VALID = new Set(['low', 'normal', 'high', 'urgent']);
    const matches = allProducers.matchAll(/priority:\s*['"]([^'"]+)['"]/g);
    for (const m of matches) {
      expect(VALID, `priority "${m[1]}" must be valid`).toContain(m[1]);
    }
  });
});

describe('task automation contract: grant scoping', () => {
  it('grant producer does not use direct org_id filter on grant_milestones', () => {
    const src = readProducer('grants.ts');
    // grant_milestones has no org_id column — must scope via join
    expect(src).not.toMatch(/from\(['"]grant_milestones['"]\)[\s\S]{0,300}\.eq\(['"]org_id/);
  });

  it('grant producer does not use direct org_id filter on grant_payments', () => {
    const src = readProducer('grants.ts');
    expect(src).not.toMatch(/from\(['"]grant_payments['"]\)[\s\S]{0,300}\.eq\(['"]org_id/);
  });
});

describe('task automation contract: source keys', () => {
  it('pledge producer source keys use pledge_installment:{id} prefix with 2+ colons', () => {
    const src = readProducer('pledges.ts');
    expect(src).toMatch(/`pledge_installment:\$\{[^}]+\}:due_soon`/);
    expect(src).toMatch(/`pledge_installment:\$\{[^}]+\}:overdue`/);
  });

  it('compliance producer source keys use filing:{id} prefix', () => {
    const src = readProducer('compliance.ts');
    expect(src).toMatch(/`filing:\$\{[^}]+\}:reminder`/);
    expect(src).toMatch(/`filing:\$\{[^}]+\}:overdue`/);
    expect(src).toMatch(/`state_registration:\$\{[^}]+\}:renewal`/);
  });

  it('grant producer source keys use grant_{type}:{id} prefix', () => {
    const src = readProducer('grants.ts');
    expect(src).toMatch(/`grant_milestone:\$\{[^}]+\}:due`/);
    expect(src).toMatch(/`grant_report:\$\{[^}]+\}:due`/);
    expect(src).toMatch(/`grant_payment:\$\{[^}]+\}:conditions`/);
  });
});

describe('task automation contract: job route', () => {
  it('generate route uses x-job-secret header for auth', () => {
    const src = readFileSync('app/api/jobs/tasks/generate/route.ts', 'utf8');
    expect(src).toContain('x-job-secret');
    expect(src).toContain('CRON_SECRET');
  });

  it('generate route logs to task_automation_runs', () => {
    const src = readFileSync('app/api/jobs/tasks/generate/route.ts', 'utf8');
    expect(src).toContain('task_automation_runs');
  });

  it('runs route uses createAdminClient', () => {
    const src = readFileSync('app/api/jobs/tasks/runs/route.ts', 'utf8');
    expect(src).toContain('createAdminClient');
  });
});
```

- [ ] **Step 3: Run contract tests**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 4: Run all automation tests to confirm nothing regressed**

```bash
npx vitest run lib/tasks/automation lib/__tests__/task-automation-contract.test.ts app/api/jobs/tasks 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass (no regressions in existing tests).

- [ ] **Step 6: Commit**

```bash
git add lib/tasks/automation/producers/reports.ts \
        lib/__tests__/task-automation-contract.test.ts
git commit -m "feat: report producer stub and full task automation contract test suite"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|------------------|------|
| `task_automation_runs` table | Task 1 |
| `TASK_ENTITY_TYPES` const | Task 1 |
| `upsertGeneratedTask` | Task 2 |
| `completeGeneratedTasks` with prefix safety | Task 2 |
| `cancelGeneratedTasks` | Task 2 |
| `POST /api/jobs/tasks/generate` with `CRON_SECRET` | Task 3 |
| `GET /api/jobs/tasks/runs` observability | Task 3 |
| Dry-run support | Task 3 |
| Concurrent run protection via `task_automation_runs` | Task 3 |
| `try_task_automation_lock` advisory lock RPC | Task 1 |
| Pledge due-soon tasks (14-day window) | Task 4 |
| Pledge overdue tasks with escalation | Task 4 |
| Pledge installment paid → complete tasks | Task 4 |
| Pledge installment waived/written_off → cancel | Task 4 |
| Pledge cancel → cancel all installment tasks | Task 4 |
| Assignment via `relationship_manager` | Task 4 |
| Assignment validator checks `organization_members` | Task 4 |
| Filing reminder tasks with escalation windows | Task 5 |
| Filing overdue tasks + auto-status update | Task 5 |
| State registration renewal tasks (60-day window) | Task 5 |
| Filing PATCH hook (filed/waived/not_applicable) | Task 5 |
| Grant milestone tasks (30-day window) | Task 6 |
| Grant report tasks (45-day window) | Task 6 |
| Grant payment condition tasks (14-day window) | Task 6 |
| Task complete → grant milestone reverse sync | Task 6 |
| Import error/review tasks | Task 7 |
| Import approval tasks | Task 7 |
| Import terminal cancel | Task 7 |
| Report approvals producer (stub) | Task 8 |
| Contract tests: tables in active migrations | Task 8 |
| Contract tests: entity types | Task 8 |
| Contract tests: grant scoping (no direct org_id) | Task 8 |
| Contract tests: source key patterns | Task 8 |

**Placeholder scan:** None found.

**Type consistency:** All producers use `UpsertGeneratedTaskInput` from `types.ts`. `TaskProducerResult` shape is consistent across all 5 producers. `ProducerOptions.now` is `Date | undefined` consistently.
