import { executeGetComplianceStatus } from '../tools/get-compliance-status';
import { executeCalculatePayoutRequirement } from '../tools/calculate-payout-requirement';
import { executeGetPayoutForecast } from '../tools/get-payout-forecast';
import { executeScreenForSelfDealing } from '../tools/screen-for-self-dealing';
import { executeRegisterDisqualifiedPerson } from '../tools/register-disqualified-person';
import { executeTrackFilingDeadline } from '../tools/track-filing-deadline';
import { executeLogExpenditureResponsibility } from '../tools/log-expenditure-responsibility';
import { executeAssessQualifyingDistribution } from '../tools/assess-qualifying-distribution';
import { executeGet_990pfExportData } from '../tools/get-990pf-export-data';
import { executeGetStateRegistrationStatus } from '../tools/get-state-registration-status';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const COMPLIANCE_EXECUTORS = {
  get_compliance_status: executeGetComplianceStatus,
  calculate_payout_requirement: executeCalculatePayoutRequirement,
  get_payout_forecast: executeGetPayoutForecast,
  screen_for_self_dealing: executeScreenForSelfDealing,
  register_disqualified_person: executeRegisterDisqualifiedPerson,
  track_filing_deadline: executeTrackFilingDeadline,
  log_expenditure_responsibility: executeLogExpenditureResponsibility,
  assess_qualifying_distribution: executeAssessQualifyingDistribution,
  get_990pf_export_data: executeGet_990pfExportData,
  get_state_registration_status: executeGetStateRegistrationStatus,
} satisfies AssistantToolExecutorRegistry;
