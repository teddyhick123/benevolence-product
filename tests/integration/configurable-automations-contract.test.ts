// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('Phase 3 configurable automations contract', () => {
  const sql = readFileSync('db/migrations/0051_configurable_automations.sql', 'utf8');

  it('creates org automation rule and run tables', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.org_automation_rules/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.org_automation_runs/);
  });

  it('defines canonical trigger and action enums', () => {
    expect(sql).toMatch(/trigger_type IN \('grant_stage_change', 'date_relative', 'custom_field_set', 'task_completed'\)/);
    expect(sql).toMatch(/action_type IN \('create_task', 'notify_member', 'set_custom_field'\)/);
  });

  it('validates trigger and action config shapes', () => {
    expect(sql).toMatch(/org_automation_rule_trigger_shape/);
    expect(sql).toMatch(/trigger_config \? 'stage'/);
    expect(sql).toMatch(/trigger_config \? 'entity_type'/);
    expect(sql).toMatch(/trigger_config->>'anchor' IN \('grant_period_start', 'grant_period_end', 'created_at', 'updated_at'\)/);
    expect(sql).toMatch(/jsonb_typeof\(trigger_config->'offset_days'\) = 'number'/);
    expect(sql).toMatch(/trigger_config \? 'field_key'/);
    expect(sql).toMatch(/trigger_config \? 'task_type'/);
    expect(sql).toMatch(/org_automation_rule_action_shape/);
    expect(sql).toMatch(/action_config \? 'title_template'/);
    expect(sql).toMatch(/action_config \? 'message_template'/);
    expect(sql).toMatch(/action_config \? 'field_key'/);
    expect(sql).toMatch(/action_config \? 'value'/);
  });

  it('uses org-scoped RLS and admin writes', () => {
    expect(sql).toMatch(/can_view_org\(org_id\)/);
    expect(sql).toMatch(/is_org_admin\(org_id\)/);
    expect(sql).toMatch(/org_automation_runs_read/);
  });

  it('wires Builder tools and transition runtime evaluator', () => {
    const tools = readFileSync('lib/builder/tools.ts', 'utf8');
    const lifecycle = readFileSync('lib/grants/lifecycle.ts', 'utf8');
    const grantRepository = readFileSync('lib/api/repositories/grants.ts', 'utf8');
    expect(tools).toMatch(/create_automation_rule/);
    expect(tools).toMatch(/disable_automation_rule/);
    expect(tools).toMatch(/remove_automation_rule/);
    expect(lifecycle).toMatch(/runLifecycleAutomation/);
    expect(grantRepository).toMatch(/runAutomationRulesForEvent/);
    expect(grantRepository).toMatch(/grant_stage_change/);
  });

  it('wires dynamic automation triggers, actions, and producer registration', () => {
    const dynamicRules = readFileSync('lib/tasks/automation/dynamic-rules.ts', 'utf8');
    const automationRun = readFileSync('lib/tasks/automation/run.ts', 'utf8');
    const customFieldRepository = readFileSync('lib/api/repositories/custom-fields.ts', 'utf8');
    const taskRepository = readFileSync('lib/api/repositories/tasks.ts', 'utf8');
    const taskOutbox = readFileSync('lib/tasks/automation/outbox.ts', 'utf8');

    expect(dynamicRules).toMatch(/dateRelativeAutomationProducer/);
    expect(dynamicRules).toMatch(/notification_events/);
    expect(dynamicRules).toMatch(/org_custom_field_values/);
    expect(dynamicRules).toMatch(/options\.dryRun/);
    expect(automationRun).toMatch(/dynamic_automation_rules/);
    expect(automationRun).toMatch(/dateRelativeAutomationProducer/);
    expect(customFieldRepository).toMatch(/mutate_custom_field_values/);
    expect(customFieldRepository).toMatch(/drainCustomFieldAutomationOutbox/);
    expect(taskRepository).toMatch(/drainTaskAutomationOutbox/);
    expect(taskOutbox).toMatch(/task_completed/);
    expect(automationRun).toMatch(/task_automation_outbox/);
    expect(automationRun).toMatch(/custom_field_automation_outbox/);
  });

  it('captures automation preferences during onboarding discovery', () => {
    const onboardingAssistant = readFileSync('lib/onboarding/assistant.ts', 'utf8');
    expect(onboardingAssistant).toMatch(/automation_preferences/);
    expect(onboardingAssistant).toMatch(/desired reminders, automatic task creation, notifications, or field updates/);
  });
});
