import type { AssistantToolExecutor } from '../../executor-types';
import { AIActionExecutor } from '@/lib/ai/assistant/actions/executor';

export const executeCreateWidget: AssistantToolExecutor = async (runtime) => {
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
  return await executor.createWidget(
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
    args,
  );
};
