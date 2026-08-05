// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('Phase 4 org-specific AI context contract', () => {
  const sql = readFileSync('db/migrations/0052_org_ai_context.sql', 'utf8');

  it('creates canonical org_ai_context schema with scoped enums', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.org_ai_context/);
    expect(sql).toMatch(/context_type IN \('operating_norm', 'naming_convention', 'process_rule', 'preference'\)/);
    expect(sql).toMatch(/source IN \('builder_chat', 'onboarding', 'ai_suggestion'\)/);
    expect(sql).toMatch(/UNIQUE \(org_id, context_key\)/);
  });

  it('uses org-scoped RLS and admin writes', () => {
    expect(sql).toMatch(/can_view_org\(org_id\)/);
    expect(sql).toMatch(/is_org_admin\(org_id\)/);
    expect(sql).toMatch(/org_ai_context_service/);
  });

  it('uses the shared admin guard and the caller session in the management route', () => {
    const route = readFileSync('app/api/org/[orgId]/ai-context/route.ts', 'utf8');
    expect(route).toContain("requireOrgAccess(orgId, 'admin')");
    expect(route).toContain('access.context.db');
    expect(route).toContain('jsonOk');
    expect(route).not.toContain('createAdminClient');
    expect(route).not.toContain('createServerClient');
  });

  it('wires helper loading and prompt injection', () => {
    const helper = readFileSync('lib/org-ai-context.ts', 'utf8');
    const context = readFileSync('lib/ai/assistant/context.ts', 'utf8');
    const prompts = readFileSync('lib/ai/assistant/prompts.ts', 'utf8');

    expect(helper).toMatch(/loadOrgAiContext/);
    expect(helper).toMatch(/formatOrgAiContextForPrompt/);
    expect(context).toMatch(/loadOrgAiContext/);
    expect(prompts).toMatch(/=== YOUR ORGANIZATION ===/);
    expect(prompts).toMatch(/suggest_context_entry/);
  });

  it('wires Builder context tools', () => {
    const tools = readFileSync('lib/builder/tools.ts', 'utf8');
    expect(tools).toMatch(/record_operating_norm/);
    expect(tools).toMatch(/record_naming_convention/);
    expect(tools).toMatch(/list_org_context/);
    expect(tools).toMatch(/update_org_context/);
    expect(tools).toMatch(/remove_org_context/);
    expect(tools).toMatch(/source: 'builder_chat'/);
  });

  it('wires confirmed assistant context suggestions', () => {
    const definitions = readFileSync('lib/ai/assistant/tool-definitions/core.ts', 'utf8');
    const executor = readFileSync(
      'lib/ai/assistant/executors/tools/suggest-context-entry.ts',
      'utf8'
    );
    const registry = readFileSync('lib/modules/registry.ts', 'utf8');

    expect(definitions).toMatch(/suggest_context_entry/);
    expect(definitions).toMatch(/explicit user confirmation/);
    expect(executor).toMatch(/executeSuggestContextEntry/);
    expect(executor).toMatch(/source: 'ai_suggestion'/);
    expect(registry).toMatch(/suggest_context_entry/);
  });

  it('captures and provisions onboarding context', () => {
    const onboarding = readFileSync('lib/onboarding-assistant.ts', 'utf8');
    const provision = readFileSync('lib/api/repositories/onboarding-provisioning.ts', 'utf8');
    const provisionConfig = readFileSync('lib/onboarding-provision-config.ts', 'utf8');

    expect(onboarding).toMatch(/org_context/);
    expect(onboarding).toMatch(/operating norms, naming conventions, process rules, or preferences/);
    expect(provision).toMatch(/contextRowsFromOnboardingProfile/);
    expect(provisionConfig).toMatch(/source: 'onboarding'/);
    expect(provision).toMatch(/org_ai_context/);
  });
});
