import type { AssistantToolExecutor } from '../../executor-types';
import { calculateDeduction } from '../tax';

export const executeCalculateDeduction: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  return calculateDeduction(supabase, args, portfolioId);
};
