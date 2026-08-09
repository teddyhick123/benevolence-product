import { describe, expect, it, vi } from 'vitest';
import {
  cancelGeneratedTasks,
  completeGeneratedTasks,
  upsertGeneratedTask,
} from '../task-writer';
import type { UpsertGeneratedTaskInput } from '../types';

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

function makeDb(data: unknown = null, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) } as any;
}

describe('upsertGeneratedTask', () => {
  it('delegates the task, links, and audit event to one scoped RPC', async () => {
    const db = makeDb('created');

    await expect(upsertGeneratedTask(db, baseInput)).resolves.toBe('created');
    expect(db.rpc).toHaveBeenCalledWith('upsert_generated_task', {
      p_org_id: 'org-1',
      p_task: {
        portfolio_id: null,
        source_key: baseInput.sourceKey,
        title: baseInput.title,
        description: baseInput.description,
        task_type: baseInput.taskType,
        priority: baseInput.priority,
        due_at: baseInput.dueAt,
        assigned_to: null,
        metadata: baseInput.metadata,
      },
      p_entity_links: [
        { entity_type: 'pledge_installment', entity_id: 'inst-1', relationship: 'primary' },
        { entity_type: 'pledge', entity_id: 'pledge-1', relationship: 'context' },
      ],
      p_reopen_resolved: false,
    });
  });

  it('accepts only the canonical RPC outcomes', async () => {
    await expect(upsertGeneratedTask(makeDb('skipped'), baseInput)).resolves.toBe('skipped');
    await expect(upsertGeneratedTask(makeDb('unexpected'), baseInput)).rejects.toThrow(
      'Unexpected generated task result'
    );
  });
});

describe('generated task settlement', () => {
  it('atomically completes an exact source key', async () => {
    const db = makeDb(2);
    await expect(
      completeGeneratedTasks(db, 'org-1', baseInput.sourceKey, 'Installment paid')
    ).resolves.toBe(2);
    expect(db.rpc).toHaveBeenCalledWith('settle_generated_tasks', {
      p_org_id: 'org-1',
      p_source_key: baseInput.sourceKey,
      p_match_prefix: false,
      p_status: 'completed',
      p_reason: 'Installment paid',
      p_actor_id: null,
    });
  });

  it('atomically cancels a safe source prefix', async () => {
    const db = makeDb(3);
    await expect(
      cancelGeneratedTasks(db, 'org-1', 'import_job:job-1:', 'Import cancelled', 'actor-1')
    ).resolves.toBe(3);
    expect(db.rpc).toHaveBeenCalledWith('settle_generated_tasks', {
      p_org_id: 'org-1',
      p_source_key: 'import_job:job-1:',
      p_match_prefix: true,
      p_status: 'cancelled',
      p_reason: 'Import cancelled',
      p_actor_id: 'actor-1',
    });
  });

  it('rejects an under-scoped prefix before calling the database', async () => {
    const db = makeDb(0);
    await expect(
      completeGeneratedTasks(db, 'org-1', 'pledge_installment:', 'reason')
    ).rejects.toThrow('at least 2 colons');
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('propagates transactional RPC failures', async () => {
    await expect(
      completeGeneratedTasks(makeDb(null, new Error('transaction failed')), 'org-1', baseInput.sourceKey, 'reason')
    ).rejects.toThrow('transaction failed');
  });
});
