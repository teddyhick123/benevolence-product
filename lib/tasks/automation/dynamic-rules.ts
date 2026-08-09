import type { SupabaseClient } from '@/lib/database-client';
import type { LifecycleStage } from '@/lib/grants/lifecycle-shared';
import { createAdminClient } from '@/lib/supabase';
import { CUSTOM_FIELD_ENTITY_TYPES, typedValuePatch, type CustomFieldEntityType } from '@/lib/custom-fields';
import { upsertGeneratedTask } from './task-writer';
import type { ProducerOptions, TaskEntityType, TaskProducerResult, UpsertGeneratedTaskInput } from './types';

export const AUTOMATION_TRIGGER_TYPES = ['grant_stage_change', 'date_relative', 'custom_field_set', 'task_completed'] as const;
export const AUTOMATION_ACTION_TYPES = ['create_task', 'notify_member', 'set_custom_field'] as const;
export const AUTOMATION_CONDITION_OPERATORS = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains'] as const;

export type AutomationTriggerType = typeof AUTOMATION_TRIGGER_TYPES[number];
export type AutomationActionType = typeof AUTOMATION_ACTION_TYPES[number];
export type AutomationConditionOperator = typeof AUTOMATION_CONDITION_OPERATORS[number];

export type AutomationEvent = {
  orgId: string;
  triggerType: AutomationTriggerType;
  entityType: 'grant' | 'holding' | 'donor' | 'contribution' | 'task' | 'custom_field';
  entityId: string;
  payload: Record<string, unknown>;
};

type AutomationRule = {
  id: string;
  org_id: string;
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  conditions: Array<Record<string, unknown>>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
};

type GrantAutomationRow = {
  id: string;
  org_id: string;
  portfolio_id: string | null;
  holding_id: string | null;
  lifecycle_stage: LifecycleStage;
  requested_amount: number | null;
  approved_amount: number | null;
  internal_owner_id: string | null;
  risk_level: string | null;
  holdings?: { name?: string | null } | null;
};

