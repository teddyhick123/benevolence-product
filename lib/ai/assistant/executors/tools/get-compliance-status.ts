import type { AssistantToolExecutor } from '../../executor-types';

export const executeGetComplianceStatus: AssistantToolExecutor = async (
  _runtime,
) => {
  {
    return {
      action: null,
      output: {
        feature_not_available: true,
        message:
          'Advanced compliance dashboard (self-dealing incidents, payout status, upcoming deadlines) requires migrations not yet deployed. Use get_state_registration_status and track_filing_deadline for available compliance data.',
      },
    };
  }
};
