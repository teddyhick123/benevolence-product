// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  join(__dirname, '..', '..', 'db/migrations/0058_ai_deployment_evaluations.sql'),
  'utf8',
);

describe('evaluation storage schema', () => {
  it('permits only one live run per deployment', () => {
    expect(MIGRATION).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*ai_deployment_evaluation_runs_one_live[\s\S]*WHERE status IN \('queued','running'\)/,
    );
  });

  it('scopes runs by org_id, not organization_id', () => {
    expect(MIGRATION).toMatch(/org_id\s+uuid NOT NULL REFERENCES public\.organizations/);
    expect(MIGRATION).not.toMatch(/organization_id/);
  });

  it('enables RLS and restricts reads to org admins', () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.ai_deployment_evaluation_runs ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(/is_org_admin\(org_id\)/);
  });

  it('allows a failure kind only on a failed run', () => {
    expect(MIGRATION).toMatch(/failure_kind IS NULL OR status = 'failed'/);
  });
});
