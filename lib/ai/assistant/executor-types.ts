import type { SupabaseClient } from '@/lib/database-client';
import type { ToolResult } from '@/lib/ai/types';
import type { AssistantToolCapabilities } from '@/lib/api/repositories/ai-tools';

type ChartPreferenceArgument = {
  metric_code?: string;
  chart_type?: string;
};

type TaxScenarioAssetArgument = {
  holding_period?: string;
  current_value: number;
  cost_basis: number;
};

/** Provider-neutral union of the inputs accepted by registered portfolio tools. */
export type AssistantToolArguments = {
  [key: string]: unknown;
  actual_date?: string;
  agi?: number;
  amount: number;
  asset_type: string;
  assets?: TaxScenarioAssetArgument[];
  assigned_to?: string;
  auto_generate_receipt?: boolean;
  benchmark_type?: string;
  campaign?: string;
  chart_preferences?: ChartPreferenceArgument[];
  chart_type?: string;
  colors?: string[];
  comm_type?: string;
  config?: Record<string, unknown>;
  contact_name?: string;
  context_key?: string;
  context_type?: string;
  context_value?: string;
  contribution_date?: string;
  contribution_id: string;
  contribution_type?: string;
  country?: string;
  custom_message?: string;
  data?: Array<Record<string, unknown>>;
  data_type?: string;
  date_from?: string;
  date_to?: string;
  days_ahead?: number;
  description?: string;
  designation?: string;
  direction?: string;
  donation_amount: number;
  donor_email?: string;
  donor_id: string;
  donor_name?: string;
  donor_tier?: string;
  donor_type?: string;
  due_date?: string;
  ein: string;
  email?: string;
  entity_id: string;
  entity_type: 'holding' | 'grant' | 'donor' | 'contribution';
  extension_due_date?: string;
  field_key?: string;
  filing_id?: string;
  filing_type: string;
  follow_up_date?: string;
  follow_up_required?: boolean;
  format?: string;
  gift_type?: string;
  has_pending_acknowledgments?: boolean;
  has_pending_receipts?: boolean;
  holding_id: string;
  holding_ids?: string[];
  include_completed?: boolean;
  include_contributions?: boolean;
  include_kpis?: boolean;
  include_sections?: string[];
  include_sectors?: boolean;
  include_top_holdings?: boolean;
  is_default?: boolean;
  is_restricted?: boolean;
  jurisdiction?: string;
  letter_type?: string;
  lifecycle_stage?: string;
  limit?: number;
  max_allocation?: number;
  method?: string;
  metric_code: string;
  metric_codes?: string[];
  metrics?: string[];
  milestone_id?: string;
  min_allocation?: number;
  min_lifetime_giving?: number;
  name: string;
  name_contains?: string;
  notes?: string;
  operator?: string;
  organization_id: string;
  outcome?: string;
  payment_id?: string;
  payment_method?: string;
  periods_ahead?: number;
  portfolio_id?: string;
  quid_pro_quo_value?: number;
  reasoning?: string;
  recency_status?: string;
  recipient_type: string;
  risk_type?: string;
  scenario_type: string;
  scheduled_date?: string;
  scope: string;
  sector?: string;
  send_immediately?: boolean;
  send_via?: string;
  series_field?: string;
  show_grid?: boolean;
  sort_order?: string;
  state_code: string;
  status?: string;
  status_filter?: string;
  subject?: string;
  summary?: string;
  task_id?: string;
  tax_year?: number;
  template_id?: string;
  time_range?: string;
  title: string;
  type: string;
  changes: Record<string, unknown>;
  value?: unknown;
  widget_id?: string;
  window?: string;
  workflow_id?: string;
  x_axis_label?: string;
  x_field?: string;
  x_type?: string;
  y_axis_label?: string;
  y_field?: string;
  year?: number | string;
};

export type AssistantToolRuntime = {
  /** Authenticated session client; elevated clients never enter AI executors. */
  db: SupabaseClient;
  args: AssistantToolArguments;
  portfolioId: string;
  orgId?: string;
  userId: string;
  sessionId: string;
  batchId: string;
  sequenceOrder: number;
  userPrompt: string;
  memberRole?: string;
  capabilities: AssistantToolCapabilities;
};

export type AssistantToolExecutor = (
  _runtime: AssistantToolRuntime,
) => Promise<ToolResult>;

export type AssistantToolExecutorRegistry = Record<
  string,
  AssistantToolExecutor
>;

export type AssistantToolParams = Omit<AssistantToolRuntime, 'args'> & {
  functionName: string;
  args: Record<string, unknown>;
};
