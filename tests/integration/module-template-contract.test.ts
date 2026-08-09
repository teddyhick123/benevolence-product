// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'templates', 'module');

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const combined = walk(ROOT).map((file) => readFileSync(file, 'utf8')).join('\n');

describe('module template boundaries', () => {
  it('teaches data-driven extensibility before DDL', () => {
    const guide = read('README.md');
    for (const extensionPoint of [
      'custom_fields',
      'metric_facts',
      'widgets',
      'org_view_config',
      'configurable_automations',
      'workflow_config',
      'organizations.modules',
    ]) {
      expect(guide).toContain(extensionPoint);
    }
    expect(guide).toContain('genuine product increment');
    expect(guide).toContain('regenerated `lib/database.types.ts`');
  });

  it('uses guards, scoped repositories, and shared response helpers', () => {
    for (const route of ['api/route.ts', 'api/[id]/route.ts']) {
      const source = read(route);
      expect(source).toContain('requireOrgAccess');
      expect(source).toContain('org_has_module');
      expect(source).toContain('create{ModuleName}Repository');
      expect(source).toContain('jsonOk');
      expect(source).toContain('jsonError');
    }
    const repository = read('lib/repository.ts');
    expect(repository).toContain(".eq('org_id', scope.orgId)");
    expect(repository).toContain('createElevatedClient');
  });

  it('keeps browser transport and data ownership out of components', () => {
    expect(read('lib/hooks.ts')).toContain("from '@/lib/api/client'");
    expect(read('lib/hooks.ts')).toContain("from '@/lib/api/client-hooks'");
    expect(read('app/PageContent.tsx')).toContain("from '@/lib/{module_name}/hooks'");
    expect(combined).not.toMatch(/\bfetch\s*\(/);
    expect(combined).not.toContain('@supabase/auth-helpers-nextjs');
  });

  it('preserves scoped AI capabilities and durable request idempotency', () => {
    const tools = read('lib/tools.ts');
    expect(tools).toContain('runtime.capabilities');
    expect(tools).not.toContain('context.supabase');
    expect(tools).toContain('ai_turns');
    expect(tools).toContain('ai_messages');
    expect(tools).toContain('request-ID idempotency');
  });

  it('uses the canonical org-scoped migration shape', () => {
    const migration = read('db/migration.sql');
    expect(migration).toContain('org_id UUID NOT NULL');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('public.can_view_org(org_id)');
    expect(migration).toContain('public.is_org_admin(org_id)');
    expect(migration).toContain('TO service_role');
    expect(combined).not.toContain('/db/00XX_');
  });
});
