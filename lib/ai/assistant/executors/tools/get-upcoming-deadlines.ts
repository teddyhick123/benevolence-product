import type { AssistantToolExecutor } from '../../executor-types';
import { getUpcomingDeadlines } from '../grants';

export const executeGetUpcomingDeadlines: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  return await getUpcomingDeadlines(supabase, {
    ...args,
    portfolio_id: portfolioId,
  });
};
