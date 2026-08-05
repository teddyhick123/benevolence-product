// @vitest-environment node
// lib/__tests__/grant-lifecycle-contract.test.ts
//
// Contract tests that define the TARGET state for the grant lifecycle refactor.
// These tests FAIL before Task 2 (rename grant_details to grants) and should
// ALL PASS once the migration and code sweep are complete.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function readMigrations(): string {
  const migDir = join(ROOT, 'db/migrations');
  return readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(migDir, f), 'utf8'))
    .join('\n');
}

const migrations = readMigrations();
const executorSrc = read('lib/ai/assistant/executor.ts');
const grantsExecutorSrc = read('lib/ai/assistant/executors/grants.ts');
const grantToolExecutor = (tool: string) => read(
  `lib/ai/assistant/executors/tools/${tool.replaceAll('_', '-')}.ts`
);

// ---------------------------------------------------------------------------
// 1. Canonical table is `grants`, not `grant_details`
// ---------------------------------------------------------------------------
describe('Canonical grant table naming', () => {
  it('migrations define public.grants as a CREATE TABLE', () => {
    expect(migrations).toMatch(
      /CREATE TABLE\s+IF NOT EXISTS\s+public\.grants\s*\(/i
    );
  });

  it('migrations do NOT define public.grant_details as a CREATE TABLE', () => {
    expect(migrations).not.toMatch(
      /CREATE TABLE\s+(IF NOT EXISTS\s+)?public\.grant_details\s*\(/i
    );
  });

  it('grants child tables FK to public.grants, not public.grant_details', () => {
    // All grant child table FKs should reference grants(id)
    const grantChildFkPattern = /REFERENCES\s+public\.grant_details\s*\(id\)/i;
    expect(migrations).not.toMatch(grantChildFkPattern);
  });

  it('views and RPCs reference public.grants, not public.grant_details', () => {
    // v_grants, v_grant_health, get_upcoming_deadlines should use grants
    expect(migrations).not.toMatch(/FROM\s+public\.grant_details\b/i);
    expect(migrations).not.toMatch(/JOIN\s+public\.grant_details\b/i);
  });
});

// ---------------------------------------------------------------------------
// 2. grants table has required columns
// ---------------------------------------------------------------------------
describe('grants table has required lifecycle columns', () => {
  // Extract the grants table definition block from migrations
  function getGrantsTableBlock(): string {
    const match = migrations.match(
      /CREATE TABLE\s+IF NOT EXISTS\s+public\.grants\s*\(([\s\S]*?)\);/i
    );
    return match ? match[1] : '';
  }

  const grantsBlock = getGrantsTableBlock();

  const requiredColumns = [
    'org_id',
    'portfolio_id',
    'holding_id',
    'lifecycle_stage',
    'requested_amount',
    'approved_amount',
    'internal_owner_id',
  ];

  for (const col of requiredColumns) {
    it(`grants table has column "${col}"`, () => {
      const colPattern = new RegExp(`\\b${col}\\b`, 'i');
      expect(colPattern.test(grantsBlock)).toBe(true);
    });
  }

  it('grants.lifecycle_stage has a CHECK constraint with canonical stages', () => {
    expect(migrations).toMatch(/lifecycle_stage[\s\S]*?CHECK\s*\(/i);
    // Spot-check a few canonical stage values
    expect(migrations).toContain("'draft'");
    expect(migrations).toContain("'due_diligence'");
    expect(migrations).toContain("'approved'");
    expect(migrations).toContain("'closed'");
  });

  it('grants has a UNIQUE constraint on holding_id', () => {
    expect(migrations).toMatch(/UNIQUE\s*\(\s*holding_id\s*\)/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Audit / history tables exist
// ---------------------------------------------------------------------------
describe('Grant audit tables exist in migrations', () => {
  it('grant_status_history is defined', () => {
    expect(migrations).toMatch(
      /CREATE TABLE\s+(IF NOT EXISTS\s+)?public\.grant_status_history\s*\(/i
    );
  });

  it('grant_decisions is defined', () => {
    expect(migrations).toMatch(
      /CREATE TABLE\s+(IF NOT EXISTS\s+)?public\.grant_decisions\s*\(/i
    );
  });

  it('grant_status_history has grant_id, from_stage, to_stage, actor_id', () => {
    const block = migrations.match(
      /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.grant_status_history\s*\(([\s\S]*?)\);/i
    )?.[1] ?? '';
    expect(block).toMatch(/\bgrant_id\b/i);
    expect(block).toMatch(/\bfrom_stage\b/i);
    expect(block).toMatch(/\bto_stage\b/i);
    expect(block).toMatch(/\bactor_id\b/i);
  });

  it('grant_decisions has decision_type, decision, decided_by', () => {
    const block = migrations.match(
      /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.grant_decisions\s*\(([\s\S]*?)\);/i
    )?.[1] ?? '';
    expect(block).toMatch(/\bdecision_type\b/i);
    expect(block).toMatch(/\bdecision\b/i);
    expect(block).toMatch(/\bdecided_by\b/i);
  });
});

// ---------------------------------------------------------------------------
// 4. No stale grant_details references in application source
// ---------------------------------------------------------------------------
describe('No stale grant_details references in application source', () => {
  const { readdirSync: rdSync, statSync } = require('fs');

  const EXCLUDED_DIRS = new Set(['__tests__', '.next', 'node_modules', 'graphify-out']);
  const PERMITTED_FILES = new Set([
    // Only the 0009 placeholder comment is allowed to reference the old name
    'db/migrations/0009_grants.sql',
  ]);

  function walkTs(dir: string): string[] {
    const results: string[] = [];
    try {
      for (const entry of rdSync(dir, { withFileTypes: true })) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...walkTs(full));
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          results.push(full);
        }
      }
    } catch { /* ignore */ }
    return results;
  }

  const allFiles = [
    ...walkTs(join(ROOT, 'app')),
    ...walkTs(join(ROOT, 'lib')),
    ...walkTs(join(ROOT, 'components')),
  ];

  it('no TS/TSX file references .from("grant_details") or .from(\'grant_details\')', () => {
    const violations: string[] = [];
    for (const f of allFiles) {
      const rel = f.replace(ROOT + '/', '');
      if (PERMITTED_FILES.has(rel)) continue;
      const content = readFileSync(f, 'utf8');
      if (/\.from\(['"]grant_details['"]\)/.test(content)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });

  it('no TS/TSX file contains nested grant_details(...) select strings', () => {
    const violations: string[] = [];
    for (const f of allFiles) {
      const rel = f.replace(ROOT + '/', '');
      if (PERMITTED_FILES.has(rel)) continue;
      const content = readFileSync(f, 'utf8');
      if (/grant_details\s*\(/.test(content)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });

  it('CLAUDE.md documents grants as canonical table (not grant_details)', () => {
    const claudeMd = read('CLAUDE.md');
    expect(claudeMd).not.toContain('grant_details.id');
    expect(claudeMd).toContain('grants');
  });
});

// ---------------------------------------------------------------------------
// 5. AI grant tools do not return feature_not_available
// ---------------------------------------------------------------------------
describe('AI grant tools are not stubbed', () => {
  const GRANT_TOOL_NAMES = [
    'start_due_diligence',
    'get_workflow_status',
    'complete_workflow_task',
    'track_milestone',
    'get_upcoming_deadlines',
    'log_grant_communication',
    'get_grant_health',
    'record_grant_payment',
  ];

  it('executor.ts does not group grant tool cases into a single feature_not_available block', () => {
    // The stubbed block looks like:
    // case 'start_due_diligence':
    // case 'track_milestone':
    // ...
    // case 'record_grant_payment': {
    //   return { ... feature_not_available: true ... };
    // }
    // After implementation each tool gets its own case. Verify the stub pattern is gone.
    expect(executorSrc).toContain('GRANTS_EXECUTORS');
    expect(GRANT_TOOL_NAMES.map(grantToolExecutor).join('\n'))
      .not.toContain('feature_not_available');
  });

  for (const tool of GRANT_TOOL_NAMES) {
    it(`executor.ts handles case '${tool}' without feature_not_available`, () => {
      const implementation = grantToolExecutor(tool);
      expect(implementation).toMatch(/AssistantToolExecutor/);
      expect(implementation).not.toContain('feature_not_available');
    });
  }
});

describe('Grant payment amount controls', () => {
  it('AI grant payment writes check the approved amount before inserting or updating', () => {
    expect(grantsExecutorSrc).toContain('assertGrantPaymentWithinApprovedAmount');
    expect(grantsExecutorSrc).toContain("from('grant_payments')");
    expect(grantsExecutorSrc).toContain(".select('id, amount, status')");
    expect(grantsExecutorSrc).toContain('Grant payments would exceed the approved amount');
    expect(grantsExecutorSrc).toContain('paymentCountsAgainstApprovedAmount');
  });

  it('canonical schema enforces aggregate payments against grants.approved_amount', () => {
    expect(migrations).toContain('CREATE OR REPLACE FUNCTION public.enforce_grant_payment_approved_amount');
    expect(migrations).toContain('FOR UPDATE');
    expect(migrations).toContain("status NOT IN ('cancelled', 'returned')");
    expect(migrations).toContain('v_total_payments > v_approved_amount');
    expect(migrations).toContain('CREATE TRIGGER trg_grant_payments_approved_amount');
  });
});

// ---------------------------------------------------------------------------
// 6. lib/grants/lifecycle.ts exposes required exports
// ---------------------------------------------------------------------------
describe('lib/grants/lifecycle.ts exports required symbols', () => {
  let lifecycleSrc = '';
  let lifecycleSharedSrc = '';
  try {
    lifecycleSrc = read('lib/grants/lifecycle.ts');
    lifecycleSharedSrc = read('lib/grants/lifecycle-shared.ts');
  } catch {
    lifecycleSrc = '';
    lifecycleSharedSrc = '';
  }

  it('lifecycle.ts exists', () => {
    expect(lifecycleSrc.length).toBeGreaterThan(0);
  });

  it('exports LIFECYCLE_STAGES', () => {
    expect(lifecycleSrc).toContain('LIFECYCLE_STAGES');
  });

  it('exports ALLOWED_TRANSITIONS', () => {
    expect(lifecycleSrc).toContain('ALLOWED_TRANSITIONS');
  });

  it('exports DECISION_REQUIRED_TRANSITIONS', () => {
    expect(lifecycleSrc).toContain('DECISION_REQUIRED_TRANSITIONS');
  });

  it('exports canTransition function', () => {
    expect(lifecycleSrc).toContain('canTransition');
  });

  it('terminal stages have no forward transitions', () => {
    if (!lifecycleSharedSrc.includes('ALLOWED_TRANSITIONS')) return;
    // Read and parse manually rather than importing to avoid ESM issues
    const terminalStages = ['closed', 'declined', 'cancelled'];
    for (const stage of terminalStages) {
      // Match both quoted ('stage': []) and unquoted (stage: []) key forms
      const pattern = new RegExp(`['"]?${stage}['"]?\\s*:\\s*\\[\\s*\\]`);
      expect(pattern.test(lifecycleSharedSrc)).toBe(true);
    }
  });

  it('DECISION_REQUIRED_TRANSITIONS only references pairs present in ALLOWED_TRANSITIONS', () => {
    if (!lifecycleSharedSrc.includes('ALLOWED_TRANSITIONS')) return;
    // Extract all 'from->to' strings from DECISION_REQUIRED_TRANSITIONS block
    const setBlock = lifecycleSharedSrc.match(
      /DECISION_REQUIRED_TRANSITIONS\s*=\s*new Set[^(]*\(\[([\s\S]*?)\]\)/
    );
    if (!setBlock) return;
    const pairs = setBlock[1].match(/'([a-z_]+)->([a-z_]+)'/g) ?? [];
    for (const pair of pairs) {
      const [, from, to] = pair.replace(/'/g, '').match(/^([a-z_]+)->([a-z_]+)$/) ?? [];
      if (!from || !to) continue;
      // Both stages must appear in LIFECYCLE_STAGES list
      expect(lifecycleSharedSrc).toContain(`'${from}'`);
      expect(lifecycleSharedSrc).toContain(`'${to}'`);
      // The `to` stage must appear in the ALLOWED_TRANSITIONS[from] array
      const fromBlockMatch = lifecycleSharedSrc.match(
        new RegExp(`['"]?${from}['"]?\\s*:\\s*\\[([^\\]]*?)\\]`)
      );
      expect(fromBlockMatch).not.toBeNull();
      expect(fromBlockMatch![1]).toContain(`'${to}'`);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. grant_status_history and grant_decisions tables exist in migration
// ---------------------------------------------------------------------------
describe('Grant audit tables in migration', () => {
  it('grant_status_history table is defined', () => {
    expect(migrations).toContain('CREATE TABLE IF NOT EXISTS public.grant_status_history');
  });

  it('grant_status_history has grant_id FK to grants', () => {
    const block = migrations.match(
      /CREATE TABLE IF NOT EXISTS public\.grant_status_history\s*\([\s\S]*?\);/
    );
    expect(block).not.toBeNull();
    expect(block![0]).toContain('grant_id');
    expect(block![0]).toContain('REFERENCES public.grants(id)');
  });

  it('grant_decisions table is defined', () => {
    expect(migrations).toContain('CREATE TABLE IF NOT EXISTS public.grant_decisions');
  });

  it('grant_decisions has decision_type CHECK constraint', () => {
    const block = migrations.match(
      /CREATE TABLE IF NOT EXISTS public\.grant_decisions\s*\([\s\S]*?\);/
    );
    expect(block).not.toBeNull();
    expect(block![0]).toContain('decision_type');
    expect(block![0]).toContain("CHECK (decision_type IN");
  });

  it('grant_status_history has RLS enabled (policy defined)', () => {
    expect(migrations).toContain('grant_status_history: org members can view');
  });

  it('grant_decisions has RLS enabled (policy defined)', () => {
    expect(migrations).toContain('grant_decisions: org members can view');
  });

  it('grant_decisions are append-only for authenticated users', () => {
    expect(migrations).toContain('grant_decisions: org admins can insert');
    expect(migrations).toMatch(/ON public\.grant_decisions FOR INSERT TO authenticated/);
    expect(migrations).toContain('GRANT SELECT, INSERT ON public.grant_decisions TO authenticated');
    expect(migrations).toContain('REVOKE UPDATE, DELETE ON public.grant_decisions FROM authenticated');
    expect(migrations).not.toMatch(/grant_decisions[\s\S]{0,80}FOR ALL TO authenticated/);
  });
});
