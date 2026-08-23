import { createAIConnector, type AIConnectorFactoryContext } from '@/lib/ai/connectors/registry';
import type { AIGenerationRequest, AIExecutionScope } from '@/lib/ai/execution';
import { AIExecutionGateway } from '@/lib/ai/gateway';
import type { AIWorkloadId } from '@/lib/ai/workloads';
import { createAIInvocationRecorder } from '@/lib/api/repositories/ai-invocations';
import { extractText } from '@/lib/ai/text';
import { createAICredentialRepository } from '@/lib/api/repositories/ai-credentials';
import { AIExecutionError } from '@/lib/ai/execution';
import { openRouterProviderPreferencesSchema } from '@/lib/schemas/ai-settings';

function connectorContext(
  plan: { connector: string; providerPreferences?: Readonly<Record<string, unknown>> },
  apiKey: string,
): AIConnectorFactoryContext {
  if (plan.connector === 'openrouter') {
    return {
      openrouter: {
        apiKey,
        provider: openRouterProviderPreferencesSchema.parse(plan.providerPreferences ?? {}),
      },
    };
  }
  if (plan.connector === 'anthropic') return { anthropic: { apiKey } };
  if (plan.connector === 'openai') return { openai: { apiKey } };
  throw new AIExecutionError(
    'policy_unsatisfied',
    `Connector ${plan.connector} cannot be used with an organization credential`,
  );
}

export function createAIExecutionGateway(scope: AIExecutionScope) {
  return new AIExecutionGateway(scope, {
    connector: async (plan) => {
      // A plan without a connection is a platform-default target: the platform
      // key is correct there and nowhere else. Every org deployment loads its
      // own credential, whatever provider it names.
      if (!plan.connectionId) return createAIConnector(plan.connector);
      if (scope.kind !== 'organization' || !scope.orgId) {
        throw new AIExecutionError(
          'policy_unsatisfied',
          'Organization AI deployments require an organization scope',
        );
      }
      try {
        return await createAICredentialRepository({
          orgId: scope.orgId,
          actorId: scope.actorId,
        }).withCredential(plan.connectionId, credential => createAIConnector(
          plan.connector,
          connectorContext(plan, credential.apiKey),
        ));
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
