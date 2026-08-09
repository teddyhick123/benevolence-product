import { createElevatedClient } from '@/lib/api/admin-client';
import type { AIInvocationRecord, AIInvocationRecorder } from '@/lib/ai/execution';

/** Phase 0 projection into the existing usage table; Phase 1 persists the full record. */
export function createAIInvocationRecorder(): AIInvocationRecorder {
  return async (record: AIInvocationRecord) => {
    if (!record.scope.actorId) return;
    const db = createElevatedClient();
    const { error } = await db.from('ai_usage_log').insert({
      user_id: record.scope.actorId,
      org_id: record.scope.orgId ?? null,
      portfolio_id: record.scope.portfolioId ?? null,
      session_id: record.scope.sessionId ?? null,
      model: record.resolvedModel ?? record.requestedModel,
      input_tokens: record.usage?.inputTokens ?? 0,
      output_tokens: record.usage?.outputTokens ?? 0,
    });
    if (error) throw error;
  };
}
