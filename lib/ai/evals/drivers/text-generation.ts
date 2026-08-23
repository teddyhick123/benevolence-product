import type { AIConnector, AIExecutionPlan, AIGenerationRequest } from '@/lib/ai/execution';
import { AIExecutionError } from '@/lib/ai/execution';
import type { AIStreamChunk } from '@/lib/ai/types';
import type { EvalCase, Observed } from '@/lib/ai/evals/types';
import { EvalTransportError } from '@/lib/ai/evals/types';

export type Driver = (
  _connector: AIConnector,
  _plan: AIExecutionPlan,
  _case: EvalCase,
) => Promise<Observed>;

/**
 * A provider or transport failure is never a finding about the model, so it
 * leaves the driver as EvalTransportError and fails the whole run.
 */
export async function guardTransport<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AIExecutionError) {
      throw new EvalTransportError(`Provider failed: ${error.code}`, { cause: error });
    }
    throw new EvalTransportError('Provider call failed', { cause: error });
  }
}

export function requestFor(evalCase: EvalCase, plan: AIExecutionPlan): AIGenerationRequest {
  return {
    system: evalCase.system,
    messages: [{ role: 'user', content: evalCase.prompt }],
    maxOutputTokens: plan.maxOutputTokens,
  };
}

export const textGenerationDriver: Driver = async (connector, plan, evalCase) => {
  if (!connector.generateText) throw new EvalTransportError('Connector cannot generate text');
  const result = await guardTransport(() => connector.generateText!(plan, requestFor(evalCase, plan)));

  // Streaming costs a second model call, so only pay for it when a case
  // actually asserts on the chunks. Across the suite this halves the calls
  // spent on text workloads.
  const needsChunks = evalCase.assertions.some(assertion => assertion.id === 'streams-progressively');
  const chunks: AIStreamChunk[] = [];
  if (needsChunks && connector.streamText) {
    await guardTransport(async () => {
      for await (const chunk of connector.streamText!(plan, requestFor(evalCase, plan))) chunks.push(chunk);
    });
  }
  return { text: result.text, response: result.response, chunks };
};
