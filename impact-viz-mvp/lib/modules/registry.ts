/**
 * Module Registry
 *
 * Defines all available modules in the Benevolence platform.
 * Each module contains a set of AI tools, database tables, and UI routes.
 * Organizations can enable/disable modules to customize their experience.
 */

export type ModuleId =
  | 'core'
  | 'impact_tracking'
  | 'reporting'
  | 'tax_optimization'
  | 'grant_management'
  | 'donor_management'
  | 'external_data'
  | 'analytics';

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  description: string;
  isCore: boolean;
  icon: string;
  tools: string[];
  tables: string[];
  routes: string[];
  dependencies?: ModuleId[];
  systemPromptAddition?: string;
}

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
      'organization_holdings',
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
    ],
    routes: [
      '/dashboard/reports',
    ],
    systemPromptAddition: `
You can generate comprehensive reports with inline charts. Available actions include:
- Generate holding reports with metrics and charts
- Create custom portfolio-wide or sector-based reports
- Save report configurations as reusable templates
- Export data to PDF, CSV, or Excel formats

Reports can include sections for overview, financials, impact metrics, and trends.
Charts are rendered inline within the report narrative.
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
    description: 'Due diligence, milestones, and workflow automation',
    isCore: false,
    icon: 'clipboard-check',
    tools: [
      'start_due_diligence',
      'track_milestone',
      'get_workflow_status',
      'complete_workflow_task',
      'schedule_reminder',
      'get_upcoming_deadlines',
    ],
    tables: [
      'grant_details',
      'workflow_templates',
      'workflow_instances',
      'workflow_tasks',
      'reminders',
    ],
    routes: [
      '/dashboard/grants',
      '/dashboard/grants/workflows',
      '/dashboard/grants/calendar',
    ],
    systemPromptAddition: `
You can manage grant workflows and due diligence. Available actions include:
- Start due diligence checklists for new grantees
- Track grant milestones and reporting requirements
- Manage workflow tasks and assignments
- Schedule reminders for upcoming deadlines
- View deadline calendars

Due diligence typically includes:
- 501(c)(3) verification
- Financial review
- Mission alignment assessment
- Capacity evaluation
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
    description: 'Projections, benchmarking, and risk analysis',
    isCore: false,
    icon: 'trending-up',
    dependencies: ['impact_tracking'],
    tools: [
      'project_metric_trend',
      'benchmark_holding',
      'analyze_portfolio_risk',
    ],
    tables: [
      'benchmark_data',
      'metric_projections_cache',
    ],
    routes: [
      '/dashboard/analytics',
      '/dashboard/analytics/projections',
      '/dashboard/analytics/benchmarks',
    ],
    systemPromptAddition: `
You can provide advanced analytics and projections. Available actions include:
- Project metric trends with confidence intervals
- Benchmark holdings against sector/size peers
- Analyze portfolio risk and concentration
- Run Monte Carlo simulations for forecasting

Projection methods:
- Linear regression
- Exponential smoothing
- Monte Carlo simulation (1000+ runs)

Risk analysis includes:
- Sector concentration
- Geographic concentration
- Single-holding exposure
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

    const module = MODULE_REGISTRY[moduleId];
    if (!module) return;

    // Add this module's tools
    module.tools.forEach(tool => tools.add(tool));

    // Process dependencies
    module.dependencies?.forEach(depId => processModule(depId));
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

    const module = MODULE_REGISTRY[moduleId];
    if (!module) return;

    // Add system prompt if present
    if (module.systemPromptAddition) {
      additions.push(`## ${module.name}\n${module.systemPromptAddition.trim()}`);
    }

    // Process dependencies
    module.dependencies?.forEach(depId => processModule(depId));
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
    const module = MODULE_REGISTRY[moduleId];
    if (module?.routes.some(r => route.startsWith(r))) {
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
  const module = MODULE_REGISTRY[moduleId];

  if (!module) {
    return { canDisable: false, blockedBy: ['Module not found'] };
  }

  if (module.isCore) {
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
    const module = MODULE_REGISTRY[id];
    if (!module) return;

    module.dependencies?.forEach(depId => {
      if (!required.has(depId)) {
        required.add(depId);
        addDependencies(depId);
      }
    });
  }

  addDependencies(moduleId);
  return Array.from(required);
}
