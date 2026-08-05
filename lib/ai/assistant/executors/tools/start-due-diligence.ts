import type { AssistantToolExecutor } from '../../executor-types';
import { startDueDiligence } from '../grants';

export const executeStartDueDiligence: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId, userId } = runtime;
  return await startDueDiligence(supabase, args, portfolioId, userId);
};
