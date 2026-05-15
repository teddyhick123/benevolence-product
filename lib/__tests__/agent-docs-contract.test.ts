import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const AGENT_DOCS = ['AGENTS.md', 'CLAUDE.md'];

function readFiles(paths: string[]) {
  return paths.map(path => readFileSync(path, 'utf8')).join('\n');
}

function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap(name => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? listFiles(path) : [path];
    });
}

describe('agent docs contract', () => {
  const docs = readFiles(AGENT_DOCS);
  const templates = readFiles(listFiles('templates/module'));

  it('points agents at the split provider-neutral assistant modules', () => {
    expect(docs).toContain('/lib/ai/portfolio-assistant.ts');
    expect(docs).toContain('/lib/ai/assistant/tool-definitions.ts');
    expect(docs).toContain('/lib/ai/assistant/executor.ts');
    expect(docs).toContain('/lib/ai/assistant/prompts.ts');
    expect(docs).toContain('/lib/ai/assistant/context.ts');
    expect(docs).not.toContain('/lib/claude-assistant.ts');
    expect(docs).not.toContain('AI assistant (being refactored)');
  });

  it('documents the active schema canon for orgs and modules', () => {
    expect(docs).toContain('org_id');
    expect(docs).toContain('can_view_org(p_org_id)');
    expect(docs).toContain('user_org_role(p_org_id)');
    expect(docs).toContain('is_app_admin()');
    expect(docs).toContain('organizations.modules');
    expect(docs).toContain('org_has_module(p_org_id, p_module)');
  });

  it('module templates do not regenerate removed schema or provider patterns', () => {
    expect(templates).not.toMatch(/\borganization_id\b/);
    expect(templates).not.toContain('organization_modules');
    expect(templates).not.toContain('is_org_member');
    expect(templates).not.toContain('portfolio_metric_targets');
    expect(templates).not.toContain('p_module_id');
    expect(templates).not.toContain('@anthropic-ai/sdk');
    expect(templates).not.toContain('Anthropic.Tool');
    expect(templates).not.toContain('update_updated_at');
  });

  it('module templates use canonical org columns, RLS helpers, and module checks', () => {
    expect(templates).toContain('org_id');
    expect(templates).toContain('can_view_org');
    expect(templates).toContain('is_org_admin');
    expect(templates).toContain('org_has_module');
    expect(templates).toContain('ToolDefinition');
  });
});
