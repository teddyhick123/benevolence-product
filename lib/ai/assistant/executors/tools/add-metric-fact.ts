import type { AssistantToolExecutor } from '../../executor-types';
import { AIActionExecutor } from '@/lib/ai/assistant/actions/executor';

export const executeAddMetricFact: AssistantToolExecutor = async (runtime) => {
  const {
    args,
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
  } = runtime;
  const normalizedArgs = { ...args, value: Number(args.value) };
  const executor = new AIActionExecutor(runtime.db);
  return await executor.addMetricFact(
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
    normalizedArgs,
  );
};
