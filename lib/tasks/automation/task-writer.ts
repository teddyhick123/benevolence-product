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
        input.links.map((l: TaskLink) => ({
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

function assertPrefixSafe(prefix: string): void {
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

  const baseQuery = db
    .from('tasks')
    .select('id, metadata')
    .eq('org_id', orgId)
    .eq('source', 'automation')
    .in('status', ['open', 'in_progress', 'blocked', 'waiting'])
    .is('deleted_at', null);

  const { data: tasks } = isPrefix
    ? await (baseQuery as any).like('source_key', `${sourceKey}%`)
    : await baseQuery.eq('source_key', sourceKey);

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

  const baseQuery = db
    .from('tasks')
    .select('id, metadata')
    .eq('org_id', orgId)
    .eq('source', 'automation')
    .in('status', ['open', 'in_progress', 'blocked', 'waiting'])
    .is('deleted_at', null);

  const { data: tasks } = isPrefix
    ? await (baseQuery as any).like('source_key', `${sourceKey}%`)
    : await baseQuery.eq('source_key', sourceKey);

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
