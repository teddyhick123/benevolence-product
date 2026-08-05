import type { AssistantToolExecutor } from '../../executor-types';
import { getGrantHealth } from '../grants';

export const executeGetGrantHealth: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args, portfolioId } = runtime;
  return await getGrantHealth(supabase, { ...args, portfolio_id: portfolioId });
};
