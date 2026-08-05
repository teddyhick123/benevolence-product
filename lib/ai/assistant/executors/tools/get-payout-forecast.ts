import type { AssistantToolExecutor } from '../../executor-types';

export const executeGetPayoutForecast: AssistantToolExecutor = async (
  _runtime,
) => {
  {
    return {
      action: null,
      output: {
        feature_not_available: true,
        message:
          'Payout forecast requires payout_history and qualifying_distributions tables (not yet deployed in the clean migration set).',
      },
    };
  }
};
