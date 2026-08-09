import { createHash } from 'node:crypto';
import type {
  AIExecutionPlan,
  AIExecutionScope,
  AIExecutionTarget,
} from '@/lib/ai/execution';
import { AIExecutionError } from '@/lib/ai/execution';
import { getAIWorkload, type AIWorkloadId } from '@/lib/ai/workloads';
import { getAIDeploymentTemplate } from '@/lib/ai/catalog';
import { createAIRoutingRepository } from '@/lib/api/repositories/ai-routing';
import {
  aiRoutePolicySchema,
  openRouterProviderPreferencesSchema,
} from '@/lib/schemas/ai-settings';
import { createElevatedClient } from '@/lib/api/admin-client';

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function hashPolicy(policy: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(stableJson(policy)).digest('hex');
}

function currentVerificationResult(evidence: unknown): 'passed' | 'conditional' | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const value = evidence as Record<string, unknown>;
  if (
    (value.result !== 'passed' && value.result !== 'conditional')
    || typeof value.verifiedAt !== 'string'
    || typeof value.evalSuiteVersion !== 'string'
  ) return null;
  const verifiedAt = new Date(value.verifiedAt);
  return Number.isFinite(verifiedAt.getTime())
    && Date.now() - verifiedAt.getTime() <= 90 * 24 * 60 * 60 * 1000
    ? value.result
    : null;
}

function platformTarget(workloadId: AIWorkloadId, position = 0): AIExecutionTarget {
  const workload = getAIWorkload(workloadId);
  return Object.freeze({
    position,
    kind: 'platform_default' as const,
    connector: workload.platformDefault.connector,
    requestedModel: workload.platformDefault.model,
    toolMode: 'full',
  });
}

function planFromTargets(
  workloadId: AIWorkloadId,
  targets: readonly AIExecutionTarget[],
  values: {
    source: AIExecutionPlan['source'];
    routeId?: string;
    policy: Readonly<Record<string, unknown>>;
  },
): AIExecutionPlan {
  const workload = getAIWorkload(workloadId);
  const primary = targets[0];
  return Object.freeze({
    workloadId,
    operation: workload.operation,
    connector: primary.connector,
    requestedModel: primary.requestedModel,
    requiredCapabilities: workload.requiredCapabilities,
    maxOutputTokens: workload.defaultLimits.maxOutputTokens,
    timeoutMs: workload.defaultLimits.timeoutMs,
    source: values.source,
    routeId: values.routeId,
    connectionId: primary.connectionId,
    deploymentId: primary.deploymentId,
    modelVendor: primary.modelVendor,
    targetPosition: primary.position,
    targets: Object.freeze([...targets]),
    policy: values.policy,
    policyHash: hashPolicy(values.policy),
    providerPreferences: primary.providerPreferences,
    toolMode: primary.toolMode,
  });
}

async function bindDurableTurnPlan(
  scope: AIExecutionScope,
  plan: AIExecutionPlan,
): Promise<AIExecutionPlan> {
  if (!scope.turnId || !scope.portfolioId || !scope.actorId) return plan;
  const { error } = await createElevatedClient().rpc('bind_ai_turn_execution_plan', {
    p_turn_id: scope.turnId,
    p_portfolio_id: scope.portfolioId,
    p_user_id: scope.actorId,
    p_execution_plan: plan,
  });
  if (error) throw error;
  return plan;
}

/** Synchronous platform-default resolver retained for connector contracts. */
export function resolveAIExecution(
  scope: AIExecutionScope,
  workloadId: AIWorkloadId,
): AIExecutionPlan {
  if (scope.kind === 'organization' && !scope.orgId) {
    throw new AIExecutionError(
      'policy_unsatisfied',
      'Organization AI execution requires organization scope',
    );
  }
  const policy = Object.freeze({});
  return planFromTargets(workloadId, [platformTarget(workloadId)], {
    source: 'platform_default',
    policy,
  });
}

