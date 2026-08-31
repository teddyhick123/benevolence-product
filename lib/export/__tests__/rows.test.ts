// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Runs SQL and returns the last data line. psql echoes BEGIN, INSERT 0 1 and
 * ROLLBACK alongside query output, so a multi-statement script needs the
 * command tags stripped rather than the whole stdout.
 */
function psql(sql: string): string {
  const out = execFileSync('docker', [
    'exec', 'supabase_db_benevolence-walkthrough',
    'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql,
  ], { encoding: 'utf8' });
  const lines = out.trim().split('\n').filter(line =>
    !/^(BEGIN|COMMIT|ROLLBACK|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SET|CREATE|DROP)$/.test(line.trim()));
  return lines[lines.length - 1] ?? '';
}

function psqlThrows(sql: string): boolean {
  try {
    execFileSync('docker', [
      'exec', 'supabase_db_benevolence-walkthrough',
      'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', sql,
    ], { encoding: 'utf8', stdio: 'pipe' });
    return false;
  } catch {
    return true;
  }
}

const ORG_A = '4b000000-0000-4000-8000-00000000000a';
const ORG_B = '4b000000-0000-4000-8000-00000000000b';

describe('export_table_page', () => {
  // The defect this whole task exists to prevent: JSON.parse turns a Postgres
  // numeric into a double, so 25000.00 silently becomes 25000.
  it('emits numeric columns as JSON strings with their scale intact', () => {
    const line = psql(`
      BEGIN;
      INSERT INTO public.organizations (id, name, org_type)
        VALUES ('${ORG_A}', 'Precision Test', 'private_foundation');
      INSERT INTO public.ai_usage_log
        (org_id, scope_kind, workload_id, operation, connector, requested_model, computed_cost)
        VALUES ('${ORG_A}', 'organization', 'assistant',
                'tool_conversation', 'anthropic', 'claude-opus-5', 25000.00);
      SELECT line FROM public.export_table_page('ai_usage_log', '${ORG_A}', NULL, 10) LIMIT 1;
      ROLLBACK;`);

    expect(line).toContain('"computed_cost": "25000.00"');
    // The failure mode, stated as an assertion so a regression is unambiguous.
    expect(line).not.toContain('"computed_cost": 25000');
    expect(JSON.parse(line).computed_cost).toBe('25000.00');
  });

  it('returns nothing for an organization with no rows', () => {
    const count = psql(`SELECT count(*) FROM public.export_table_page(
      'ai_usage_log', '4b000000-0000-4000-8000-0000000000ff', NULL, 10)`);
    expect(count).toBe('0');
  });

  // Tenancy is the failure that turns a sovereignty feature into a breach.
  it("never returns another organization's rows", () => {
    const leaked = psql(`
      BEGIN;
      INSERT INTO public.organizations (id, name, org_type) VALUES
        ('${ORG_A}', 'Org A', 'private_foundation'),
        ('${ORG_B}', 'Org B', 'private_foundation');
      INSERT INTO public.ai_usage_log
        (org_id, scope_kind, workload_id, operation, connector, requested_model)
        VALUES ('${ORG_B}', 'organization', 'assistant',
                'tool_conversation', 'anthropic', 'claude-opus-5');
      SELECT count(*) FROM public.export_table_page('ai_usage_log', '${ORG_A}', NULL, 100);
      ROLLBACK;`);
    expect(leaked).toBe('0');
  });

  // A via_parent table is scoped by its parent's org_id, not its own.
  it('scopes a child table through its parent', () => {
    const count = psql(`
      BEGIN;
      INSERT INTO public.organizations (id, name, org_type)
        VALUES ('${ORG_A}', 'Parent Scope', 'private_foundation');
      SELECT count(*) FROM public.export_table_page(
        'grant_milestones', '${ORG_A}', NULL, 100, 'grants', 'id', 'grant_id');
      ROLLBACK;`);
    expect(count).toBe('0');
  });

  // Refusing to guess is what keeps an unscoped table from being exported whole.
  it('refuses a table with no org_id when no parent is given', () => {
    expect(psqlThrows(
      `SELECT * FROM public.export_table_page('grant_milestones', gen_random_uuid(), NULL, 1)`,
    )).toBe(true);
  });

  it('refuses a table that is not an exportable base table', () => {
    expect(psqlThrows(
      `SELECT * FROM public.export_table_page('pg_shadow', gen_random_uuid(), NULL, 1)`,
    )).toBe(true);
  });

  // The organization's own row is keyed by id rather than org_id.
  it('scopes the organizations table by id', () => {
    const count = psql(`
      BEGIN;
      INSERT INTO public.organizations (id, name, org_type)
        VALUES ('${ORG_A}', 'Self Row', 'private_foundation');
      SELECT count(*) FROM public.export_table_page(
        'organizations', '${ORG_A}', NULL, 10, NULL, NULL, NULL, 'id');
      ROLLBACK;`);
    expect(count).toBe('1');
  });

  it('is executable by the service role only', () => {
    const granted = psql(`SELECT has_function_privilege('authenticated',
      'public.export_table_page(text,uuid,uuid,int,text,text,text,text)', 'EXECUTE')`);
    expect(granted).toBe('f');
  });
});
