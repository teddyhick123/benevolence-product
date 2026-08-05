// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('Phase 5 view config contract', () => {
  const sql = readFileSync('db/migrations/0053_org_view_config.sql', 'utf8');

  it('creates canonical org_view_config schema', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.org_view_config/);
    expect(sql).toMatch(/config_scope IN \('dashboard', 'module_default', 'table_columns', 'entity_vocabulary'\)/);
    expect(sql).toMatch(/UNIQUE \(org_id, config_scope, scope_key\)/);
  });

  it('uses org-scoped RLS and admin writes', () => {
    expect(sql).toMatch(/can_view_org\(org_id\)/);
    expect(sql).toMatch(/is_org_admin\(org_id\)/);
    expect(sql).toMatch(/org_view_config_service/);
  });

  it('wires Builder tools for configurable views and vocabulary', () => {
    const tools = readFileSync('lib/builder/tools.ts', 'utf8');
    expect(tools).toMatch(/set_dashboard_layout/);
    expect(tools).toMatch(/set_module_default_view/);
    expect(tools).toMatch(/set_table_columns/);
    expect(tools).toMatch(/rename_entity/);
    expect(tools).toMatch(/list_view_config/);
    expect(tools).toMatch(/org_view_config/);
  });

  it('wires runtime view config surfaces', () => {
    const dashboard = readFileSync('app/dashboard/page.tsx', 'utf8');
    const grantsPage = readFileSync('app/dashboard/grants/page.tsx', 'utf8');
    const grantTable = readFileSync('components/grants/GrantTableView.tsx', 'utf8');
    const api = readFileSync('app/api/org/[orgId]/view-config/route.ts', 'utf8');

    expect(dashboard).toMatch(/resolveDashboardSections/);
    expect(grantsPage).toMatch(/module_default/);
    expect(grantsPage).toMatch(/useEntityVocabulary/);
    expect(grantTable).toMatch(/resolveGrantsTableColumns/);
    expect(api).toMatch(/include_vocabulary/);
    expect(api).toContain('requireOrgAccess');
    expect(api).toContain('access.context.db');
    expect(api).toContain('jsonOk');
    expect(api).not.toContain('createAdminClient');
    expect(api).not.toContain('createServerClient');
  });

  it('injects entity vocabulary into assistant context and onboarding', () => {
    const context = readFileSync('lib/ai/assistant/context.ts', 'utf8');
    const prompts = readFileSync('lib/ai/assistant/prompts.ts', 'utf8');
    const onboarding = readFileSync('lib/onboarding-assistant.ts', 'utf8');
    const provision = readFileSync('lib/api/repositories/onboarding-provisioning.ts', 'utf8');

    expect(context).toMatch(/loadEntityVocabulary/);
    expect(prompts).toMatch(/=== ENTITY VOCABULARY ===/);
    expect(prompts).toMatch(/tool arguments canonical/);
    expect(onboarding).toMatch(/view_preferences/);
    expect(provision).toMatch(/viewRowsFromOnboardingProfile/);
  });
});
