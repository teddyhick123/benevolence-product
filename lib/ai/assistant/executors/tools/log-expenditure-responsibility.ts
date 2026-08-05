import type { AssistantToolExecutor } from '../../executor-types';

export const executeLogExpenditureResponsibility: AssistantToolExecutor =
  async (_runtime) => {
    {
      return {
        action: null,
        output: {
          feature_not_available: true,
          message:
            'Expenditure responsibility tracking requires the expenditure_responsibility_grants migration (not yet deployed). Please track grant compliance manually.',
        },
      };
    }
  };
