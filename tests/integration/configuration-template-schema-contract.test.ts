// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (file: string) => readFileSync(file, 'utf8');

describe('configuration-template natural-key schema contract', () => {
  it('makes report templates atomically addressable per portfolio and name', () => {
    expect(read('db/migrations/0011_reports.sql'))
      .toMatch(/CONSTRAINT report_templates_portfolio_name_key UNIQUE \(portfolio_id, name\)/);
  });

  it('makes organization workflow templates atomically addressable by name', () => {
    const sql = read('db/migrations/0041_task_workflow_foundation.sql');
    expect(sql).toMatch(/CONSTRAINT workflow_templates_org_name_key UNIQUE \(org_id, name\)/);
    expect(sql).toMatch(/idx_workflow_templates_system_name[\s\S]*WHERE org_id IS NULL AND is_system = true/);
  });

  it('keeps the agent instruction copies and module template on canonical table names', () => {
    const agents = read('AGENTS.md');
    const claude = read('CLAUDE.md');
    const template = read('templates/module/README.md');

    expect(agents).toContain('org_automation_rules');
    expect(agents).toContain('org_workflow_config');
    expect(agents).not.toContain('configurable_automations');
    expect(agents).not.toContain('`workflow_config`');
    expect(claude).toContain('org_automation_rules');
    expect(claude).toContain('org_workflow_config');
    expect(claude).not.toContain('configurable_automations');
    expect(claude).not.toContain('`workflow_config`');
    expect(template).toContain('org_automation_rules');
    expect(template).toContain('org_workflow_config');
  });
});
