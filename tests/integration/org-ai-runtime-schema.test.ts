// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migrations = path.join(process.cwd(), 'db', 'migrations');
const auditSql = readFileSync(path.join(migrations, '0024_settings_ops_hub.sql'), 'utf8');
const onboardingSql = readFileSync(path.join(migrations, '0034_onboarding.sql'), 'utf8');
const runtimeSql = readFileSync(path.join(migrations, '0057_org_ai_runtime.sql'), 'utf8');

function tableBody(name: string): string {
  const match = runtimeSql.match(new RegExp(
    `CREATE TABLE IF NOT EXISTS public\\.${name}\\s*\\(([\\s\\S]*?)\\n\\);`,
    'm',
  ));
  if (!match) throw new Error(`Missing ${name} in 0057`);
  return match[1];
}

describe('organization AI runtime schema', () => {
  it('keeps deleted auth users from blocking config while preserving audit subjects', () => {
    expect(auditSql).toMatch(
      /actor_id\s+uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/i,
    );
    expect(auditSql).toMatch(/actor_subject_id\s+uuid NOT NULL/i);
    expect(auditSql).toContain('set_org_audit_actor_subject');

    for (const table of ['org_ai_connections', 'org_ai_credentials', 'org_ai_deployments', 'org_ai_routes']) {
      expect(tableBody(table)).toMatch(
        /created_by\s+uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/i,
      );
    }
    for (const table of ['org_ai_connections', 'org_ai_deployments', 'org_ai_routes']) {
      expect(tableBody(table)).toMatch(
        /updated_by\s+uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/i,
      );
    }
  });

  it('uses org_id in the onboarding canon', () => {
    expect(onboardingSql).toMatch(/\borg_id\s+UUID REFERENCES public\.organizations/i);
    expect(onboardingSql).not.toMatch(/\borganization_id\s+UUID REFERENCES public\.organizations/i);
    expect(onboardingSql).toContain('onboarding_sessions(org_id)');
  });

  it('defines tenant-scoped connection, credential, deployment, and route tables', () => {
    for (const table of [
      'org_ai_connections',
      'org_ai_credentials',
      'org_ai_deployments',
      'org_ai_routes',
      'org_ai_route_targets',
    ]) {
      expect(runtimeSql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(runtimeSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(runtimeSql).toContain(`GRANT ALL ON public.${table} TO service_role`);
    }
    expect(tableBody('org_ai_credentials')).toMatch(
      /FOREIGN KEY \(connection_id, org_id\)[\s\S]*org_ai_connections\(id, org_id\)/,
    );
    expect(tableBody('org_ai_deployments')).toMatch(
      /FOREIGN KEY \(connection_id, org_id\)[\s\S]*org_ai_connections\(id, org_id\)/,
    );
    expect(tableBody('org_ai_route_targets')).toMatch(
      /FOREIGN KEY \(deployment_id, org_id\)[\s\S]*org_ai_deployments\(id, org_id\) ON DELETE RESTRICT/,
    );
  });

  it('keeps credentials service-only and non-secret settings admin-readable', () => {
    expect(runtimeSql).not.toMatch(/GRANT\s+[^;]*ON public\.org_ai_credentials TO authenticated/i);
    expect(runtimeSql).not.toMatch(/org_ai_credentials[^\n]*authenticated/i);
    for (const table of ['org_ai_connections', 'org_ai_deployments', 'org_ai_routes', 'org_ai_route_targets']) {
      expect(runtimeSql).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
      expect(runtimeSql).toMatch(new RegExp(
        `CREATE POLICY "${table}_admin_read"[\\s\\S]*?is_org_admin\\(org_id\\)`,
      ));
    }
  });

  it('enforces route target uniqueness and explicit target shapes', () => {
    const targets = tableBody('org_ai_route_targets');
    expect(targets).toContain('UNIQUE (route_id, position)');
    expect(targets).toContain('UNIQUE (route_id, deployment_id)');
    expect(runtimeSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS org_ai_route_targets_one_platform_default[\s\S]*WHERE target_kind = 'platform_default'/,
    );
    expect(targets).toMatch(/position\s+integer NOT NULL CHECK \(position >= 0\)/);
    expect(targets).toMatch(
      /target_kind = 'deployment' AND deployment_id IS NOT NULL[\s\S]*target_kind = 'platform_default' AND deployment_id IS NULL/,
    );
  });

  it('makes the execution plan one-time bindable and immutable', () => {
    expect(runtimeSql).toMatch(/ADD COLUMN IF NOT EXISTS execution_plan jsonb/);
    expect(runtimeSql).toContain('guard_ai_turn_execution_plan');
    expect(runtimeSql).toContain('bind_ai_turn_execution_plan');
    expect(runtimeSql).toMatch(
      /OLD\.execution_plan IS NOT NULL[\s\S]*NEW\.execution_plan IS DISTINCT FROM OLD\.execution_plan/,
    );
    expect(runtimeSql).toMatch(/v_turn\.status IS DISTINCT FROM 'in_progress'/);
  });

  it('expands usage metadata and declares all intended read boundaries', () => {
    expect(runtimeSql).toContain('ALTER COLUMN user_id DROP NOT NULL');
    expect(runtimeSql).toMatch(
      /FOREIGN KEY \(user_id\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/,
    );
    for (const column of [
      'scope_kind', 'workload_id', 'operation', 'route_id', 'connection_id',
      'deployment_id', 'turn_id', 'connector', 'model_vendor', 'requested_model',
      'resolved_model', 'resolved_provider', 'provider_request_id', 'cached_input_tokens',
      'reasoning_tokens', 'audio_input_tokens', 'audio_output_tokens', 'reported_cost',
      'latency_ms', 'status', 'error_code', 'target_position', 'policy_snapshot',
      'policy_hash', 'started_at', 'completed_at',
    ]) {
      expect(runtimeSql, column).toMatch(new RegExp(`\\b${column}\\b`));
    }
    expect(runtimeSql).toMatch(/ai_usage_log_self_read[\s\S]*user_id = auth\.uid\(\)/);
    expect(runtimeSql).toMatch(/ai_usage_log_org_admin_read[\s\S]*is_org_admin\(org_id\)/);
    expect(runtimeSql).toMatch(/ai_usage_log_app_admin_read[\s\S]*is_app_admin\(\)/);
  });
});
