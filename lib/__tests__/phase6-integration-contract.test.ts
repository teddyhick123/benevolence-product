// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('Phase 6 integration and polish contract', () => {
  it('documents the Phase 6 implementation spec from the roadmap', () => {
    const roadmap = readFileSync('docs/CONFIGURABILITY_ROADMAP.md', 'utf8');
    const spec = readFileSync('docs/superpowers/specs/2026-07-08-phase6-integration-polish-design.md', 'utf8');

    expect(roadmap).toMatch(/2026-07-08-phase6-integration-polish-design\.md/);
    expect(spec).toMatch(/summarize_org_configuration/);
    expect(spec).toMatch(/builder_events/);
    expect(spec).toMatch(/report_templates/);
  });

  it('wires Builder as the all-configuration control panel', () => {
    const tools = readFileSync('lib/builder/tools.ts', 'utf8');
    const prompt = readFileSync('lib/builder/context-bundle.ts', 'utf8');

    expect(tools).toMatch(/name:\s*'summarize_org_configuration'/);
    expect(tools).toMatch(/name:\s*'list_builder_history'/);
    expect(tools).toMatch(/name:\s*'save_board_report_template'/);
    expect(tools).toMatch(/name:\s*'list_board_report_templates'/);
    expect(tools).toMatch(/org_workflow_config/);
    expect(tools).toMatch(/org_custom_field_definitions/);
    expect(tools).toMatch(/org_automation_rules/);
    expect(tools).toMatch(/org_ai_context/);
    expect(tools).toMatch(/org_view_config/);
    expect(tools).toMatch(/builder_events/);
    expect(prompt).toMatch(/self-service control panel/);
  });

  it('provisions all runtime configuration layers from onboarding', () => {
    const provision = readFileSync('app/api/onboarding/provision/route.ts', 'utf8');
    const builders = readFileSync('lib/onboarding-provision-config.ts', 'utf8');

    expect(provision).toMatch(/workflowRowsFromOnboardingProfile/);
    expect(provision).toMatch(/customFieldRowsFromOnboardingProfile/);
    expect(provision).toMatch(/automationRowsFromOnboardingProfile/);
    expect(provision).toMatch(/viewRowsFromOnboardingProfile/);
    expect(provision).toMatch(/org_workflow_config/);
    expect(provision).toMatch(/org_custom_field_definitions/);
    expect(provision).toMatch(/org_automation_rules/);
    expect(provision).toMatch(/org_view_config/);
    expect(provision).toMatch(/org_ai_context/);
    expect(builders).toMatch(/export function workflowRowsFromOnboardingProfile/);
    expect(builders).toMatch(/export function customFieldRowsFromOnboardingProfile/);
    expect(builders).toMatch(/export function automationRowsFromOnboardingProfile/);
    expect(builders).toMatch(/export function viewRowsFromOnboardingProfile/);
  });

  it('uses existing report_templates storage for Phase 6 board reports', () => {
    const tools = readFileSync('lib/builder/tools.ts', 'utf8');
    const migration = readFileSync('db/migrations/0011_reports.sql', 'utf8');
    const route = readFileSync('app/api/portfolio/[id]/board-report/route.ts', 'utf8');
    const generator = readFileSync('lib/pdf/board-report-generator.ts', 'utf8');

    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS report_templates/);
    expect(tools).toMatch(/report_type: 'board_report'/);
    expect(tools).toMatch(/content_order: sections/);
    expect(tools).toMatch(/custom_field_keys/);
    expect(tools).toMatch(/resolveOrgPortfolioId/);
    expect(route).toMatch(/template_id/);
    expect(route).toMatch(/use_default_template/);
    expect(route).toMatch(/report_templates/);
    expect(generator).toMatch(/sections/);
    expect(generator).toMatch(/hasSection\('holdings'\)/);
  });

  it('enables main assistant report template save and list tools', () => {
    const executor = readFileSync('lib/ai/assistant/executor.ts', 'utf8');
    const saveIdx = executor.indexOf("case 'save_report_template'");
    const listIdx = executor.indexOf("case 'list_report_templates'");

    expect(saveIdx).toBeGreaterThan(-1);
    expect(listIdx).toBeGreaterThan(-1);
    expect(executor.slice(saveIdx, saveIdx + 1400)).toMatch(/from\('report_templates'\)/);
    expect(executor.slice(saveIdx, saveIdx + 1400)).not.toMatch(/feature_not_available/);
    expect(executor.slice(listIdx, listIdx + 1000)).toMatch(/from\('report_templates'\)/);
    expect(executor.slice(listIdx, listIdx + 1000)).not.toMatch(/feature_not_available/);
  });
});
