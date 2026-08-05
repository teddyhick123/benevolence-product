import type { AssistantToolExecutor } from '../../executor-types';

export const executeAssessQualifyingDistribution: AssistantToolExecutor =
  async (_runtime) => {
    {
      return {
        action: null,
        output: {
          feature_not_available: true,
          message:
            'Qualifying distribution tracking requires the qualifying_distributions and payout_history migrations (not yet deployed). Please track distributions manually.',
        },
      };
    }
  };
