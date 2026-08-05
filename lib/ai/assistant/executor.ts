import type { ModuleId } from '@/lib/modules/types';
import type { ToolResult } from '@/lib/ai/types';
import type {
  AssistantToolArguments,
  AssistantToolExecutorRegistry,
  AssistantToolParams,
} from './executor-types';
import { CORE_EXECUTORS } from './executors/modules/core';
import { CUSTOM_FIELDS_EXECUTORS } from './executors/modules/custom-fields';
import { IMPACT_EXECUTORS } from './executors/modules/impact';
import { REPORTING_EXECUTORS } from './executors/modules/reporting';
import { EXTERNAL_DATA_EXECUTORS } from './executors/modules/external-data';
import { TAX_EXECUTORS } from './executors/modules/tax';
import { ANALYTICS_EXECUTORS } from './executors/modules/analytics';
import { GRANTS_EXECUTORS } from './executors/modules/grants';
import { DONORS_EXECUTORS } from './executors/modules/donors';
import { COMPLIANCE_EXECUTORS } from './executors/modules/compliance';

export type { AssistantToolParams } from './executor-types';

export const WRITE_TOOLS = new Set([
  'add_holding',
  'update_holding',
  'remove_holding',
  'add_metric_fact',
  'delete_metric_fact',
  'create_widget',
  'create_portfolio_widget',
  'add_widget',
  'remove_widget',
  'add_location',
  'save_report_template',
  'refresh_charity_data',
  'start_due_diligence',
  'complete_workflow_task',
  'track_milestone',
  'schedule_reminder',
  'log_grant_communication',
  'record_grant_payment',
  'log_contribution_received',
  'generate_receipt',
  'generate_acknowledgment',
  'track_filing_deadline',
  'register_disqualified_person',
  'assess_qualifying_distribution',
  'log_expenditure_responsibility',
  'suggest_context_entry',
]);

export const TOOL_EXECUTORS_BY_MODULE: Readonly<
  Partial<Record<ModuleId, AssistantToolExecutorRegistry>>
> = {
  core: { ...CORE_EXECUTORS, ...CUSTOM_FIELDS_EXECUTORS },
  impact_tracking: IMPACT_EXECUTORS,
  reporting: REPORTING_EXECUTORS,
  external_data: EXTERNAL_DATA_EXECUTORS,
  tax_optimization: TAX_EXECUTORS,
  analytics: ANALYTICS_EXECUTORS,
  grant_management: GRANTS_EXECUTORS,
  donor_management: DONORS_EXECUTORS,
  compliance_regulatory: COMPLIANCE_EXECUTORS,
};

export const TOOL_EXECUTOR_BY_NAME: Readonly<AssistantToolExecutorRegistry> =
  Object.freeze(Object.assign({}, ...Object.values(TOOL_EXECUTORS_BY_MODULE)));

async function verifyPortfolioAccess(params: AssistantToolParams) {
  const { data, error } = await params.db
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', params.portfolioId)
    .eq('user_id', params.userId)
    .single();

  if (error || !data) {
    throw new Error(
      'Access denied: You do not have permission to access this portfolio',
    );
  }
}

function enforceToolScope(params: AssistantToolParams) {
  const portfolioArgument = params.args.portfolio_id;
  if (portfolioArgument && portfolioArgument !== params.portfolioId) {
    throw new Error(
      'Tool portfolio scope does not match the authorized portfolio',
    );
  }

  const orgArgument = params.args.org_id ?? params.args.organization_id;
  if (orgArgument && (!params.orgId || orgArgument !== params.orgId)) {
    throw new Error(
      'Tool organization scope does not match the authorized organization',
    );
  }
}

export async function executeAssistantTool(
  params: AssistantToolParams,
): Promise<ToolResult> {
  if (WRITE_TOOLS.has(params.functionName) && params.memberRole === 'viewer') {
    return {
      error:
        'Viewers cannot perform write operations. Request a role upgrade from your org admin.',
    } as unknown as ToolResult;
  }

  await verifyPortfolioAccess(params);
  enforceToolScope(params);
  const executor = TOOL_EXECUTOR_BY_NAME[params.functionName];
  if (!executor) throw new Error(`Unknown function: ${params.functionName}`);

  const { functionName: _functionName, args, ...scope } = params;
  return executor({
    ...scope,
    args: args as AssistantToolArguments,
  });
}
