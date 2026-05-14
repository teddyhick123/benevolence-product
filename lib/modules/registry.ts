/**
 * Module Registry
 *
 * Server-side module definitions for the platform.
 * Each module contains AI tools, database tables, UI routes, and system prompts.
 * Organizations can enable/disable modules to customize their experience.
 *
 * NOTE: For client-side use, import from './client-info' instead.
 */

import type { ModuleId, ModuleDefinition } from './types';

// Re-export types for backwards compatibility
export type { ModuleId, ModuleDefinition } from './types';

/**
 * Complete registry of all modules and their configurations
 */
export const MODULE_REGISTRY: Record<ModuleId, ModuleDefinition> = {
  core: {
    id: 'core',
    name: 'Core',
    description: 'Basic portfolio and holding management - always enabled',
    isCore: true,
    icon: 'folder',
    tools: [
      'list_holdings',
      'get_portfolio_summary',
      'search_holdings',
      'add_holding',
      'update_holding',
      'remove_holding',
      'get_holding_details',
    ],
    tables: [
      'portfolios',
      'holdings',
      'portfolio_members',
      'organizations',
      'organization_members',
    ],
    routes: [
      '/dashboard',
      '/dashboard/holdings',
      '/org',
    ],
    systemPromptAddition: `
You can help manage the portfolio and holdings. Available actions include:
- List and search holdings
- Add, update, or remove holdings
- Get portfolio summaries and holding details
`,
  },

  impact_tracking: {
    id: 'impact_tracking',
    name: 'Impact Tracking',
    description: 'KPIs, metrics, trends, and visualizations',
    isCore: false,
    icon: 'chart-bar',
    tools: [
      'add_metric_fact',
      'get_metric_trend',
      'compare_holdings',
      'create_widget',
      'create_portfolio_widget',
      'generate_d3_chart',
      'get_chart_data',
      'list_widgets',
      'display_widget',
      'add_location',
    ],
    tables: [
      'metrics',
      'metric_facts',
      'staging_metric_facts',
      'portfolio_metric_targets',
      'widgets',
      'holding_widgets',
      'holding_locations',
    ],
    routes: [
      '/dashboard/metrics',
      '/dashboard/map',
      '/dashboard/widgets',
    ],
    systemPromptAddition: `
You can track and visualize impact metrics. Available actions include:
- Add metric data points (KPIs) for holdings
- View metric trends over time
- Compare holdings on specific metrics
- Create visualization widgets (charts, gauges, grids)
- Generate D3 charts from data

Common metric types:
- Environmental: CARBON_EMISSIONS, RENEWABLE_MWH, WATER_SAVED, TREES_PLANTED
- Social: JOBS_CREATED, PEOPLE_SERVED, STUDENTS_EDUCATED, MEALS_PROVIDED
- Financial: REVENUE_GENERATED, COST_SAVINGS, ROI_PERCENTAGE
`,
  },

  reporting: {
    id: 'reporting',
    name: 'Reporting',
    description: 'Custom reports, templates, and document exports',
    isCore: false,
    icon: 'document-text',
    dependencies: ['impact_tracking'],
    tools: [
      'generate_holding_report',
      'generate_custom_report',
      'save_report_template',
      'list_report_templates',
      'export_data',
    ],
    tables: [
      'report_templates',
      'generated_documents',
      'report_schedules',
    ],
    routes: [
      '/dashboard/reports',
    ],
    systemPromptAddition: `
You can generate comprehensive reports with inline charts. Available actions include:
- Generate holding reports with metrics and charts
- Create custom portfolio-wide or sector-based reports
- Save report configurations as reusable templates
- Export data to CSV, JSON, or Excel formats
- Schedule recurring reports (daily, weekly, monthly, quarterly, yearly)

Reports can include sections for overview, financials, impact metrics, and trends.
Charts are rendered inline within the report narrative.
Generated documents are stored and can be shared via public links.
`,
  },

  tax_optimization: {
    id: 'tax_optimization',
    name: 'Tax Optimization',
    description: 'Tax scenarios, deductions, and compliance tracking',
    isCore: false,
    icon: 'calculator',
    tools: [
      'run_tax_scenario',
      'calculate_deduction',
      'get_carryforward',
    ],
    tables: [
      'tax_profiles',
      'contributions',
      'tax_documents',
      'agi_estimates',
    ],
    routes: [
      '/dashboard/tax',
      '/dashboard/tax/scenarios',
      '/dashboard/tax/contributions',
    ],
    systemPromptAddition: `
You can help optimize tax strategy for charitable giving. Available actions include:
- Run tax scenarios comparing cash vs appreciated stock donations
- Calculate potential deductions based on AGI limits
- Track carryforward amounts from prior years
- Generate Form 8283 for non-cash charitable contributions

Tax limits:
- Cash to public charities: 60% of AGI
- Appreciated assets to public charities: 30% of AGI
- Carryforward period: 5 years
`,
  },

  grant_management: {
    id: 'grant_management',
    name: 'Grant Management',
    description: 'Due diligence, milestones, payments, and workflow automation',
    isCore: false,
    icon: 'clipboard-check',
    tools: [
      'start_due_diligence',
      'get_workflow_status',
      'complete_workflow_task',
      'track_milestone',
      'schedule_reminder',
      'get_upcoming_deadlines',
      'log_grant_communication',
      'get_grant_health',
      'record_grant_payment',
    ],
    tables: [
      'grant_details',
      'grant_milestones',
      'grant_reports',
      'workflow_templates',
      'workflow_instances',
      'workflow_tasks',
      'grant_payments',
      'grant_budget_items',
      'grant_communications',
      'grant_contacts',
      'grant_documents',
      'reminders',
    ],
    routes: [
      '/dashboard/grants',
      '/dashboard/grants/workflows',
      '/dashboard/grants/calendar',
      '/dashboard/grants/payments',
    ],
    systemPromptAddition: `
You can manage grant workflows and due diligence. Available actions include:
- Start due diligence checklists for new grantees
- Track grant milestones and reporting requirements
- Manage workflow tasks and assignments
- Schedule reminders for upcoming deadlines
- Log communications with grantees
- Track payments and disbursements
- Assess grant health and risk levels

Due diligence typically includes:
- 501(c)(3) verification
- Financial review (990 analysis, audits)
- Mission alignment assessment
- Capacity evaluation
- Reference checks
- Site visits (when applicable)

Payment tracking includes scheduled, approved, and completed disbursements.
`,
  },

  donor_management: {
    id: 'donor_management',
    name: 'Donor Management',
    description: 'Track contributions received and generate acknowledgments',
    isCore: false,
    icon: 'users',
    tools: [
      'log_contribution_received',
      'generate_receipt',
      'generate_acknowledgment',
      'get_donor_summary',
      'search_donors',
    ],
    tables: [
      'donors',
      'contributions_received',
      'acknowledgment_letters',
      'donor_communications',
    ],
    routes: [
      '/dashboard/donors',
      '/dashboard/donors/receipts',
      '/dashboard/donors/acknowledgments',
    ],
    systemPromptAddition: `
You can track donations received by the organization. Available actions include:
- Log contributions received from donors
- Generate tax receipts for donors
- Create acknowledgment letters
- View donor giving history and summaries
- Search and filter donor records

Receipts must include required IRS information:
- Organization name and EIN
- Date of contribution
- Amount (or description for non-cash)
- Statement that no goods/services were provided (if applicable)
`,
  },

  pledge_tracking: {
    id: 'pledge_tracking',
    name: 'Pledge Tracking',
    description: 'Track donor commitments, installment schedules, and pledge fulfillment',
    isCore: false,
    icon: 'calendar-check',
    dependencies: ['donor_management'],
    tools: [],
    tables: ['pledges', 'pledge_installments', 'pledge_events'],
    routes: ['/dashboard/pledges'],
    systemPromptAddition: `
Pledge tracking is enabled. Pledge AI tools are not available in this release.
`,
  },

  external_data: {
    id: 'external_data',
    name: 'External Data',
    description: 'Charity Navigator, Candid, and news integrations',
    isCore: false,
    icon: 'globe',
    tools: [
      'refresh_charity_data',
      'search_similar_charities',
      'get_charity_financials',
    ],
    tables: [
      'external_data_cache',
      'holding_news',
      'charity_ratings',
    ],
    routes: [],
    systemPromptAddition: `
You can fetch real-time data from external sources. Available actions include:
- Refresh charity data from Charity Navigator and Candid
- Search for similar charities by sector/size
- Fetch recent news articles about holdings
- Get detailed charity financial data

External data sources:
- Charity Navigator: ratings, financial health, accountability
- Candid/GuideStar: IRS data, profiles, DEI information
- ProPublica Nonprofit Explorer: 990 filings
- News APIs: recent articles and sentiment
`,
  },

  analytics: {
    id: 'analytics',
    name: 'Analytics',
    description: 'Projections, benchmarking, risk analysis, and AI-generated insights',
    isCore: false,
    icon: 'trending-up',
    dependencies: ['impact_tracking'],
    tools: [
      'project_metric_trend',
      'benchmark_holding',
      'analyze_portfolio_risk',
      'generate_insight',
      'get_risk_snapshot',
    ],
    tables: [
      'benchmark_data',
      'metric_projections_cache',
      'portfolio_risk_snapshots',
      'analytics_insights',
    ],
    routes: [
      '/dashboard/analytics',
      '/dashboard/analytics/projections',
      '/dashboard/analytics/benchmarks',
      '/dashboard/analytics/risk',
      '/dashboard/analytics/insights',
    ],
    systemPromptAddition: `
You can provide advanced analytics, projections, and AI-generated insights. Available actions include:
- Project metric trends with confidence intervals (linear regression, moving average)
- Benchmark holdings against sector, size, and geographic peers
- Analyze portfolio risk including concentration, sector, and geographic exposure
- Generate and manage AI-powered insights and recommendations
- Track risk snapshots over time with historical analysis

Projection methods:
- Linear regression with R-squared confidence scoring
- Moving average with configurable window sizes
- Confidence intervals (95%) for all projections

Risk analysis includes:
- Concentration risk (top 3 holdings, Herfindahl-Hirschman Index)
- Sector distribution and largest sector exposure
- Geographic distribution and regional concentration
- Overall risk scoring (0-100) with severity levels

Benchmarking capabilities:
- Compare holdings against portfolio peers
- Compare against external sector benchmarks
- Percentile rankings (25th, 50th, 75th)
- Program expense ratio and efficiency metrics

Insights are categorized by:
- Severity: critical, high, medium, low, info
- Categories: performance, risk, compliance, opportunity, alert, trend
- Actionable recommendations with suggested next steps
`,
  },

  compliance_regulatory: {
    id: 'compliance_regulatory',
    name: 'Compliance & Regulatory',
    description: 'IRC §4942 payout tracking, self-dealing screening, filing calendar, and 990-PF data assembly',
    isCore: false,
    icon: 'shield-check',
    dependencies: ['grant_management'],
    tools: [
      'get_compliance_status',
      'calculate_payout_requirement',
      'get_payout_forecast',
      'screen_for_self_dealing',
      'register_disqualified_person',
      'track_filing_deadline',
      'log_expenditure_responsibility',
      'assess_qualifying_distribution',
      'get_990pf_export_data',
      'get_state_registration_status',
    ],
    tables: [
      'compliance_profiles',
      'disqualified_persons',
      'filing_calendar',
      'self_dealing_incidents',
      'state_registrations',
      'expenditure_responsibility_grants',
      'qualifying_distributions',
      'payout_history',
    ],
    routes: [
      '/dashboard/compliance',
    ],
    systemPromptAddition: `
You can assist with philanthropic compliance and regulatory requirements. Available actions include:

**IRC §4942 Payout Requirements (Private Foundations):**
- Calculate the minimum distribution requirement (5% of average net investment assets)
- Track qualifying distributions made to date vs. required distributable amount
- Forecast remaining payout needed and warn of shortfalls
- Classify distributions by category (grants, program expenses, set-asides)

**IRC §4941 Self-Dealing Prevention:**
- Screen proposed transactions against the registered disqualified persons list
- Flag potential self-dealing incidents for review
- Track incident resolution and Form 4720 reporting

**IRC §4946 Disqualified Persons Registry:**
- Maintain registry of foundation managers, substantial contributors, 20%+ owners, family members, and 35%+ owned entities
- Track active vs. terminated relationships

**IRC §4945 Expenditure Responsibility:**
- Track ER agreements for grants to non-public-charity grantees
- Monitor required report submissions and terminal reports
- Flag compliance deficiencies

**Filing Calendar:**
- Manage federal and state filing deadlines (990-PF, 990, 990-T, Form 4720, Form 8868, state registrations)
- Track extensions, filed dates, and confirmation numbers

**State Registrations:**
- Track registration status across all states where organization solicits or operates
- Monitor renewal deadlines and annual report requirements

**990-PF Data Assembly:**
- Export structured data by 990-PF Part for preparer review
- Pull qualifying distributions, investment assets, and distributable amount
`,
  },
};

