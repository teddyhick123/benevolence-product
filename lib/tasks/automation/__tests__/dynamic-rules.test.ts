// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

let _rules: any[] = [];
let _grant: any = null;
let _grantRows: any[] = [];
let _task: any = null;
let _runRows: any[] = [];
let _notificationRows: any[] = [];
let _customFieldDefinition: any = null;
let _customFieldValues: any[] = [];

const upsertGeneratedTask = vi.fn();

vi.mock('../task-writer', () => ({
  upsertGeneratedTask: (...args: any[]) => upsertGeneratedTask(...args),
}));

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => makeDb(),
}));

function makeDb() {
  return {
    from: (table: string) => {
      if (table === 'org_automation_rules') {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          then: (resolve: any) => Promise.resolve({ data: _rules, error: null }).then(resolve),
        };
        return b;
      }
      if (table === 'grants') {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          is: vi.fn(() => b),
          not: vi.fn(() => b),
          maybeSingle: vi.fn(async () => ({ data: _grant, error: null })),
          then: (resolve: any) => Promise.resolve({ data: _grantRows, error: null }).then(resolve),
        };
        return b;
      }
      if (table === 'tasks') {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          maybeSingle: vi.fn(async () => ({ data: _task, error: null })),
        };
        return b;
      }
      if (table === 'org_automation_runs') {
        return {
          insert: vi.fn(async (row: any) => {
            _runRows.push(row);
            return { error: null };
          }),
        };
      }
      if (table === 'notification_events') {
        return {
          upsert: vi.fn(async (row: any) => {
            _notificationRows.push(row);
            return { error: null };
          }),
        };
      }
      if (table === 'org_custom_field_definitions') {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          maybeSingle: vi.fn(async () => ({ data: _customFieldDefinition, error: null })),
        };
        return b;
      }
      if (table === 'org_custom_field_values') {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          maybeSingle: vi.fn(async () => ({ data: _customFieldValues[0] ?? null, error: null })),
          upsert: vi.fn(async (row: any) => {
            _customFieldValues.push(row);
            return { error: null };
          }),
        };
        return b;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn(async () => ({ error: null })),
      };
    },
  } as any;
}

import { dateRelativeAutomationProducer, runAutomationRulesForEvent } from '../dynamic-rules';

