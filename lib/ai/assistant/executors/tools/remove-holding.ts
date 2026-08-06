import type { AssistantToolExecutor } from '../../executor-types';
import { AIActionExecutor } from '@/lib/ai-action-executor';

export const executeRemoveHolding: AssistantToolExecutor = async (runtime) => {
  const {
    args,
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
  } = runtime;
  const executor = new AIActionExecutor(runtime.db);
  return await executor.deleteHolding(
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
    args,
  );
};
