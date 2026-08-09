import { createAIConnector } from '@/lib/ai/connectors/registry';
import type { AIGenerationRequest, AIExecutionScope } from '@/lib/ai/execution';
import { AIExecutionGateway } from '@/lib/ai/gateway';
import type { AIWorkloadId } from '@/lib/ai/workloads';
import { createAIInvocationRecorder } from '@/lib/api/repositories/ai-invocations';
import { extractText } from '@/lib/ai/text';

export function createAIExecutionGateway(scope: AIExecutionScope) {
  return new AIExecutionGateway(scope, {
    connector: (plan) => createAIConnector(plan.connector),
    recorder: createAIInvocationRecorder(),
  });
}

export async function generateTextForWorkload(params: {
  workloadId: Extract<AIWorkloadId, 'letters' | 'summaries' | 'financial_profile'>;
  scope: AIExecutionScope;
  request: AIGenerationRequest;
}) {
  const gateway = createAIExecutionGateway(params.scope);
  return gateway.generateText(gateway.resolve(params.workloadId), params.request);
}

export async function generateStructuredForWorkload<T>(params: {
  workloadId: Extract<AIWorkloadId, 'extraction' | 'import'>;
  scope: AIExecutionScope;
  request: AIGenerationRequest;
  parse: (_text: string) => T;
}) {
  const gateway = createAIExecutionGateway(params.scope);
  return gateway.generateStructured(
    gateway.resolve(params.workloadId),
    params.request,
    params.parse,
  );
}

export async function generateOnboardingText(params: {
  scope: AIExecutionScope;
  request: AIGenerationRequest;
}) {
  const gateway = createAIExecutionGateway(params.scope);
  const response = await gateway.runToolConversation(gateway.resolve('onboarding'), {
    ...params.request,
    tools: [],
  });
  return { text: extractText(response), response };
}
