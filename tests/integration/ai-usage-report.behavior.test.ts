// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { describe, expect, it, beforeAll } from 'vitest';

const CONTAINER = 'supabase_db_benevolence-walkthrough';
const ORG = '3b000000-0000-4000-8000-000000000001';
const PERIOD = "date_trunc('month', now())";

function sql(statement: string): string {
  return execFileSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', statement],
    { encoding: 'utf8' },
  ).trim();
}

beforeAll(() => {
  // A deterministic fixture: two platform-funded rows, plus a connection and
  // deployment so the org-funded exclusion has something real to point at.
  sql(`
    DELETE FROM public.ai_usage_log WHERE org_id = '${ORG}';
    DELETE FROM public.organizations WHERE id = '${ORG}';
    INSERT INTO public.organizations (id, name, org_type)
      VALUES ('${ORG}', 'Spend Report Org', 'private_foundation');
    INSERT INTO public.ai_usage_log
      (org_id, scope_kind, workload_id, operation, connector, requested_model,
       input_tokens, output_tokens, computed_cost, cost_source, status)
    VALUES
      ('${ORG}', 'organization', 'assistant', 'tool_conversation', 'anthropic',
       'claude-opus-5', 1000, 100, 10.00, 'computed', 'succeeded'),
      ('${ORG}', 'organization', 'builder_review', 'text_generation', 'anthropic',
       'claude-opus-5', 1000, 100, 5.00, 'computed', 'succeeded');
  `);
});

describe('org_ai_usage_report', () => {
  // The reason this function exists rather than three separate queries.
  it('reports a platform total equal to org_platform_spend', () => {
    const reported = sql(
      `SELECT (public.org_ai_usage_report('${ORG}', ${PERIOD})->>'platform_cost')::numeric`,
    );
    const enforced = sql(`SELECT public.org_platform_spend('${ORG}', ${PERIOD})`);
    expect(Number(reported)).toBeCloseTo(Number(enforced), 6);
    expect(Number(enforced)).toBeCloseTo(15, 6);
  });

  it('breaks spend down by workload, summing to the platform total', () => {
    const rows = JSON.parse(sql(
      `SELECT public.org_ai_usage_report('${ORG}', ${PERIOD})->'by_workload'`,
    )) as Array<{ workload_id: string; cost: number }>;
    const ids = rows.map(row => row.workload_id).sort();
    expect(ids).toEqual(['assistant', 'builder_review']);
    expect(rows.reduce((sum, row) => sum + Number(row.cost), 0)).toBeCloseTo(15, 6);
  });

  // An unpriced row adds nothing, so a platform-default model shipping
  // without a rate under-counts spend and the cap under-enforces. Phase 3A's
  // rate coverage guard is what prevents that; this test is where the
  // dependency is visible rather than only described in prose.
  it('counts an unpriced row as zero, not as an error', () => {
    const before = Number(sql(`SELECT public.org_platform_spend('${ORG}', ${PERIOD})`));
    sql(`
      INSERT INTO public.ai_usage_log
        (org_id, scope_kind, workload_id, operation, connector, requested_model,
         input_tokens, output_tokens, cost_source, status)
      VALUES ('${ORG}', 'organization', 'letters', 'text_generation', 'anthropic',
              'some-unpriced-model', 5000, 5000, 'unpriced', 'succeeded');
    `);
    const after = Number(sql(`SELECT public.org_platform_spend('${ORG}', ${PERIOD})`));
    expect(after).toBeCloseTo(before, 6);
  });

  it('excludes organization-funded rows from the platform total', () => {
    sql(`
      INSERT INTO public.org_ai_connections (org_id, connector, name, auth_type)
        VALUES ('${ORG}', 'openrouter', 'Report Conn', 'api_key')
        ON CONFLICT DO NOTHING;
      INSERT INTO public.org_ai_deployments (org_id, connection_id, name, provider_model_id)
        SELECT '${ORG}', c.id, 'Report Deployment', 'anthropic/claude-opus-5'
        FROM public.org_ai_connections c WHERE c.org_id = '${ORG}' LIMIT 1;
      INSERT INTO public.ai_usage_log
        (org_id, scope_kind, workload_id, operation, connector, requested_model,
         deployment_id, reported_cost, cost_source, status)
      SELECT '${ORG}', 'organization', 'assistant', 'tool_conversation', 'openrouter',
             'anthropic/claude-opus-5', d.id, 99.00, 'reported', 'succeeded'
      FROM public.org_ai_deployments d WHERE d.org_id = '${ORG}' LIMIT 1;
    `);
    const platform = sql(`SELECT public.org_platform_spend('${ORG}', ${PERIOD})`);
    // Unchanged: the org-funded row is their provider bill, not platform cost.
    expect(Number(platform)).toBeCloseTo(15, 6);

    const orgCost = sql(
      `SELECT (public.org_ai_usage_report('${ORG}', ${PERIOD})->>'org_cost')::numeric`,
    );
    expect(Number(orgCost)).toBeCloseTo(99, 6);
  });

  it('returns a daily series covering the period', () => {
    const daily = JSON.parse(sql(
      `SELECT public.org_ai_usage_report('${ORG}', ${PERIOD})->'daily'`,
    )) as Array<{ day: string; platform_cost: number }>;
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.reduce((sum, row) => sum + Number(row.platform_cost ?? 0), 0)).toBeCloseTo(15, 6);
  });
});