type TaskAutomationRow = {
  id: string;
  org_id: string;
  portfolio_id: string | null;
  title: string;
  task_type: string | null;
  assigned_to: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

function addDays(base: Date, days: number): string {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = context[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

function compareValues(actual: unknown, op: AutomationConditionOperator, expected: unknown): boolean {
  if (op === 'contains') return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
  if (op === 'eq') return actual === expected || String(actual ?? '') === String(expected ?? '');
  if (op === 'neq') return !(actual === expected || String(actual ?? '') === String(expected ?? ''));

  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  if (op === 'lt') return actualNumber < expectedNumber;
  if (op === 'lte') return actualNumber <= expectedNumber;
  if (op === 'gt') return actualNumber > expectedNumber;
  if (op === 'gte') return actualNumber >= expectedNumber;
  return false;
}

function conditionsMatch(conditions: Array<Record<string, unknown>>, context: Record<string, unknown>): boolean {
  for (const condition of conditions) {
    const field = typeof condition.field === 'string' ? condition.field : '';
    const op = condition.op as AutomationConditionOperator;
    if (!field || !AUTOMATION_CONDITION_OPERATORS.includes(op)) return false;
    if (!compareValues(context[field], op, condition.value)) return false;
  }
  return true;
}

async function logAutomationRun(
  db: SupabaseClient,
  event: AutomationEvent,
  ruleId: string,
  status: 'completed' | 'failed' | 'skipped',
  result: Record<string, unknown>
) {
  const outboxEventId = typeof event.payload.outbox_event_id === 'string'
    ? event.payload.outbox_event_id
    : null;
  const row = {
    org_id: event.orgId,
    rule_id: ruleId,
    trigger_entity_type: event.entityType,
    trigger_entity_id: event.entityId,
    idempotency_key: outboxEventId ? `${outboxEventId}:${ruleId}` : null,
    status,
    result,
  };
  const { error } = outboxEventId
    ? await db.from('org_automation_runs').upsert(row, { onConflict: 'idempotency_key' })
    : await db.from('org_automation_runs').insert(row);
  if (error) throw error;
}

async function loadGrantContext(db: SupabaseClient, orgId: string, grantId: string): Promise<GrantAutomationRow | null> {
  const { data, error } = await db
    .from('grants')
    .select('id, org_id, portfolio_id, holding_id, lifecycle_stage, requested_amount, approved_amount, internal_owner_id, risk_level, holdings(name)')
    .eq('id', grantId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data as GrantAutomationRow | null;
}

async function loadTaskContext(db: SupabaseClient, orgId: string, taskId: string): Promise<TaskAutomationRow | null> {
  const { data, error } = await db
    .from('tasks')
    .select('id, org_id, portfolio_id, title, task_type, assigned_to, status, metadata')
    .eq('id', taskId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data as TaskAutomationRow | null;
}

function taskEntityTypeFor(eventEntityType: AutomationEvent['entityType']): TaskEntityType | null {
  if (['grant', 'holding', 'donor', 'portfolio'].includes(eventEntityType)) return eventEntityType as TaskEntityType;
  return null;
}

async function runCreateTaskAction(
  db: SupabaseClient,
  event: AutomationEvent,
  rule: AutomationRule,
  context: Record<string, unknown>,
  primaryLink?: { entityType: TaskEntityType; entityId: string },
  extraLinks: Array<{ entityType: TaskEntityType; entityId: string }> = [],
  portfolioId?: string | null,
  assignedToFromContext?: string | null
): Promise<'created' | 'updated' | 'skipped'> {
  const action = rule.action_config;
  const dueDays = Number(action.due_days ?? 0);
  const priority = (action.priority as UpsertGeneratedTaskInput['priority'] | undefined) ?? 'normal';
  const taskType = (action.task_type as UpsertGeneratedTaskInput['taskType'] | undefined) ?? 'task';

  const assignedTo = action.assignee_field === 'internal_owner_id'
    ? assignedToFromContext
    : action.assignee_field === 'assigned_to'
      ? assignedToFromContext
    : typeof action.assigned_to === 'string'
      ? action.assigned_to
      : null;

  const links: UpsertGeneratedTaskInput['links'] = [];
  if (primaryLink) links.push({ ...primaryLink, relationship: 'primary' });
  for (const link of extraLinks) links.push({ ...link, relationship: 'context' });
  if (portfolioId) links.push({ entityType: 'portfolio', entityId: portfolioId, relationship: 'context' });

  return upsertGeneratedTask(db, {
    orgId: event.orgId,
    portfolioId,
    sourceKey: `automation_rule:${rule.id}:${event.entityType}:${event.entityId}`,
    title: renderTemplate(String(action.title_template), context).trim() || rule.name,
    description: renderTemplate(String(action.description_template ?? ''), context).trim(),
    taskType,
    priority,
    dueAt: Number.isFinite(dueDays) && dueDays !== 0 ? addDays(new Date(), dueDays) : null,
    assignedTo,
    metadata: {
      producer: 'dynamic_automation_rules',
      reason: rule.name,
      source_status: String(event.payload.to_stage ?? event.triggerType),
      automation_rule_id: rule.id,
      trigger_type: event.triggerType,
      generated_at: new Date().toISOString(),
    },
    links,
    reopenResolved: false,
  });
}

async function resolveNotificationRecipient(
  action: Record<string, unknown>,
  context: Record<string, unknown>,
  actorId: unknown
): Promise<string | null> {
  if (typeof action.recipient_user_id === 'string') return action.recipient_user_id;
  if (action.recipient_field === 'internal_owner_id' && typeof context.internal_owner_id === 'string') return context.internal_owner_id;
  if (action.recipient_field === 'assigned_to' && typeof context.assigned_to === 'string') return context.assigned_to;
  if (action.recipient_field === 'actor_id' && typeof actorId === 'string') return actorId;
  return null;
}

async function runNotifyMemberAction(
  db: SupabaseClient,
  event: AutomationEvent,
  rule: AutomationRule,
  context: Record<string, unknown>
): Promise<'created' | 'skipped'> {
  const action = rule.action_config;
  const recipientUserId = await resolveNotificationRecipient(action, context, event.payload.actor_id);
  if (!recipientUserId) return 'skipped';
  const priority = typeof action.priority === 'string' ? action.priority : 'normal';
  const href = typeof action.href_template === 'string'
    ? renderTemplate(action.href_template, context)
    : event.entityType === 'grant'
      ? `/dashboard/grants/${event.entityId}`
      : '/dashboard';

  const { error } = await db.from('notification_events').upsert({
    org_id: event.orgId,
    recipient_user_id: recipientUserId,
    actor_id: typeof event.payload.actor_id === 'string' ? event.payload.actor_id : null,
    event_type: 'automation_rule',
    channel: 'in_app',
    status: 'pending',
    priority,
    dedupe_key: `automation_rule:${rule.id}:${event.entityType}:${event.entityId}`,
    payload: {
      title: renderTemplate(String(action.title_template ?? rule.name), context),
      body: renderTemplate(String(action.message_template), context),
      href,
      automation_rule_id: rule.id,
    },
  }, { onConflict: 'org_id,recipient_user_id,channel,dedupe_key' });
  if (error) throw error;
  return 'created';
}

async function runSetCustomFieldAction(
  db: SupabaseClient,
  event: AutomationEvent,
  rule: AutomationRule,
  context: Record<string, unknown>
): Promise<'created' | 'updated' | 'skipped'> {
  const action = rule.action_config;
  const entityType = (action.entity_type ?? event.entityType) as CustomFieldEntityType;
  const entityId = typeof action.entity_id === 'string'
    ? renderTemplate(action.entity_id, context)
    : event.entityId;
  const fieldKey = String(action.field_key ?? '');
  if (!CUSTOM_FIELD_ENTITY_TYPES.includes(entityType) || !fieldKey) return 'skipped';

  const { data: definition, error: defErr } = await db
    .from('org_custom_field_definitions')
    .select('id, field_type, enum_options')
    .eq('org_id', event.orgId)
    .eq('entity_type', entityType)
    .eq('field_key', fieldKey)
    .maybeSingle();
  if (defErr) throw defErr;
  if (!definition) return 'skipped';

  const rawValue = typeof action.value === 'string' ? renderTemplate(action.value, context) : action.value;
  const patch = typedValuePatch(definition as any, rawValue);
  if (!patch) return 'skipped';

  const { data: existing, error: existingErr } = await db
    .from('org_custom_field_values')
    .select('id')
    .eq('org_id', event.orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('field_definition_id', definition.id)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const { error } = await db
    .from('org_custom_field_values')
    .upsert({
      org_id: event.orgId,
      entity_type: entityType,
      entity_id: entityId,
      field_definition_id: definition.id,
      ...patch,
    }, { onConflict: 'entity_id,field_definition_id' });
  if (error) throw error;
  return existing ? 'updated' : 'created';
}

async function runConfiguredAction(
  db: SupabaseClient,
  event: AutomationEvent,
  rule: AutomationRule,
  context: Record<string, unknown>,
  options: {
    primaryLink?: { entityType: TaskEntityType; entityId: string };
    extraLinks?: Array<{ entityType: TaskEntityType; entityId: string }>;
    portfolioId?: string | null;
    assignedTo?: string | null;
  } = {}
): Promise<'created' | 'updated' | 'skipped'> {
  if (rule.action_type === 'create_task') {
    return runCreateTaskAction(db, event, rule, context, options.primaryLink, options.extraLinks ?? [], options.portfolioId, options.assignedTo);
  }
  if (rule.action_type === 'notify_member') {
    return runNotifyMemberAction(db, event, rule, context);
  }
  if (rule.action_type === 'set_custom_field') {
    return runSetCustomFieldAction(db, event, rule, context);
  }
  return 'skipped';
}

export async function runAutomationRulesForEvent(
  db: SupabaseClient,
  event: AutomationEvent
): Promise<TaskProducerResult> {
  const result: TaskProducerResult = {
    producer: 'dynamic_automation_rules',
    orgId: event.orgId,
    scanned: 0,
    created: 0,
    updated: 0,
    completed: 0,
    skipped: 0,
    errors: [],
  };

  const { data: rules, error } = await db
    .from('org_automation_rules')
    .select('id, org_id, name, trigger_type, trigger_config, conditions, action_type, action_config')
    .eq('org_id', event.orgId)
    .eq('trigger_type', event.triggerType)
    .eq('is_active', true);
  if (error) throw error;

  if (!rules || rules.length === 0) return result;

  let grant: GrantAutomationRow | null = null;
  if (event.entityType === 'grant') {
    grant = await loadGrantContext(db, event.orgId, event.entityId);
  }
  let task: TaskAutomationRow | null = null;
  if (event.entityType === 'task') {
    const snapshot = event.payload.task_snapshot;
    task = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? snapshot as TaskAutomationRow
      : await loadTaskContext(db, event.orgId, event.entityId);
  }

  for (const rule of (rules ?? []) as AutomationRule[]) {
    result.scanned++;
    try {
      if (typeof event.payload.rule_id === 'string' && event.payload.rule_id !== rule.id) {
        result.skipped++;
        continue;
      }
      let context: Record<string, unknown> = {
        entity_type: event.entityType,
        entity_id: event.entityId,
        trigger_type: event.triggerType,
        ...event.payload,
      };
      let primaryLink: { entityType: TaskEntityType; entityId: string } | undefined;
      let extraLinks: Array<{ entityType: TaskEntityType; entityId: string }> = [];
      let portfolioId: string | null | undefined;
      let assignedTo: string | null | undefined;

      if (event.triggerType === 'grant_stage_change') {
        if (rule.trigger_config.stage !== event.payload.to_stage) {
          result.skipped++;
          await logAutomationRun(db, event, rule.id, 'skipped', { reason: 'stage_mismatch' });
          continue;
        }
        if (!grant) {
          result.skipped++;
          await logAutomationRun(db, event, rule.id, 'skipped', { reason: 'grant_not_found' });
          continue;
        }
        context = {
          ...context,
          grant_id: grant.id,
          grant_name: grant.holdings?.name ?? 'grant',
          lifecycle_stage: grant.lifecycle_stage,
          requested_amount: grant.requested_amount,
          approved_amount: grant.approved_amount,
          internal_owner_id: grant.internal_owner_id,
          risk_level: grant.risk_level,
        };
        primaryLink = { entityType: 'grant', entityId: grant.id };
        if (grant.holding_id) extraLinks.push({ entityType: 'holding', entityId: grant.holding_id });
        portfolioId = grant.portfolio_id;
        assignedTo = grant.internal_owner_id;
      } else if (event.triggerType === 'custom_field_set') {
        if (rule.trigger_config.entity_type !== event.payload.entity_type || rule.trigger_config.field_key !== event.payload.field_key) {
          result.skipped++;
          await logAutomationRun(db, event, rule.id, 'skipped', { reason: 'custom_field_mismatch' });
          continue;
        }
        const linkType = taskEntityTypeFor(String(event.payload.entity_type) as AutomationEvent['entityType']);
        if (linkType) primaryLink = { entityType: linkType, entityId: event.entityId };
      } else if (event.triggerType === 'task_completed') {
        if (!task) {
          result.skipped++;
          await logAutomationRun(db, event, rule.id, 'skipped', { reason: 'task_not_found' });
          continue;
        }
        if (rule.trigger_config.task_type && rule.trigger_config.task_type !== task.task_type) {
          result.skipped++;
          await logAutomationRun(db, event, rule.id, 'skipped', { reason: 'task_type_mismatch' });
          continue;
        }
        context = {
          ...context,
          task_id: task.id,
          task_title: task.title,
          task_type: task.task_type,
          assigned_to: task.assigned_to,
          status: task.status,
        };
        portfolioId = task.portfolio_id;
        assignedTo = task.assigned_to;
      } else if (event.triggerType === 'date_relative') {
        if (rule.trigger_config.entity_type && rule.trigger_config.entity_type !== event.entityType) {
          result.skipped++;
          await logAutomationRun(db, event, rule.id, 'skipped', { reason: 'entity_type_mismatch' });
          continue;
        }
        if (rule.trigger_config.anchor && rule.trigger_config.anchor !== event.payload.anchor) {
          result.skipped++;
          await logAutomationRun(db, event, rule.id, 'skipped', { reason: 'anchor_mismatch' });
          continue;
        }
        if (grant) {
          context = {
            ...context,
            grant_id: grant.id,
            grant_name: grant.holdings?.name ?? 'grant',
            lifecycle_stage: grant.lifecycle_stage,
            requested_amount: grant.requested_amount,
            approved_amount: grant.approved_amount,
            internal_owner_id: grant.internal_owner_id,
            risk_level: grant.risk_level,
          };
          primaryLink = { entityType: 'grant', entityId: grant.id };
          if (grant.holding_id) extraLinks.push({ entityType: 'holding', entityId: grant.holding_id });
          portfolioId = grant.portfolio_id;
          assignedTo = grant.internal_owner_id;
        }
      } else {
        result.skipped++;
        await logAutomationRun(db, event, rule.id, 'skipped', { reason: 'trigger_not_implemented' });
        continue;
      }

      if (!conditionsMatch(rule.conditions ?? [], context)) {
        result.skipped++;
        await logAutomationRun(db, event, rule.id, 'skipped', { reason: 'conditions_not_met' });
        continue;
      }

      const actionResult = await runConfiguredAction(db, event, rule, context, { primaryLink, extraLinks, portfolioId, assignedTo });
      if (actionResult === 'created') result.created++;
      else if (actionResult === 'updated') result.updated++;
      else result.skipped++;
      await logAutomationRun(db, event, rule.id, actionResult === 'skipped' ? 'skipped' : 'completed', { action_result: actionResult });
    } catch (err: any) {
      result.errors.push({ sourceType: 'org_automation_rules', sourceId: rule.id, message: err?.message ?? String(err) });
      await logAutomationRun(db, event, rule.id, 'failed', { error: err?.message ?? String(err) });
    }
  }

  return result;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysToDateString(dateString: string, days: number): string | null {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}

export async function dateRelativeAutomationProducer(
  options: ProducerOptions
): Promise<TaskProducerResult[]> {
  const { orgId, now: nowOverride } = options;
  if (!orgId) return [];

  const db = createAdminClient();
  const today = dateOnly(nowOverride ?? new Date());
  const result: TaskProducerResult = {
    producer: 'dynamic_automation_rules',
    orgId,
    scanned: 0,
    created: 0,
    updated: 0,
    completed: 0,
    skipped: 0,
    errors: [],
  };

  const { data: rules, error } = await db
    .from('org_automation_rules')
    .select('id, trigger_config')
    .eq('org_id', orgId)
    .eq('trigger_type', 'date_relative')
    .eq('is_active', true);
  if (error) throw error;

  for (const rule of (rules ?? []) as Array<{ id: string; trigger_config: Record<string, unknown> }>) {
    const entityType = rule.trigger_config.entity_type;
    const anchor = String(rule.trigger_config.anchor ?? '');
    const offsetDays = Number(rule.trigger_config.offset_days ?? 0);
    if (entityType !== 'grant' || !anchor || !Number.isFinite(offsetDays)) {
      result.skipped++;
      continue;
    }

    const allowedGrantAnchors = new Set(['grant_period_start', 'grant_period_end', 'created_at', 'updated_at']);
    if (!allowedGrantAnchors.has(anchor)) {
      result.skipped++;
      continue;
    }

    const { data: grants, error: grantsErr } = await db
      .from('grants')
      .select(`id, ${anchor}`)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .not(anchor, 'is', null);
    if (grantsErr) {
      result.errors.push({ sourceType: 'org_automation_rules', sourceId: rule.id, message: grantsErr.message });
      continue;
    }

    for (const grant of grants ?? []) {
      result.scanned++;
      const anchorValue = String((grant as any)[anchor]).slice(0, 10);
      const fireDate = addDaysToDateString(anchorValue, offsetDays);
      if (fireDate !== today) {
        result.skipped++;
        continue;
      }
      if (options.dryRun) {
        result.skipped++;
        continue;
      }

      const eventResult = await runAutomationRulesForEvent(db, {
        orgId,
        triggerType: 'date_relative',
        entityType: 'grant',
        entityId: (grant as any).id,
        payload: {
          rule_id: rule.id,
          anchor,
          anchor_value: anchorValue,
          fire_date: fireDate,
        },
      });
      result.created += eventResult.created;
      result.updated += eventResult.updated;
      result.completed += eventResult.completed;
      result.skipped += eventResult.skipped;
      result.errors.push(...eventResult.errors);
    }
  }

  return [result];
}
