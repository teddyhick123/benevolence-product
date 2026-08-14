import type { SupabaseClient } from '@/lib/database-client';
import { createElevatedClient } from '@/lib/api/admin-client';
import { runAutomationRulesForEvent } from './dynamic-rules';
import type { ProducerOptions, TaskProducerResult } from './types';

type CustomFieldAutomationOutboxRow = {
  id: string;
  org_id: string;
  event_type: 'custom_field_set';
  entity_type: 'grant' | 'holding' | 'donor' | 'contribution';
  entity_id: string;
  payload: Record<string, unknown>;
};

type DrainOptions = {
  orgId?: string;
  eventId?: string;
  limit?: number;
};

/** Drain durable custom-field automation events after their value mutation commits. */
export async function drainCustomFieldAutomationOutbox(
  db: SupabaseClient,
  options: DrainOptions = {}
): Promise<TaskProducerResult> {
  const result: TaskProducerResult = {
    producer: 'custom_field_automation_outbox',
    orgId: options.orgId,
    scanned: 0,
    created: 0,
    updated: 0,
    completed: 0,
    skipped: 0,
    errors: [],
  };

  const { data, error } = await db.rpc('claim_org_automation_outbox', {
    p_limit: options.limit ?? 50,
    p_org_id: options.orgId ?? null,
    p_event_id: options.eventId ?? null,
  });
  if (error) throw error;

  for (const event of (data ?? []) as CustomFieldAutomationOutboxRow[]) {
    result.scanned++;
    try {
      const automation = await runAutomationRulesForEvent(db, {
        orgId: event.org_id,
        triggerType: event.event_type,
        entityType: event.entity_type,
        entityId: event.entity_id,
        payload: { ...event.payload, outbox_event_id: event.id },
      });

      result.created += automation.created;
      result.updated += automation.updated;
      result.completed += automation.completed;
      result.skipped += automation.skipped;
      if (automation.errors.length > 0) {
        throw new Error(automation.errors.map(item => item.message).join('; '));
      }

      const { error: finishError } = await db.rpc('finish_org_automation_outbox', {
        p_event_id: event.id,
        p_succeeded: true,
        p_error: null,
      });
      if (finishError) throw finishError;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { error: finishError } = await db.rpc('finish_org_automation_outbox', {
        p_event_id: event.id,
        p_succeeded: false,
        p_error: message,
      });
      result.errors.push({
        sourceType: 'org_automation_outbox',
        sourceId: event.id,
        message: finishError ? `${message} (retry state failed: ${finishError.message})` : message,
      });
    }
  }

  return result;
}

export async function customFieldAutomationOutboxProducer(
  options: ProducerOptions
): Promise<TaskProducerResult[]> {
  if (options.dryRun) {
    return [{
      producer: 'custom_field_automation_outbox', orgId: options.orgId,
      scanned: 0, created: 0, updated: 0, completed: 0, skipped: 0, errors: [],
    }];
  }

  return [await drainCustomFieldAutomationOutbox(createElevatedClient(), {
    orgId: options.orgId,
  })];
}
