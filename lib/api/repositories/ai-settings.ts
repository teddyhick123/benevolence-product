import { createElevatedClient, type ElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import { AI_DEPLOYMENT_CATALOG, getAIDeploymentTemplate } from '@/lib/ai/catalog';
import { AI_WORKLOADS, getAIWorkload } from '@/lib/ai/workloads';
import { canManageWorkspace } from '@/lib/organizations/roles';
import {
  aiConnectionUpdateSchema,
  aiDeploymentCreateSchema,
  aiRouteReplaceSchema,
  openRouterConnectionConfigSchema,
} from '@/lib/schemas/ai-settings';
import {
  createAICredentialRepository,
  type AICredentialRepository,
} from '@/lib/api/repositories/ai-credentials';

type AISettingsScope = Pick<OrgAccessContext, 'orgId' | 'role' | 'principal'>;

type AISettingsDependencies = {
  db?: ElevatedClient;
  credentials?: Pick<AICredentialRepository, 'hasCredential' | 'listCredentialHints'>;
  now?: () => Date;
};

function currentVerification(
  evidence: unknown,
  now: Date,
): evidence is { result: 'passed' | 'conditional'; verifiedAt: string; evalSuiteVersion: string } {
  if (!evidence || typeof evidence !== 'object') return false;
  const item = evidence as Record<string, unknown>;
  if (
    (item.result !== 'passed' && item.result !== 'conditional')
    || typeof item.verifiedAt !== 'string'
    || typeof item.evalSuiteVersion !== 'string'
  ) return false;
  const verifiedAt = new Date(item.verifiedAt);
  return Number.isFinite(verifiedAt.getTime())
    && now.getTime() - verifiedAt.getTime() <= 90 * 24 * 60 * 60 * 1000;
}

export function createAISettingsRepository(
  scope: AISettingsScope,
  dependencies: AISettingsDependencies = {},
) {
  if (!canManageWorkspace(scope.role)) {
    throw new Error('Organization administrator access is required');
  }
  const actorId = scope.principal.userId;
  const db = dependencies.db ?? createElevatedClient();
  const credentials = dependencies.credentials ?? createAICredentialRepository({
    orgId: scope.orgId,
    actorId,
  });
  const now = dependencies.now ?? (() => new Date());

  async function audit(action: string, targetId: string, metadata: Record<string, unknown>) {
    const { error } = await db.from('org_audit_log').insert({
      org_id: scope.orgId,
      actor_id: actorId,
      actor_subject_id: actorId,
      action,
      target_id: targetId,
      metadata,
    });
    if (error) throw error;
  }

  return {
    async getSettings() {
      const usageSince = new Date(now().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [connectionsResult, deploymentsResult, routesResult, targetsResult, usageResult, hints] = await Promise.all([
        db.from('org_ai_connections').select('*').eq('org_id', scope.orgId).order('name'),
        db.from('org_ai_deployments').select('*').eq('org_id', scope.orgId).order('name'),
        db.from('org_ai_routes').select('*').eq('org_id', scope.orgId).order('workload_id'),
        db.from('org_ai_route_targets').select('*').eq('org_id', scope.orgId).order('position'),
        db.from('ai_usage_log')
          .select('workload_id, input_tokens, output_tokens, reported_cost, status')
          .eq('org_id', scope.orgId)
          .gte('created_at', usageSince),
        credentials.listCredentialHints(),
      ]);
      for (const result of [connectionsResult, deploymentsResult, routesResult, targetsResult, usageResult]) {
        if (result.error) throw result.error;
      }
      const hintsByConnection = new Map(hints.map(hint => [hint.connectionId, hint]));
      const usageRows = usageResult.data ?? [];
      return {
        connections: (connectionsResult.data ?? []).map(row => ({
          ...row,
          credential: hintsByConnection.get(row.id) ?? null,
        })),
        deployments: deploymentsResult.data ?? [],
        routes: (routesResult.data ?? []).map(route => ({
          ...route,
          targets: (targetsResult.data ?? []).filter(target => target.route_id === route.id),
        })),
        workloads: Object.values(AI_WORKLOADS),
        catalog: AI_DEPLOYMENT_CATALOG,
        usageSummary: {
          periodDays: 30,
          invocations: usageRows.length,
          failedInvocations: usageRows.filter(row => row.status !== 'succeeded').length,
          inputTokens: usageRows.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
          outputTokens: usageRows.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
          reportedCost: usageRows.reduce((sum, row) => sum + Number(row.reported_cost ?? 0), 0),
        },
      };
    },

    async createConnection(input: {
      connector: 'openrouter';
      name: string;
      endpointUrl?: 'https://openrouter.ai/api/v1';
      region?: string | null;
      config?: unknown;
    }) {
      const config = openRouterConnectionConfigSchema.parse(input.config ?? {});
      const { data, error } = await db.from('org_ai_connections').insert({
        org_id: scope.orgId,
        connector: input.connector,
        name: input.name.trim(),
        endpoint_url: input.endpointUrl ?? 'https://openrouter.ai/api/v1',
        region: input.region ?? null,
        auth_type: 'api_key',
        config,
        status: 'active',
        created_by: actorId,
        updated_by: actorId,
      }).select('*').single();
      if (error) throw error;
      await audit('ai.connection_created', data.id, { connector: input.connector });
      return data;
    },

    async updateConnection(connectionId: string, rawInput: unknown) {
      const input = aiConnectionUpdateSchema.parse(rawInput);
      const values = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.region !== undefined ? { region: input.region } : {}),
        ...(input.config !== undefined ? { config: input.config } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updated_by: actorId,
      };
      const { data, error } = await db.from('org_ai_connections')
        .update(values)
        .eq('id', connectionId)
        .eq('org_id', scope.orgId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('AI connection not found');
      await audit('ai.connection_updated', connectionId, {
        changed_fields: Object.keys(values).filter(key => key !== 'updated_by'),
      });
      return data;
    },

    async recordConnectionTest(
      connectionId: string,
      result: { status: 'succeeded' | 'failed'; invalidate: boolean },
    ) {
      const testedAt = now().toISOString();
      const { data, error } = await db.from('org_ai_connections').update({
        last_tested_at: testedAt,
        last_test_status: result.status,
        ...(result.status === 'succeeded'
          ? { status: 'active' }
          : result.invalidate
            ? { status: 'invalid' }
            : {}),
        updated_by: actorId,
      }).eq('id', connectionId).eq('org_id', scope.orgId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('AI connection not found');
      await audit('ai.connection_tested', connectionId, {
        status: result.status,
        invalidated: result.invalidate,
      });
      return { testedAt, status: result.status };
    },

    async deleteConnection(connectionId: string) {
      const { count, error: referenceError } = await db.from('org_ai_deployments')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', scope.orgId)
        .eq('connection_id', connectionId);
      if (referenceError) throw referenceError;
      if ((count ?? 0) > 0) throw new Error('Remove this connection’s deployments before deleting it');
      const { data, error } = await db.from('org_ai_connections').delete()
        .eq('id', connectionId)
        .eq('org_id', scope.orgId)
        .select('id, connector')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('AI connection not found');
      await audit('ai.connection_deleted', connectionId, { connector: data.connector });
    },

    async createDeployment(rawInput: unknown) {
      const input = aiDeploymentCreateSchema.parse(rawInput);
      const template = getAIDeploymentTemplate(input.catalogTemplateId);
      const { data: connection, error: connectionError } = await db
        .from('org_ai_connections')
        .select('id, connector, status')
        .eq('id', input.connectionId)
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (connectionError) throw connectionError;
      if (!connection || connection.status !== 'active') throw new Error('Active AI connection not found');
      if (connection.connector !== template.connector) {
        throw new Error('Deployment template is incompatible with this connection');
      }
      if (!await credentials.hasCredential(connection.id)) {
        throw new Error('AI connection credential is missing');
      }
      const { data, error } = await db.from('org_ai_deployments').insert({
        org_id: scope.orgId,
        connection_id: connection.id,
        name: input.name ?? template.displayName,
        catalog_template_id: template.id,
        provider_model_id: template.providerModelId,
        config: input.config,
        verified_workloads: template.verifiedWorkloads,
        status: 'active',
        created_by: actorId,
        updated_by: actorId,
      }).select('*').single();
      if (error) throw error;
      await audit('ai.deployment_created', data.id, {
        connector: template.connector,
        catalog_template_id: template.id,
      });
      return data;
    },

    async deleteDeployment(deploymentId: string) {
      const { count, error: referenceError } = await db.from('org_ai_route_targets')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', scope.orgId)
        .eq('deployment_id', deploymentId);
      if (referenceError) throw referenceError;
      if ((count ?? 0) > 0) throw new Error('Replace routes that use this deployment before deleting it');
      const { data, error } = await db.from('org_ai_deployments').delete()
        .eq('id', deploymentId)
        .eq('org_id', scope.orgId)
        .select('id, catalog_template_id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('AI deployment not found');
      await audit('ai.deployment_deleted', deploymentId, {
        catalog_template_id: data.catalog_template_id,
      });
    },

    async getDeploymentForEvaluation(deploymentId: string) {
      const { data: deployment, error } = await db.from('org_ai_deployments')
        .select('*').eq('id', deploymentId).eq('org_id', scope.orgId).maybeSingle();
      if (error) throw error;
      if (!deployment) throw new Error('AI deployment not found');
      const { data: connection, error: connectionError } = await db.from('org_ai_connections')
        .select('*').eq('id', deployment.connection_id).eq('org_id', scope.orgId).maybeSingle();
      if (connectionError) throw connectionError;
      if (!connection) throw new Error('AI connection not found');
      return { deployment, connection };
    },

    async recordDeploymentEvaluation(
      deploymentId: string,
      workloadId: keyof typeof AI_WORKLOADS,
      evidence: { evalSuiteVersion: string; verifiedAt: string; result: 'passed' | 'conditional' },
    ) {
      const { data: deployment, error: readError } = await db.from('org_ai_deployments')
        .select('verified_workloads').eq('id', deploymentId).eq('org_id', scope.orgId).maybeSingle();
      if (readError) throw readError;
      if (!deployment) throw new Error('AI deployment not found');
      const verifiedWorkloads = {
        ...((deployment.verified_workloads as Record<string, unknown>) ?? {}),
        [workloadId]: evidence,
      };
      const { error } = await db.from('org_ai_deployments').update({
        verified_workloads: verifiedWorkloads,
        updated_by: actorId,
      }).eq('id', deploymentId).eq('org_id', scope.orgId);
      if (error) throw error;
      await audit('ai.deployment_evaluated', deploymentId, {
        workload_id: workloadId,
        result: evidence.result,
        eval_suite_version: evidence.evalSuiteVersion,
      });
      return evidence;
    },

    async replaceRoute(rawInput: unknown) {
      const input = aiRouteReplaceSchema.parse(rawInput);
      const workload = getAIWorkload(input.workloadId);
      const deploymentIds = input.targets.flatMap(target =>
        target.kind === 'deployment' ? [target.deploymentId] : [],
      );
      const { data: deployments, error } = deploymentIds.length === 0
        ? { data: [], error: null }
        : await db.from('org_ai_deployments')
          .select('id, connection_id, catalog_template_id, verified_workloads, status')
          .eq('org_id', scope.orgId)
          .in('id', deploymentIds);
      if (error) throw error;
      if ((deployments ?? []).length !== deploymentIds.length) {
        throw new Error('Route contains a deployment outside this organization');
      }
      for (const deployment of deployments ?? []) {
        if (deployment.status !== 'active') throw new Error('Route contains a disabled deployment');
        const template = deployment.catalog_template_id
          ? getAIDeploymentTemplate(deployment.catalog_template_id)
          : null;
        if (!template) throw new Error('Uncatalogued deployments require a later runtime phase');
        const missing = workload.requiredCapabilities.filter(
          capability => !template.advertisedCapabilities.includes(capability),
        );
        if (missing.length > 0) {
          throw new Error(`Deployment is missing workload capabilities: ${missing.join(', ')}`);
        }
        const evidence = (deployment.verified_workloads as Record<string, unknown>)[input.workloadId];
        if (!currentVerification(evidence, now()) && !input.policy.experimentalUseAccepted) {
          throw new Error('This deployment requires explicit experimental-use acceptance for the workload');
        }
        if (!await credentials.hasCredential(deployment.connection_id)) {
          throw new Error('Route deployment credential is missing');
        }
      }
      const { data: routeId, error: routeError } = await db.rpc('replace_org_ai_route', {
        p_org_id: scope.orgId,
        p_actor_id: actorId,
        p_workload_id: input.workloadId,
        p_policy: input.policy,
        p_is_enabled: input.isEnabled,
        p_targets: input.targets,
      });
      if (routeError) throw routeError;
      return { id: routeId as string };
    },
  };
}

export type AISettingsRepository = ReturnType<typeof createAISettingsRepository>;
