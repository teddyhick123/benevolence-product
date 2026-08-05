import type { AssistantToolExecutor } from '../../executor-types';
import { logGrantCommunication } from '../grants';

export const executeLogGrantCommunication: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId, userId } = runtime;
  return await logGrantCommunication(supabase, args, userId, portfolioId);
};
