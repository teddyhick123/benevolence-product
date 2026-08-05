import type { AssistantToolExecutor } from '../../executor-types';
import { trackMilestone } from '../grants';

export const executeTrackMilestone: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args, portfolioId } = runtime;
  return await trackMilestone(supabase, args, portfolioId);
};
