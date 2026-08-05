import type { AssistantToolExecutor } from '../../executor-types';
import { completeWorkflowTask } from '../grants';

export const executeCompleteWorkflowTask: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId, userId } = runtime;
  return await completeWorkflowTask(supabase, args, userId, portfolioId);
};
