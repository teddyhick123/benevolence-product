import type { AssistantToolExecutor } from '../../executor-types';
import { getWorkflowStatus } from '../grants';

export const executeGetWorkflowStatus: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  return await getWorkflowStatus(supabase, args, portfolioId);
};
