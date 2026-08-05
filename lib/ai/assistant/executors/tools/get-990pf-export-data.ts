import type { AssistantToolExecutor } from '../../executor-types';

export const executeGet_990pfExportData: AssistantToolExecutor = async (
  _runtime,
) => {
  {
    return {
      action: null,
      output: {
        feature_not_available: true,
        message:
          '990-PF export requires the payout_history and qualifying_distributions migrations (not yet deployed). Please compile this data manually.',
      },
    };
  }
};
