import type { AssistantToolExecutor } from '../../executor-types';
import { AIActionExecutor } from '@/lib/ai-action-executor';

export const executeAddHolding: AssistantToolExecutor = async (runtime) => {
  const {
    args,
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
  } = runtime;
  const executor = new AIActionExecutor(runtime.db as never);
  return await executor.createHolding(
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
    args,
  );
};
