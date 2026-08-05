import type { AssistantToolExecutor } from '../../executor-types';
import { getCarryforward } from '../tax';

export const executeGetCarryforward: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  return getCarryforward(supabase, args, portfolioId);
};
