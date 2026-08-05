import type { AssistantToolExecutor } from '../../executor-types';
import { recordGrantPayment } from '../grants';

export const executeRecordGrantPayment: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId, capabilities } = runtime;
  return await recordGrantPayment(supabase, args, portfolioId, capabilities);
};
