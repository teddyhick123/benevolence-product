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
      insert: vi.fn((row: unknown) => {
        const r = Array.isArray(row) ? row : [row];
        r.forEach((item: any) => {
          item.id = item.id ?? crypto.randomUUID();
          (store[table] = store[table] ?? []).push(item);
        });
        lastInserted = r[0];
        const insertChain: any = {
          select: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: lastInserted, error: null })),
          error: null,
          then: (resolve: (v: unknown) => void) => resolve({ data: lastInserted, error: null }),
        };
        return insertChain;
      }),
      update: vi.fn((patch: unknown) => {
        const chain: any = {
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: { ...((store[table] ?? [])[0] as object), ...(patch as object) }, error: null })),
          error: null,
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return chain;
      }),
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
    const existingTask = {
      id: 'task-1',
      org_id: 'org-1',
      source_key: baseInput.sourceKey,
      status: 'completed',
      deleted_at: null,
      metadata: {},
    };
    db._store.tasks = [existingTask];
    db.from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: existingTask, error: null })),
          insert: vi.fn(async () => ({ select: vi.fn().mockReturnThis(), single: vi.fn(async () => ({ data: existingTask, error: null })), error: null })),
          update: vi.fn(() => ({ eq: vi.fn().mockReturnThis(), error: null, then: (r: (v: unknown) => void) => r({ data: null, error: null }) })),
          upsert: vi.fn(async () => ({ error: null })),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: null, error: null })), insert: vi.fn(async () => ({ error: null })), update: vi.fn(() => ({ eq: vi.fn().mockReturnThis(), error: null, then: (r: (v: unknown) => void) => r({ data: null, error: null }) })), upsert: vi.fn(async () => ({ error: null })) };
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
          update: vi.fn(() => ({ eq: vi.fn().mockReturnThis(), error: null, then: (r: (v: unknown) => void) => r({ data: null, error: null }) })),
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
