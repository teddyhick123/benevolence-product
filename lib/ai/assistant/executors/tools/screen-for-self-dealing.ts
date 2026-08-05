import type { AssistantToolExecutor } from '../../executor-types';

export const executeScreenForSelfDealing: AssistantToolExecutor = async (
  _runtime,
) => {
  {
    return {
      action: null,
      output: {
        feature_not_available: true,
        message:
          'Self-dealing screening requires the disqualified_persons and self_dealing_incidents migrations (not yet deployed). Please log incidents manually.',
      },
    };
  }
};
