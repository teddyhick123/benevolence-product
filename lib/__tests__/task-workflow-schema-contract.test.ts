import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const migrationsSrc = readdirSync('db/migrations')
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => readFileSync(join('db/migrations', file), 'utf8'))
  .join('\n');

const grantWorkflowSrc = [
  'components/grants/WorkflowManager.tsx',
  'components/grants/GrantHealthDashboard.tsx',
  'app/dashboard/grants/[grantId]/page.tsx',
  'app/api/portfolio/[id]/grants/route.ts',
  'app/api/portfolio/[id]/grants/export/route.ts',
]
  .map(file => readFileSync(file, 'utf8'))
  .join('\n');

const taskApiSrc = [
  'lib/api/repositories/tasks.ts',
  'app/api/org/[orgId]/tasks/route.ts',
  'app/api/org/[orgId]/tasks/[taskId]/route.ts',
  'app/api/org/[orgId]/tasks/[taskId]/comments/route.ts',
  'app/api/org/[orgId]/tasks/[taskId]/complete/route.ts',
  'app/api/org/[orgId]/tasks/[taskId]/reopen/route.ts',
]
  .map(file => readFileSync(file, 'utf8'))
  .join('\n');

const workflowApiSrc = [
  'app/api/org/[orgId]/workflow-templates/route.ts',
  'app/api/org/[orgId]/workflows/route.ts',
  'app/api/org/[orgId]/workflows/[workflowId]/tasks/[workflowTaskId]/route.ts',
]
  .map(file => readFileSync(file, 'utf8'))
  .join('\n');

function unique(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function parseDbObjects() {
  const tables = unique(
    Array.from(migrationsSrc.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi))
      .map(match => match[1])
  );
  const views = unique(
    Array.from(migrationsSrc.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi))
      .map(match => match[1])
  );
  return new Set([...tables, ...views]);
}

function parseFunctions() {
  return new Set(
    Array.from(migrationsSrc.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi))
      .map(match => match[1])
  );
}

describe('task/workflow schema contract', () => {
  it('grant workflow UI only references tables/views and RPCs present in active migrations', () => {
    const dbObjects = parseDbObjects();
    const functions = parseFunctions();

    const tableTargets = unique(
      Array.from(grantWorkflowSrc.matchAll(/\.from\(['"]([^'"]+)['"]\)/g))
        .map(match => match[1])
    );
    const rpcTargets = unique(
      Array.from(grantWorkflowSrc.matchAll(/\.rpc\(['"]([^'"]+)['"]/g))
        .map(match => match[1])
    );

    expect(tableTargets.filter(target => !dbObjects.has(target))).toEqual([]);
    expect(rpcTargets.filter(target => !functions.has(target))).toEqual([]);
  });

  it('task APIs only reference tables/views and RPCs present in active migrations', () => {
    const dbObjects = parseDbObjects();
    const functions = parseFunctions();

    const tableTargets = unique(
      Array.from(taskApiSrc.matchAll(/\.from\(['"]([^'"]+)['"]\)/g))
        .map(match => match[1])
    );
    const rpcTargets = unique(
      Array.from(taskApiSrc.matchAll(/\.rpc\(['"]([^'"]+)['"]/g))
        .map(match => match[1])
    );

    expect(tableTargets.filter(target => !dbObjects.has(target))).toEqual([]);
    expect(rpcTargets.filter(target => !functions.has(target))).toEqual([]);
  });

  it('workflow APIs only reference tables/views and RPCs present in active migrations', () => {
    const dbObjects = parseDbObjects();
    const functions = parseFunctions();

    const tableTargets = unique(
      Array.from(workflowApiSrc.matchAll(/\.from\(['"]([^'"]+)['"]\)/g))
        .map(match => match[1])
    );
    const rpcTargets = unique(
      Array.from(workflowApiSrc.matchAll(/\.rpc\(['"]([^'"]+)['"]/g))
        .map(match => match[1])
    );

    expect(tableTargets.filter(target => !dbObjects.has(target))).toEqual([]);
    expect(rpcTargets.filter(target => !functions.has(target))).toEqual([]);
  });

  it('workflow UI uses the org API layer for workflow mutations', () => {
    const workflowManager = readFileSync('components/grants/WorkflowManager.tsx', 'utf8');

    expect(workflowManager).toContain('/workflows');
    expect(workflowManager).not.toMatch(/\.from\(['"]workflow_instances['"]\)\s*\.\s*insert/);
    expect(workflowManager).not.toMatch(/\.from\(['"]workflow_tasks['"]\)\s*\.\s*insert/);
  });

  it('grant_management registry owned tables exist in active migrations', () => {
    const registry = readFileSync('lib/modules/registry.ts', 'utf8');
    const block = registry.match(/grant_management:\s*\{[\s\S]*?tables:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    const registryTables = unique(
      Array.from(block.matchAll(/['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g))
        .map(match => match[1])
    );
    const dbObjects = parseDbObjects();

    expect(registryTables.filter(table => !dbObjects.has(table))).toEqual([]);
  });

  it('workflow template seeds target a table created by active migrations', () => {
    const seed = readFileSync('db/seeds/workflow_templates.sql', 'utf8');
    const dbObjects = parseDbObjects();

    const seedTargets = unique(
      Array.from(seed.matchAll(/INSERT\s+INTO\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi))
        .map(match => match[1])
    );

    expect(seedTargets.filter(table => !dbObjects.has(table))).toEqual([]);
  });

  it('grant reports are aligned to the canonical grants lifecycle model', () => {
    // After the grant_details → grants rename, child tables reference grants(id)
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.grant_reports[\s\S]*grant_id\s+uuid NOT NULL REFERENCES public\.grants\(id\)/);
    expect(migrationsSrc).toContain('ALTER TABLE public.grant_reports ENABLE ROW LEVEL SECURITY');
    // grants table (the canonical lifecycle record) must exist
    expect(migrationsSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.grants\s*\(/);
    // grant_details must not exist as a CREATE TABLE
    expect(migrationsSrc).not.toMatch(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.grant_details\s*\(/);
  });
});
