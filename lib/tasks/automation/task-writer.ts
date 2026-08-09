// lib/tasks/automation/task-writer.ts
import type { SupabaseClient } from '@/lib/database-client';
import type { UpsertGeneratedTaskInput } from './types';

export type UpsertResult = 'created' | 'updated' | 'skipped';

export async function upsertGeneratedTask(
  db: SupabaseClient,
  input: UpsertGeneratedTaskInput
): Promise<UpsertResult> {
  const { data, error } = await db.rpc('upsert_generated_task', {
    p_org_id: input.orgId,
    p_task: {
      portfolio_id: input.portfolioId ?? null,
      source_key: input.sourceKey,
      title: input.title,
      description: input.description,
      task_type: input.taskType,
      priority: input.priority,
      due_at: input.dueAt ?? null,
      assigned_to: input.assignedTo ?? null,
      metadata: input.metadata,
    },
    p_entity_links: input.links.map(link => ({
      entity_type: link.entityType,
      entity_id: link.entityId,
      relationship: link.relationship ?? 'primary',
    })),
    p_reopen_resolved: input.reopenResolved ?? false,
  });
  if (error) throw error;
  if (data !== 'created' && data !== 'updated' && data !== 'skipped') {
    throw new Error(`Unexpected generated task result: ${String(data)}`);
  }
  return data;
}

function assertPrefixSafe(prefix: string): void {
  const colonCount = (prefix.match(/:/g) ?? []).length;
  if (colonCount < 2) {
    throw new Error(
      `Source key prefix must contain at least 2 colons to be scoped to a single source record. Got: "${prefix}"`
    );
  }
}

async function settleGeneratedTasks(
  db: SupabaseClient,
  orgId: string,
  sourceKey: string,
  status: 'completed' | 'cancelled',
  reason: string,
  actorId: string | null
): Promise<number> {
  const matchPrefix = sourceKey.endsWith(':');
  if (matchPrefix) assertPrefixSafe(sourceKey);

  const { data, error } = await db.rpc('settle_generated_tasks', {
    p_org_id: orgId,
    p_source_key: sourceKey,
    p_match_prefix: matchPrefix,
    p_status: status,
    p_reason: reason,
    p_actor_id: actorId,
  });
  if (error) throw error;
  return data ?? 0;
}

export async function completeGeneratedTasks(
  db: SupabaseClient,
  orgId: string,
  sourceKey: string,
  reason: string,
  actorId: string | null = null
): Promise<number> {
  return settleGeneratedTasks(db, orgId, sourceKey, 'completed', reason, actorId);
}

export async function cancelGeneratedTasks(
  db: SupabaseClient,
  orgId: string,
  sourceKey: string,
  cancelReason: string,
  actorId: string | null = null
): Promise<number> {
  return settleGeneratedTasks(db, orgId, sourceKey, 'cancelled', cancelReason, actorId);
}