describe('runAutomationRulesForEvent', () => {
  beforeEach(() => {
    _rules = [];
    _grant = null;
    _grantRows = [];
    _task = null;
    _runRows = [];
    _notificationRows = [];
    _customFieldDefinition = null;
    _customFieldValues = [];
    upsertGeneratedTask.mockReset();
    upsertGeneratedTask.mockResolvedValue('created');
  });

  it('creates a task for a matching grant_stage_change create_task rule', async () => {
    _rules = [{
      id: 'rule-1',
      org_id: 'org-1',
      name: 'Active grant check-in',
      trigger_type: 'grant_stage_change',
      trigger_config: { stage: 'active' },
      conditions: [],
      action_type: 'create_task',
      action_config: {
        title_template: 'Schedule 90-day check-in: {{grant_name}}',
        description_template: 'Grant moved from {{from_stage}} to {{to_stage}}',
        due_days: 7,
        priority: 'normal',
        task_type: 'follow_up',
        assignee_field: 'internal_owner_id',
      },
    }];
    _grant = {
      id: 'grant-1',
      org_id: 'org-1',
      portfolio_id: 'portfolio-1',
      holding_id: 'holding-1',
      lifecycle_stage: 'active',
      requested_amount: 1000,
      approved_amount: 900,
      internal_owner_id: 'user-1',
      risk_level: 'low',
      holdings: { name: 'Community Clinic' },
    };

    const result = await runAutomationRulesForEvent(makeDb(), {
      orgId: 'org-1',
      triggerType: 'grant_stage_change',
      entityType: 'grant',
      entityId: 'grant-1',
      payload: { from_stage: 'agreement', to_stage: 'active' },
    });

    expect(result.created).toBe(1);
    expect(upsertGeneratedTask).toHaveBeenCalledTimes(1);
    expect(upsertGeneratedTask.mock.calls[0][1]).toMatchObject({
      orgId: 'org-1',
      portfolioId: 'portfolio-1',
      sourceKey: 'automation_rule:rule-1:grant:grant-1',
      title: 'Schedule 90-day check-in: Community Clinic',
      taskType: 'follow_up',
      priority: 'normal',
      assignedTo: 'user-1',
    });
    expect(_runRows).toHaveLength(1);
    expect(_runRows[0]).toMatchObject({ status: 'completed', rule_id: 'rule-1' });
  });

  it('skips active rules whose stage does not match', async () => {
    _rules = [{
      id: 'rule-2',
      org_id: 'org-1',
      name: 'Approved check-in',
      trigger_type: 'grant_stage_change',
      trigger_config: { stage: 'approved' },
      conditions: [],
      action_type: 'create_task',
      action_config: { title_template: 'Review {{grant_name}}' },
    }];

    const result = await runAutomationRulesForEvent(makeDb(), {
      orgId: 'org-1',
      triggerType: 'grant_stage_change',
      entityType: 'grant',
      entityId: 'grant-1',
      payload: { from_stage: 'agreement', to_stage: 'active' },
    });

    expect(result.skipped).toBe(1);
    expect(upsertGeneratedTask).not.toHaveBeenCalled();
    expect(_runRows[0]).toMatchObject({ status: 'skipped', result: { reason: 'stage_mismatch' } });
  });

  it('sends an in-app notification for a matching task_completed rule', async () => {
    _rules = [{
      id: 'rule-3',
      org_id: 'org-1',
      name: 'Notify assignee',
      trigger_type: 'task_completed',
      trigger_config: { task_type: 'review' },
      conditions: [],
      action_type: 'notify_member',
      action_config: {
        message_template: 'Task {{task_title}} was completed',
        title_template: 'Task completed',
        recipient_field: 'assigned_to',
      },
    }];
    _task = {
      id: 'task-1',
      org_id: 'org-1',
      portfolio_id: 'portfolio-1',
      title: 'Review report',
      task_type: 'review',
      assigned_to: 'user-2',
      status: 'completed',
      metadata: {},
    };

    const result = await runAutomationRulesForEvent(makeDb(), {
      orgId: 'org-1',
      triggerType: 'task_completed',
      entityType: 'task',
      entityId: 'task-1',
      payload: { task_type: 'review', actor_id: 'user-1' },
    });

    expect(result.created).toBe(1);
    expect(_notificationRows[0]).toMatchObject({
      org_id: 'org-1',
      recipient_user_id: 'user-2',
      event_type: 'automation_rule',
      channel: 'in_app',
    });
    expect(_notificationRows[0].payload.body).toContain('Review report');
  });

  it('sets a custom field for a matching custom_field_set rule', async () => {
    _rules = [{
      id: 'rule-4',
      org_id: 'org-1',
      name: 'Set follow-up flag',
      trigger_type: 'custom_field_set',
      trigger_config: { entity_type: 'grant', field_key: 'alignment_score' },
      conditions: [],
      action_type: 'set_custom_field',
      action_config: {
        entity_type: 'grant',
        field_key: 'needs_review',
        value: true,
      },
    }];
    _customFieldDefinition = {
      id: 'field-review',
      field_type: 'boolean',
      enum_options: null,
    };

    const result = await runAutomationRulesForEvent(makeDb(), {
      orgId: 'org-1',
      triggerType: 'custom_field_set',
      entityType: 'grant',
      entityId: 'grant-1',
      payload: { entity_type: 'grant', field_key: 'alignment_score', value: 2 },
    });

    expect(result.created).toBe(1);
    expect(_customFieldValues[0]).toMatchObject({
      org_id: 'org-1',
      entity_type: 'grant',
      entity_id: 'grant-1',
      field_definition_id: 'field-review',
      value_boolean: true,
    });
  });

  it('dateRelativeAutomationProducer fires date-relative grant rules for today', async () => {
    _rules = [{
      id: 'rule-5',
      org_id: 'org-1',
      name: 'Post-period check-in',
      trigger_type: 'date_relative',
      trigger_config: { entity_type: 'grant', anchor: 'grant_period_end', offset_days: 7 },
      conditions: [],
      action_type: 'create_task',
      action_config: { title_template: 'Check in on {{grant_name}}' },
    }];
    _grantRows = [{ id: 'grant-1', grant_period_end: '2026-07-01' }];
    _grant = {
      id: 'grant-1',
      org_id: 'org-1',
      portfolio_id: 'portfolio-1',
      holding_id: 'holding-1',
      lifecycle_stage: 'active',
      requested_amount: 1000,
      approved_amount: 900,
      internal_owner_id: null,
      risk_level: 'low',
      holdings: { name: 'Community Clinic' },
    };

    const results = await dateRelativeAutomationProducer({
      orgId: 'org-1',
      now: new Date('2026-07-08T12:00:00Z'),
    });

    expect(results[0].created).toBe(1);
    expect(upsertGeneratedTask).toHaveBeenCalled();
  });

  it('dateRelativeAutomationProducer does not execute matching rules during dry runs', async () => {
    _rules = [{
      id: 'rule-6',
      org_id: 'org-1',
      name: 'Dry run check-in',
      trigger_type: 'date_relative',
      trigger_config: { entity_type: 'grant', anchor: 'grant_period_end', offset_days: 7 },
      conditions: [],
      action_type: 'create_task',
      action_config: { title_template: 'Check in on {{grant_name}}' },
    }];
    _grantRows = [{ id: 'grant-1', grant_period_end: '2026-07-01' }];

    const results = await dateRelativeAutomationProducer({
      orgId: 'org-1',
      now: new Date('2026-07-08T12:00:00Z'),
      dryRun: true,
    });

    expect(results[0]).toMatchObject({ scanned: 1, skipped: 1, created: 0, updated: 0 });
    expect(upsertGeneratedTask).not.toHaveBeenCalled();
    expect(_runRows).toHaveLength(0);
  });
});
