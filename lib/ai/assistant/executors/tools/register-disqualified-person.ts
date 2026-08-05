import type { AssistantToolExecutor } from '../../executor-types';

export const executeRegisterDisqualifiedPerson: AssistantToolExecutor = async (
  _runtime,
) => {
  {
    return {
      action: null,
      output: {
        feature_not_available: true,
        message:
          'Disqualified person registry requires the disqualified_persons migration (not yet deployed). Please track manually.',
      },
    };
  }
};