/**
 * Get all tool names for a set of enabled modules
 * Includes dependencies automatically
 */
export function getToolsForModules(enabledModules: ModuleId[]): string[] {
  const tools = new Set<string>();
  const processedModules = new Set<ModuleId>();

  function processModule(moduleId: ModuleId) {
    if (processedModules.has(moduleId)) return;
    processedModules.add(moduleId);

    const moduleDef = MODULE_REGISTRY[moduleId];
    if (!moduleDef) return;

    // Add this module's tools
    moduleDef.tools.forEach(tool => tools.add(tool));

    // Process dependencies
    moduleDef.dependencies?.forEach(depId => processModule(depId));
  }

  // Always include core
  processModule('core');

  // Process enabled modules
  enabledModules.forEach(moduleId => processModule(moduleId));

  return Array.from(tools);
}

/**
 * Get combined system prompt additions for enabled modules
 */
export function getSystemPromptForModules(enabledModules: ModuleId[]): string {
  const additions: string[] = [];
  const processedModules = new Set<ModuleId>();

  function processModule(moduleId: ModuleId) {
    if (processedModules.has(moduleId)) return;
    processedModules.add(moduleId);

    const moduleDef = MODULE_REGISTRY[moduleId];
    if (!moduleDef) return;

    // Add system prompt if present
    if (moduleDef.systemPromptAddition) {
      additions.push(`## ${moduleDef.name}\n${moduleDef.systemPromptAddition.trim()}`);
    }

    // Process dependencies
    moduleDef.dependencies?.forEach(depId => processModule(depId));
  }

  // Always include core
  processModule('core');

  // Process enabled modules
  enabledModules.forEach(moduleId => processModule(moduleId));

  return additions.join('\n\n');
}

