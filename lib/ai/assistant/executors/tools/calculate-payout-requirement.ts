import type { AssistantToolExecutor } from '../../executor-types';

export const executeCalculatePayoutRequirement: AssistantToolExecutor = async (
  _runtime,
) => {
  {
    return {
      action: null,
      output: {
        feature_not_available: true,
        message:
          'Payout calculation requires payout_history and v_payout_status (not yet deployed in the clean migration set).',
      },
    };
  }
};
