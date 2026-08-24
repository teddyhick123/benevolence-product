// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const OWNER = readFileSync(join(ROOT, 'db/migrations/0030_ai_usage_log.sql'), 'utf8');
const RUNTIME = readFileSync(join(ROOT, 'db/migrations/0057_org_ai_runtime.sql'), 'utf8');

describe('ai_usage_log owning migration', () => {
  it('declares the cost columns', () => {
    expect(OWNER).toMatch(/computed_cost\s+numeric/);
    expect(OWNER).toMatch(/cost_source\s+text NOT NULL DEFAULT 'unpriced'/);
    expect(OWNER).toMatch(/CHECK \(cost_source IN \('reported','computed','unpriced'\)\)/);
    expect(OWNER).toMatch(/rate_version\s+text/);
  });

  it('declares requested_model natively rather than renaming it later', () => {
    expect(OWNER).toMatch(/requested_model\s+text NOT NULL/);
    expect(RUNTIME).not.toMatch(/RENAME COLUMN model TO requested_model/);
  });

  it('absorbs the plain provider-neutral columns', () => {
    for (const column of ['scope_kind', 'workload_id', 'operation', 'connector', 'resolved_model', 'policy_hash', 'latency_ms']) {
      expect(OWNER, `${column} should be declared in 0030`)
        .toMatch(new RegExp(`${column}\\s+(text|integer)`));
      expect(RUNTIME, `${column} should not be patched in 0057`)
        .not.toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
    }
  });

  // These four reference tables created in 0033 and 0057, so they cannot be
  // declared in 0030 — the fold is deliberately partial.
  it('leaves the foreign-key columns in 0057', () => {
    for (const column of ['route_id', 'connection_id', 'deployment_id', 'turn_id']) {
      expect(RUNTIME, `${column} must stay in 0057`)
        .toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
    }
  });

  it('declares user_id nullable from the start', () => {
    expect(RUNTIME).not.toMatch(/ALTER COLUMN user_id DROP NOT NULL/);
  });
});
