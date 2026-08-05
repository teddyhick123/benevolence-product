import type { AssistantToolExecutor } from '../../executor-types';
import { runTaxScenario } from '../tax';

export const executeRunTaxScenario: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args, portfolioId } = runtime;
  return runTaxScenario(supabase, args, portfolioId);
};
