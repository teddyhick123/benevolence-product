import type { Observed } from '@/lib/ai/evals/types';
import { EvalTransportError } from '@/lib/ai/evals/types';
import { guardTransport, type Driver } from '@/lib/ai/evals/drivers/text-generation';

export const structuredGenerationDriver: Driver = async (connector, plan, evalCase): Promise<Observed> => {
  if (!connector.generateText) throw new EvalTransportError('Connector cannot generate text');
  const result = await guardTransport(() => connector.generateText!(plan, {
    system: evalCase.system,
    messages: [{ role: 'user', content: evalCase.prompt }],
    maxOutputTokens: plan.maxOutputTokens,
    ...(evalCase.responseSchema
      ? { responseFormat: { name: 'evaluation_output', schema: evalCase.responseSchema } }
      : {}),
  }));

  // Unparseable output is a finding about the model, so it is observed rather
  // than thrown — jsonMatchesSchema turns an absent json field into a failure.
  let json: unknown;
  try {
    json = JSON.parse(result.text);
  } catch {
    json = undefined;
  }
  return { text: result.text, response: result.response, json, sourceText: evalCase.sourceText };
};