/**
 * Check if a route is accessible given enabled modules
 */
export function isRouteAccessible(route: string, enabledModules: ModuleId[]): boolean {
  const allModules = ['core' as ModuleId, ...enabledModules];

  // Add dependencies
  const withDeps = new Set<ModuleId>(allModules);
  allModules.forEach(moduleId => {
    MODULE_REGISTRY[moduleId]?.dependencies?.forEach(depId => withDeps.add(depId));
  });

  // Check if any enabled module provides this route
  for (const moduleId of withDeps) {
    const moduleDef = MODULE_REGISTRY[moduleId];
    if (moduleDef?.routes.some(r => route.startsWith(r))) {
      return true;
    }
  }

  return false;
}

/**
 * Get all available modules as an array (for UI listing)
 */
export function getAllModules(): ModuleDefinition[] {
  return Object.values(MODULE_REGISTRY).sort((a, b) => {
    // Core first, then alphabetically
    if (a.isCore && !b.isCore) return -1;
    if (!a.isCore && b.isCore) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Check if a module can be disabled (not a dependency of other enabled modules)
 */
export function canDisableModule(moduleId: ModuleId, enabledModules: ModuleId[]): {
  canDisable: boolean;
  blockedBy?: string[];
} {
  const moduleDef = MODULE_REGISTRY[moduleId];

  if (!moduleDef) {
    return { canDisable: false, blockedBy: ['Module not found'] };
  }

  if (moduleDef.isCore) {
    return { canDisable: false, blockedBy: ['Core modules cannot be disabled'] };
  }

  // Check if other enabled modules depend on this one
  const blockedBy: string[] = [];
  for (const enabledId of enabledModules) {
    if (enabledId === moduleId) continue;
    const enabledModule = MODULE_REGISTRY[enabledId];
    if (enabledModule?.dependencies?.includes(moduleId)) {
      blockedBy.push(enabledModule.name);
    }
  }

  return {
    canDisable: blockedBy.length === 0,
    blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
  };
}

/**
 * Get modules required to enable a specific module (including dependencies)
 */
export function getRequiredModules(moduleId: ModuleId): ModuleId[] {
  const required = new Set<ModuleId>();

  function addDependencies(id: ModuleId) {
    const modDef = MODULE_REGISTRY[id];
    if (!modDef) return;

    modDef.dependencies?.forEach(depId => {
      if (!required.has(depId)) {
        required.add(depId);
        addDependencies(depId);
      }
    });
  }

  addDependencies(moduleId);
  return Array.from(required);
}