export async function resolveOrganizationAIExecution(
  scope: AIExecutionScope,
  workloadId: AIWorkloadId,
): Promise<AIExecutionPlan> {
  if (scope.kind !== 'organization') {
    return bindDurableTurnPlan(scope, resolveAIExecution(scope, workloadId));
  }
  if (!scope.orgId) {
    throw new AIExecutionError('policy_unsatisfied', 'Organization AI execution requires organization scope');
  }
  const resolved = await createAIRoutingRepository({
    orgId: scope.orgId,
    actorId: scope.actorId,
  }).getWorkloadRoute(workloadId);
  if (!resolved) {
    return bindDurableTurnPlan(scope, resolveAIExecution(scope, workloadId));
  }
  if (!resolved.route.is_enabled) {
    throw new AIExecutionError('policy_unsatisfied', 'Organization AI route is disabled');
  }
  const policy = Object.freeze(aiRoutePolicySchema.parse(resolved.route.policy));
  if (resolved.targets.length === 0 || resolved.targets.some((target, index) => target.position !== index)) {
    throw new AIExecutionError('policy_unsatisfied', 'Organization AI route targets are invalid');
  }
  const workload = getAIWorkload(workloadId);
  const targets = resolved.targets.map<AIExecutionTarget>((target) => {
    if (target.target_kind === 'platform_default') return platformTarget(workloadId, target.position);
    const deployment = resolved.deployments.find(row => row.id === target.deployment_id);
    const connection = deployment
      ? resolved.connections.find(row => row.id === deployment.connection_id)
      : null;
    if (!deployment || !connection || deployment.status !== 'active' || connection.status !== 'active') {
      throw new AIExecutionError('deployment_unavailable', 'Organization AI deployment is unavailable');
    }
    if (!resolved.credentialAvailability.get(connection.id)) {
      throw new AIExecutionError('credential_invalid', 'Organization AI connection credential is missing');
    }
    if (connection.connector !== 'openrouter' || !deployment.catalog_template_id) {
      throw new AIExecutionError('policy_unsatisfied', 'Organization AI deployment is unsupported');
    }
    const template = getAIDeploymentTemplate(deployment.catalog_template_id);
    const missing = workload.requiredCapabilities.filter(
      capability => !template.advertisedCapabilities.includes(capability),
    );
    if (missing.length > 0) {
      throw new AIExecutionError('capability_mismatch', `Organization deployment is missing: ${missing.join(', ')}`);
    }
    const evidence = (deployment.verified_workloads as Record<string, unknown>)[workloadId];
    const verification = currentVerificationResult(evidence);
    if (!verification && !policy.experimentalUseAccepted) {
      throw new AIExecutionError(
        'policy_unsatisfied',
        'Organization AI deployment requires experimental-use acceptance',
      );
    }
    const connectionConfig = connection.config as Record<string, unknown>;
    const deploymentConfig = deployment.config as Record<string, unknown>;
    const preferences = openRouterProviderPreferencesSchema.parse({
      ...((connectionConfig.provider as Record<string, unknown> | undefined) ?? {}),
      ...((deploymentConfig.provider as Record<string, unknown> | undefined) ?? {}),
      ...((policy.provider as Record<string, unknown> | undefined) ?? {}),
    });
    return Object.freeze({
      position: target.position,
      kind: 'deployment' as const,
      connector: 'openrouter' as const,
      requestedModel: deployment.provider_model_id,
      modelVendor: template.modelVendor,
      connectionId: connection.id,
      deploymentId: deployment.id,
      providerPreferences: Object.freeze(preferences),
      toolMode: verification === 'passed' || policy.mutationTools === 'allow_experimental'
        ? 'full'
        : 'read_only',
    });
  });
  const plan = planFromTargets(workloadId, targets, {
    source: 'organization_route',
    routeId: resolved.route.id,
    policy,
  });
  return bindDurableTurnPlan(scope, plan);
}

export function selectAIExecutionTarget(
  plan: AIExecutionPlan,
  target: AIExecutionTarget,
): AIExecutionPlan {
  return Object.freeze({
    ...plan,
    connector: target.connector,
    requestedModel: target.requestedModel,
    connectionId: target.connectionId,
    deploymentId: target.deploymentId,
    modelVendor: target.modelVendor,
    targetPosition: target.position,
    providerPreferences: target.providerPreferences,
    toolMode: target.toolMode,
  });
}
