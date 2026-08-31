// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'db/migrations/0059_org_ai_spend_caps.sql'),
  'utf8',
);

describe('org_ai_spend_caps schema', () => {
  it('keys the cap by org_id, not organization_id', () => {
    expect(SQL).toMatch(/org_id\s+uuid PRIMARY KEY REFERENCES public\.organizations/);
    expect(SQL).not.toMatch(/organization_id/);
  });

  it('keeps an organization limit at or below the platform ceiling', () => {
    expect(SQL).toMatch(/org_limit_usd <= platform_limit_usd/);
  });

  it('treats a null limit as absent rather than zero', () => {
    expect(SQL).toMatch(/platform_limit_usd IS NULL OR platform_limit_usd >= 0/);
    expect(SQL).toMatch(/org_limit_usd IS NULL OR org_limit_usd >= 0/);
  });

  it('constrains the behaviour at the ceiling to the three supported modes', () => {
    expect(SQL).toMatch(/CHECK \(on_limit IN \('hard_stop','read_only','own_key'\)\)/);
    expect(SQL).toMatch(/DEFAULT 'hard_stop'/);
  });

  it('lets org admins read but never write', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.org_ai_spend_caps ENABLE ROW LEVEL SECURITY/);
    expect(SQL).toMatch(/FOR SELECT TO authenticated USING \(public\.is_org_admin\(org_id\)\)/);
    expect(SQL).not.toMatch(/FOR ALL TO authenticated/);
    expect(SQL).toMatch(/GRANT SELECT ON public\.org_ai_spend_caps TO authenticated/);
  });
});

describe('org_platform_spend', () => {
  it('counts only platform-funded rows', () => {
    expect(SQL).toMatch(/deployment_id IS NULL/);
  });

  it('uses the same cost precedence as the recorder', () => {
    expect(SQL).toMatch(/COALESCE\(reported_cost, computed_cost\)/);
  });

  it('takes the period start as a parameter so tests can pin it', () => {
    expect(SQL).toMatch(/org_platform_spend\(\s*p_org_id\s+uuid,\s*p_period_start\s+timestamptz/);
  });

  it('is executable by the service role only', () => {
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.org_platform_spend/);
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.org_platform_spend[\s\S]*TO service_role/);
  });
});
