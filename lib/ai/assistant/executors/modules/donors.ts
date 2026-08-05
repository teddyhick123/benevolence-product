import { executeLogContributionReceived } from '../tools/log-contribution-received';
import { executeGenerateReceipt } from '../tools/generate-receipt';
import { executeGenerateAcknowledgment } from '../tools/generate-acknowledgment';
import { executeGetDonorSummary } from '../tools/get-donor-summary';
import { executeSearchDonors } from '../tools/search-donors';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const DONORS_EXECUTORS = {
  log_contribution_received: executeLogContributionReceived,
  generate_receipt: executeGenerateReceipt,
  generate_acknowledgment: executeGenerateAcknowledgment,
  get_donor_summary: executeGetDonorSummary,
  search_donors: executeSearchDonors,
} satisfies AssistantToolExecutorRegistry;
