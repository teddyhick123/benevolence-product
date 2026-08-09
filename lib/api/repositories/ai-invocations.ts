import { createElevatedClient } from '@/lib/api/admin-client';
import type { AIInvocationRecord, AIInvocationRecorder } from '@/lib/ai/execution';

/** Content-free provider-neutral invocation persistence for every AI attempt. */
export function createAIInvocationRecorder(): AIInvocationRecorder {
  return async (record: AIInvocationRecord) => {
    const db = createElevatedClient();
    const { error } = await db.from('ai_usage_log').insert({
      id: record.id,
      user_id: record.scope.actorId ?? null,
      org_id: record.scope.orgId ?? null,
      portfolio_id: record.scope.portfolioId ?? null,
      session_id: record.scope.sessionId ?? null,
      turn_id: record.turnId ?? record.scope.turnId ?? null,
      scope_kind: record.scope.kind,
      workload_id: record.workloadId,
      operation: record.operation,
      route_id: record.routeId ?? null,
      connection_id: record.connectionId ?? null,
      deployment_id: record.deploymentId ?? null,
      connector: record.connector,
      model_vendor: record.modelVendor ?? null,
      requested_model: record.requestedModel,
      resolved_model: record.resolvedModel ?? null,
      resolved_provider: record.resolvedProvider ?? null,
      provider_request_id: record.providerRequestId ?? null,
      input_tokens: record.usage?.inputTokens ?? 0,
      output_tokens: record.usage?.outputTokens ?? 0,
      cached_input_tokens: record.usage?.cachedInputTokens ?? 0,
      reasoning_tokens: record.usage?.reasoningTokens ?? 0,
      audio_input_tokens: record.usage?.audioInputTokens ?? 0,
      audio_output_tokens: record.usage?.audioOutputTokens ?? 0,
      reported_cost: record.reportedCost ?? null,
      cost_currency: record.costCurrency ?? null,
      latency_ms: record.latencyMs,
      status: record.status,
      error_code: record.errorCode ?? null,
      target_position: record.targetPosition,
      policy_snapshot: record.policy,
      policy_hash: record.policyHash,
      started_at: record.startedAt,
      completed_at: record.completedAt,
    });
    if (error) throw error;
  };
}
