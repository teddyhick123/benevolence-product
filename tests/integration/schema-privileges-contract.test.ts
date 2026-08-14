// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readMigration(file: string) {
  return readFileSync(join(root, 'db/migrations', file), 'utf8');
}

function compact(sql: string) {
  return sql.replace(/\s+/g, ' ');
}

function expectGrant(sql: string, relation: string, privilegePattern: string, roles: string[]) {
  const normalized = compact(sql);
  for (const role of roles) {
    expect(
      normalized,
      `${relation} should grant ${privilegePattern} to ${role}`
    ).toMatch(new RegExp(`GRANT\\s+${privilegePattern}\\s+ON\\s+(?:public\\.)?${relation}\\s+TO\\s+[^;]*\\b${role}\\b`, 'i'));
  }
}

function expectServicePolicy(sql: string, relation: string) {
  const normalized = compact(sql);
  expect(
    normalized,
    `${relation} should have an explicit service_role policy`
  ).toMatch(new RegExp(`CREATE\\s+POLICY\\s+"[^"]*service[^"]*"\\s+ON\\s+(?:public\\.)?${relation}\\s+FOR\\s+ALL\\s+TO\\s+service_role`, 'i'));
}

function expectExecuteGrant(sql: string, signature: string, roles: string[]) {
  const normalized = compact(sql);
  for (const role of roles) {
    expect(
      normalized,
      `${signature} should grant execute to ${role}`
    ).toMatch(new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${signature}\\s+TO\\s+[^;]*\\b${role}\\b`, 'i'));
  }
}

function expectSecurityInvokerView(sql: string, view: string) {
  const normalized = compact(sql);
  expect(
    normalized,
    `${view} should preserve base-table RLS through security_invoker`
  ).toMatch(
    new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+VIEW\\s+public\\.${view}\\s+WITH\\s*\\(\\s*security_invoker\\s*=\\s*true\\s*\\)\\s+AS`,
      'i'
    )
  );
}

describe('canonical migration privilege contracts', () => {
  it('grants service role access to organization provisioning RPCs used by onboarding', () => {
    const sql = readMigration('0023_admin_superuser_policies.sql');
    const onboardingSql = readMigration('0056_onboarding_provisioning_recovery.sql');

    expectExecuteGrant(sql, 'provision_organization\\(text,\\s*org_type_enum,\\s*uuid,\\s*text,\\s*jsonb\\)', ['service_role']);
    expect(compact(onboardingSql)).toMatch(
      /REVOKE ALL ON FUNCTION public\.provision_onboarding_session\([\s\S]*?\) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public\.provision_onboarding_session\([\s\S]*?\) TO service_role;/i
    );
  });

  it('grants access to portfolio KPI tables and views used by app routes', () => {
    const sql = readMigration('0008_metrics_and_kpis.sql');

    for (const table of ['kpi_definitions', 'metric_facts']) {
      expectServicePolicy(sql, table);
      expectGrant(sql, table, 'SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE', ['authenticated']);
      expectGrant(sql, table, 'ALL', ['service_role']);
    }

    expectGrant(sql, 'v_portfolio_kpi_latest', 'SELECT', ['authenticated', 'service_role']);
  });

  it('grants access to investment tracking tables used behind v_holdings', () => {
    const sql = readMigration('0007_investment_tracking.sql');

    for (const table of ['holding_valuations', 'holding_transactions', 'holding_co_investors']) {
      expectServicePolicy(sql, table);
      expectGrant(sql, table, 'SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE', ['authenticated']);
      expectGrant(sql, table, 'ALL', ['service_role']);
    }
  });

  it('grants access to portfolio summary views used by holdings and dashboard routes', () => {
    const sql = readMigration('0019_portfolio_summary_views.sql');

    for (const view of ['v_holdings_enriched', 'v_holdings', 'v_portfolio_summary', 'v_asset_allocation']) {
      expectGrant(sql, view, 'SELECT', ['authenticated', 'service_role']);
    }
  });

  it('grants access to grant, workflow, task tables and reporting views', () => {
    const sql = readMigration('0041_task_workflow_foundation.sql');

    for (const table of [
      'tasks',
      'task_entity_links',
      'task_comments',
      'grant_milestones',
      'grant_reports',
      'grant_payments',
      'workflow_instances',
      'workflow_tasks',
    ]) {
      expectServicePolicy(sql, table);
      expectGrant(sql, table, 'SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE', ['authenticated']);
      expectGrant(sql, table, 'ALL', ['service_role']);
    }

    for (const view of ['v_grants', 'v_portfolio_grant_summary', 'v_grant_health', 'v_er_grant_compliance']) {
      expectGrant(sql, view, 'SELECT', ['authenticated', 'service_role']);
      expectSecurityInvokerView(sql, view);
    }

    expectServicePolicy(sql, 'task_automation_outbox');
    expectGrant(sql, 'task_automation_outbox', 'SELECT', ['authenticated']);
    expectGrant(sql, 'task_automation_outbox', 'ALL', ['service_role']);

    for (const signature of [
      'create_task_with_relations\\(\\s*uuid,\\s*uuid,\\s*jsonb,\\s*jsonb\\s*\\)',
      'update_task_with_event\\(\\s*uuid,\\s*uuid,\\s*uuid,\\s*boolean,\\s*jsonb\\s*\\)',
      'add_task_comment_with_event\\(\\s*uuid,\\s*uuid,\\s*uuid,\\s*text\\s*\\)',
      'set_task_completion_state\\(\\s*uuid,\\s*uuid,\\s*uuid,\\s*boolean,\\s*text\\s*\\)',
      'upsert_generated_task\\(\\s*uuid,\\s*jsonb,\\s*jsonb,\\s*boolean\\s*\\)',
      'settle_generated_tasks\\(\\s*uuid,\\s*text,\\s*boolean,\\s*text,\\s*text,\\s*uuid\\s*\\)',
      'claim_task_automation_outbox\\(\\s*int,\\s*uuid,\\s*uuid\\s*\\)',
      'finish_task_automation_outbox\\(\\s*uuid,\\s*boolean,\\s*text\\s*\\)',
    ]) {
      expectExecuteGrant(sql, signature, ['service_role']);
    }
  });
});
