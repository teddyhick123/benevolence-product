import type { AIExecutionPlan, AIExecutionScope } from '@/lib/ai/execution';
import { AIExecutionError } from '@/lib/ai/execution';
import { getAIWorkload, type AIWorkloadId } from '@/lib/ai/workloads';

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
  const workload = getAIWorkload(workloadId);
  return Object.freeze({
    workloadId,
    operation: workload.operation,
    connector: workload.platformDefault.connector,
    requestedModel: workload.platformDefault.model,
    requiredCapabilities: workload.requiredCapabilities,
    maxOutputTokens: workload.defaultLimits.maxOutputTokens,
    timeoutMs: workload.defaultLimits.timeoutMs,
    source: 'platform_default' as const,
    policy: Object.freeze({}),
  });
}
