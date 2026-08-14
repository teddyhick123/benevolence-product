import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';

const AGENT_DOCS = ['AGENTS.md', 'CLAUDE.md'];
const REFACTOR_FINDINGS = 'docs/agent-work/specs/2026-07-26-refactor-findings.md';
const BACKLOG = 'docs/agent-work/BACKLOG.md';

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

function activeDocumentationFiles(): string[] {
  return [
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'docs/README.md',
    'docs/agent-work/README.md',
    'docs/agent-work/BACKLOG.md',
    ...listFiles('docs/product'),
    ...listFiles('docs/engineering'),
    ...listFiles('docs/guides'),
  ].filter(path => path.endsWith('.md'));
}

function localMarkdownLinks(source: string): string[] {
  return Array.from(source.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g), match => match[1])
    .filter(link => !/^(?:https?:|mailto:|#)/.test(link));
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

  it('keeps links valid across current documentation without treating archives as canon', () => {
    for (const file of activeDocumentationFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const link of localMarkdownLinks(source)) {
        expect(existsSync(resolve(dirname(file), link)), `${file} links to ${link}`).toBe(true);
      }
    }
  });

  it('consolidates every unresolved refactor finding into the current backlog', () => {
    const refactorFindings = readFileSync(REFACTOR_FINDINGS, 'utf8');
    const backlog = readFileSync(BACKLOG, 'utf8');
    const coverage: Array<[string, string]> = [
      ['ignored `autoApprove` input', 'RF-22'],
      ['holding uploader AI-off mode is unrestricted', 'RF-23'],
      ['failed counts render as zero', 'RF-24'],
      ['widget positions use max-plus-one', 'RF-18'],
      ['nested preferences merge shallowly', 'RF-25'],
      ['delivery scan errors look empty', 'RF-26'],
      ['task jobs — run-log write failures are ignored', 'RF-27'],
      ['onboarding session core — lookup and telemetry failures remain opaque', 'RF-20'],
      ['legacy org-type recommendation keys remain stale', 'RF-21'],
    ];

    for (const [finding, item] of coverage) {
      expect(refactorFindings).toContain(finding);
      expect(backlog).toContain(item);
    }
  });

  it('gives smoke and deep walkthrough journeys independent CI budgets', () => {
    const workflow = readFileSync('.github/workflows/walkthrough-smoke.yml', 'utf8');

    expect(workflow).toContain('walkthrough-smoke:');
    expect(workflow).toContain('walkthrough-journeys:');
    expect(workflow.match(/timeout-minutes: 30/g)).toHaveLength(2);

    const smokeJob = workflow.slice(
      workflow.indexOf('  walkthrough-smoke:'),
      workflow.indexOf('  walkthrough-journeys:')
    );
    const journeysJob = workflow.slice(workflow.indexOf('  walkthrough-journeys:'));
    expect(smokeJob).toContain('npm run walkthrough:smoke');
    expect(smokeJob).not.toContain('npm run walkthrough:journeys');
    expect(journeysJob).toContain('npm run walkthrough:journeys');
    expect(journeysJob).not.toContain('npm run walkthrough:smoke');
  });
});
