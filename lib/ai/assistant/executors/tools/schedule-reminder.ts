import type { AssistantToolExecutor } from '../../executor-types';
import { scheduleReminder } from '../grants';

export const executeScheduleReminder: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  return await scheduleReminder(supabase, args, portfolioId);
};
