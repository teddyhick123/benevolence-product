import { createAIConnector } from '@/lib/ai/connectors/registry';
import type { AIGenerationRequest, AIExecutionScope } from '@/lib/ai/execution';
import { AIExecutionGateway } from '@/lib/ai/gateway';
import type { AIWorkloadId } from '@/lib/ai/workloads';
import { createAIInvocationRecorder } from '@/lib/api/repositories/ai-invocations';
import { extractText } from '@/lib/ai/text';
import { createAICredentialRepository } from '@/lib/api/repositories/ai-credentials';
import { AIExecutionError } from '@/lib/ai/execution';
import { openRouterProviderPreferencesSchema } from '@/lib/schemas/ai-settings';

export function createAIExecutionGateway(scope: AIExecutionScope) {
  return new AIExecutionGateway(scope, {
    connector: async (plan) => {
      if (plan.connector !== 'openrouter') return createAIConnector(plan.connector);
      if (scope.kind !== 'organization' || !scope.orgId || !plan.connectionId) {
        throw new AIExecutionError('policy_unsatisfied', 'OpenRouter requires an organization connection');
      }
      try {
        return await createAICredentialRepository({
          orgId: scope.orgId,
          actorId: scope.actorId,
        }).withCredential(plan.connectionId, credential => createAIConnector('openrouter', {
          openrouter: {
            apiKey: credential.apiKey,
            provider: openRouterProviderPreferencesSchema.parse(plan.providerPreferences ?? {}),
          },
        }));
      } catch (error) {
        if (error instanceof AIExecutionError) throw error;
        throw new AIExecutionError(
          'credential_decryption_failed',
          'Organization AI credential could not be loaded',
          { cause: error },
        );
      }
    },
    recorder: createAIInvocationRecorder(),
  });
}

export async function generateTextForWorkload(params: {
  workloadId: Extract<AIWorkloadId, 'letters' | 'summaries' | 'financial_profile'>;
  scope: AIExecutionScope;
  request: AIGenerationRequest;
}) {
  const gateway = createAIExecutionGateway(params.scope);
  return gateway.generateText(await gateway.resolve(params.workloadId), params.request);
}

export async function generateStructuredForWorkload<T>(params: {
  workloadId: Extract<AIWorkloadId, 'extraction' | 'import'>;
  scope: AIExecutionScope;
  request: AIGenerationRequest;
  parse: (_text: string) => T;
}) {
  const gateway = createAIExecutionGateway(params.scope);
  return gateway.generateStructured(
    await gateway.resolve(params.workloadId),
    params.request,
    params.parse,
  );
}

export async function generateOnboardingText(params: {
  scope: AIExecutionScope;
  request: AIGenerationRequest;
}) {
  const gateway = createAIExecutionGateway(params.scope);
  const response = await gateway.runToolConversation(await gateway.resolve('onboarding'), {
    ...params.request,
    tools: [],
  });
  return { text: extractText(response), response };
}
