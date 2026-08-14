// tests/integration/tax-ai-contract.test.ts
//
// Source-scan contract tests for the AI tax executor.
// These fail if stale patterns (owner_tax_profiles, is_carryforward, hardcoded
// AGI defaults) reappear in the tax executor source.
//
// All assertions target lib/ai/assistant/executors/tax.ts as the canonical
// module, but fall back to reading executor.ts for the tax sections so the
// suite remains useful even before the split is complete.

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

describe('AI tax executor contract', () => {
  let src: string;

  beforeAll(() => {
    const taxExecutorPath = path.join(ROOT, 'lib/ai/assistant/executors/tax.ts');
    const mainExecutorPath = path.join(ROOT, 'lib/ai/assistant/executor.ts');
    try {
      src = fs.readFileSync(taxExecutorPath, 'utf-8');
    } catch {
      src = fs.readFileSync(mainExecutorPath, 'utf-8');
    }
  });

  // ── Stale table / column guards ──────────────────────────────────────────

  it('does not reference owner_tax_profiles', () => {
    expect(src).not.toContain('owner_tax_profiles');
  });

  it('does not use is_carryforward column (legacy flag — do not use as primary carryforward data source)', () => {
    expect(src).not.toContain('is_carryforward');
  });

  // ── No hardcoded AGI defaults ─────────────────────────────────────────────

  it('does not silently default AGI to 500000', () => {
    expect(src).not.toMatch(/agi\s*[=:]\s*500000/);
  });

  it('does not silently default AGI to 500_000', () => {
    expect(src).not.toMatch(/agi\s*[=:]\s*500_000/);
  });

  // ── Canonical data sources ────────────────────────────────────────────────

  it('reads AGI from tax_years or tax_profiles', () => {
    expect(src).toMatch(/tax_years|tax_profiles/);
  });

  it('reads carryforwards from tax_carryforwards or v_active_carryforwards', () => {
    expect(src).toMatch(/tax_carryforwards|v_active_carryforwards/);
  });

  it('reads adjusted_gross_income (canonical AGI column)', () => {
    expect(src).toContain('adjusted_gross_income');
  });

  // ── Executor delegation (executor.ts must delegate to tax module) ─────────

  it('the tax module registry delegates wrappers to executors/tax', () => {
    const registrySrc = fs.readFileSync(
      path.join(ROOT, 'lib/ai/assistant/executors/modules/tax.ts'),
      'utf-8'
    );
    const wrapperSrc = fs.readFileSync(
      path.join(ROOT, 'lib/ai/assistant/executors/tools/run-tax-scenario.ts'),
      'utf-8'
    );
    expect(registrySrc).toMatch(/run-tax-scenario/);
    expect(wrapperSrc).toMatch(/from ['"]\.\.\/tax['"]/);
  });

  it('executor.ts does not contain inline run_tax_scenario implementation', () => {
    const executorSrc = fs.readFileSync(
      path.join(ROOT, 'lib/ai/assistant/executor.ts'),
      'utf-8'
    );
    // After delegation, executor.ts should not contain the bulky inline switch
    expect(executorSrc).not.toContain('cash_vs_stock');
  });

  it('executor.ts does not contain inline is_carryforward query', () => {
    const executorSrc = fs.readFileSync(
      path.join(ROOT, 'lib/ai/assistant/executor.ts'),
      'utf-8'
    );
    expect(executorSrc).not.toContain('is_carryforward');
  });

  // ── AGI error path exists ─────────────────────────────────────────────────

  it('returns an error message when AGI is missing (not a silent default)', () => {
    expect(src).toContain('AGI not configured');
    expect(src).toContain('Tax Center');
  });
});
