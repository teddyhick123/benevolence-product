# Modular AI Platform Architecture

## Vision

Transform Benevolence into a **configurable AI-powered platform** where each organization gets a tailored instance of Claude with exactly the tools they need. Organizations enable modules based on their use case - whether they're a family foundation, community foundation, DAF sponsor, or nonprofit.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Module-aware │  │ Conditional  │  │  Dynamic Navigation  │  │
│  │ Components   │  │ UI Rendering │  │  & Feature Gates     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API / Middleware                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Module Auth  │  │ Dynamic Tool │  │  Permission Gates    │  │
│  │ Middleware   │  │ Injection    │  │  Per Module          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Module Registry                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MODULES = {                                              │  │
│  │    core:           { tools: [...], tables: [...] }       │  │
│  │    impact_tracking: { tools: [...], tables: [...] }       │  │
│  │    tax_optimization: { tools: [...], tables: [...] }      │  │
│  │    grant_management: { tools: [...], tables: [...] }      │  │
│  │    donor_management: { tools: [...], tables: [...] }      │  │
│  │    reporting:       { tools: [...], tables: [...] }       │  │
│  │  }                                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Claude AI Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Dynamic Tool │  │ Module-aware │  │  Context Builder     │  │
│  │ Filtering    │  │ System Prompt│  │  Per Org             │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Database Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Org Modules  │  │ Module-based │  │  RLS Policies        │  │
│  │ Config       │  │ Tables       │  │  Per Module          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Definitions

### Core Module (Always Enabled)
**Purpose**: Basic portfolio/holding management available to all organizations.

| Tools | Tables | UI Components |
|-------|--------|---------------|
| `list_holdings` | `portfolios` | PortfolioDashboard |
| `get_portfolio_summary` | `holdings` | HoldingsList |
| `search_holdings` | `portfolio_members` | HoldingDetail |
| `add_holding` | `organization_members` | AIAssistantPanel |
| `update_holding` | `organizations` | |
| `remove_holding` | | |
| `get_holding_details` | | |

### Impact Tracking Module
**Purpose**: KPIs, metrics, trends, and impact visualization.

| Tools | Tables | UI Components |
|-------|--------|---------------|
| `add_metric_fact` | `metrics` | MetricsDashboard |
| `get_metric_trend` | `metric_facts` | KPITrendChart |
| `compare_holdings` | `staging_metric_facts` | ImpactMap |
| `create_widget` | `portfolio_metric_targets` | WidgetGallery |
| `create_portfolio_widget` | `widgets` | RadialProgress |
| `generate_d3_chart` | `holding_widgets` | PeopleGrid |
| `get_chart_data` | | |
| `list_widgets` | | |
| `display_widget` | | |

### Reporting Module
**Purpose**: Custom reports, templates, and document generation.

| Tools | Tables | UI Components |
|-------|--------|---------------|
| `generate_holding_report` | `report_templates` | ReportBuilder |
| `generate_custom_report` | `generated_documents` | TemplateManager |
| `save_report_template` | | PDFPreview |
| `list_report_templates` | | ExportPanel |
| `generate_pdf_report` | | |
| `export_data` | | |

### Tax Optimization Module
**Purpose**: Tax tracking, scenario modeling, and compliance.

| Tools | Tables | UI Components |
|-------|--------|---------------|
| `run_tax_scenario` | `tax_profiles` | TaxDashboard |
| `calculate_deduction` | `contributions` | ScenarioComparison |
| `analyze_contribution` | `tax_documents` | Form8283Generator |
| `get_carryforward` | `agi_estimates` | TurbotaxExport |
| `generate_form_8283` | | CarryforwardTracker |

### Grant Management Module
**Purpose**: Due diligence, milestones, and grantee workflows.

| Tools | Tables | UI Components |
|-------|--------|---------------|
| `start_due_diligence` | `grant_details` | DueDiligenceChecklist |
| `track_milestone` | `workflow_templates` | MilestoneTracker |
| `get_workflow_status` | `workflow_instances` | WorkflowDashboard |
| `complete_workflow_task` | `workflow_tasks` | DeadlineCalendar |
| `schedule_reminder` | `reminders` | ReminderManager |
| `get_upcoming_deadlines` | | |

### Donor Management Module
**Purpose**: Track contributions received, acknowledgments, receipts.

| Tools | Tables | UI Components |
|-------|--------|---------------|
| `log_contribution_received` | `donors` | DonorList |
| `generate_receipt` | `contributions_received` | ReceiptGenerator |
| `generate_acknowledgment` | `acknowledgment_letters` | AcknowledgmentTemplates |
| `get_donor_summary` | `donor_communications` | DonorDashboard |
| `search_donors` | | CommunicationLog |

### External Data Module
**Purpose**: Real-time data from Charity Navigator, Candid, news APIs.

| Tools | Tables | UI Components |
|-------|--------|---------------|
| `refresh_charity_data` | `external_data_cache` | CharityProfile |
| `search_similar_charities` | `holding_news` | NewsFeed |
| `fetch_news_about_holding` | `charity_ratings` | RatingsCard |
| `get_charity_financials` | | SimilarCharitiesPanel |

### Analytics Module
**Purpose**: Projections, benchmarking, risk analysis.

| Tools | Tables | UI Components |
|-------|--------|---------------|
| `project_metric_trend` | `benchmark_data` | ProjectionChart |
| `benchmark_holding` | `metric_projections_cache` | BenchmarkRadar |
| `analyze_portfolio_risk` | | RiskHeatmap |
| `run_monte_carlo` | | ConcentrationChart |

---

## Database Schema

### Organization Module Configuration

```sql
-- /db/0060_organization_modules.sql

-- Available modules in the system
CREATE TABLE IF NOT EXISTS public.modules (
  id TEXT PRIMARY KEY,  -- 'impact_tracking', 'tax_optimization', etc.
  name TEXT NOT NULL,
  description TEXT,
  is_core BOOLEAN DEFAULT false,  -- Core modules cannot be disabled
  icon TEXT,  -- Icon name for UI
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Which modules an organization has enabled
CREATE TABLE IF NOT EXISTS public.organization_modules (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  enabled_at TIMESTAMPTZ DEFAULT NOW(),
  enabled_by UUID REFERENCES auth.users(id),
  config JSONB DEFAULT '{}'::jsonb,  -- Module-specific configuration
  PRIMARY KEY (organization_id, module_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_org_modules_org_id
  ON public.organization_modules(organization_id);

-- RLS Policies
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_modules_read" ON public.organization_modules
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_admin());

CREATE POLICY "org_modules_admin" ON public.organization_modules
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "org_modules_service" ON public.organization_modules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed core modules
INSERT INTO public.modules (id, name, description, is_core, icon, sort_order) VALUES
  ('core', 'Core', 'Basic portfolio and holding management', true, 'folder', 0),
  ('impact_tracking', 'Impact Tracking', 'KPIs, metrics, trends, and visualizations', false, 'chart-bar', 1),
  ('reporting', 'Reporting', 'Custom reports, templates, and exports', false, 'document-text', 2),
  ('tax_optimization', 'Tax Optimization', 'Tax scenarios, deductions, and compliance', false, 'calculator', 3),
  ('grant_management', 'Grant Management', 'Due diligence, milestones, and workflows', false, 'clipboard-check', 4),
  ('donor_management', 'Donor Management', 'Track contributions received and acknowledgments', false, 'users', 5),
  ('external_data', 'External Data', 'Charity Navigator, Candid, and news integration', false, 'globe', 6),
  ('analytics', 'Analytics', 'Projections, benchmarking, and risk analysis', false, 'trending-up', 7)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_core = EXCLUDED.is_core,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- Function to check if org has module enabled
CREATE OR REPLACE FUNCTION public.org_has_module(p_org_id UUID, p_module_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.modules m
    LEFT JOIN public.organization_modules om
      ON om.module_id = m.id AND om.organization_id = p_org_id
    WHERE m.id = p_module_id
      AND (m.is_core = true OR om.organization_id IS NOT NULL)
  );
$$;

GRANT EXECUTE ON FUNCTION public.org_has_module(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_has_module(UUID, TEXT) TO service_role;
```

---

## Module Registry (TypeScript)

```typescript
// /lib/modules/registry.ts

import { Anthropic } from '@anthropic-ai/sdk';

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
  tools: string[];  // Tool names from claude-assistant.ts
  tables: string[];  // Database tables this module uses
  routes: string[];  // Frontend routes this module provides
  dependencies?: ModuleId[];  // Other modules this depends on
  systemPromptAddition?: string;  // Additional context for Claude
}

export const MODULE_REGISTRY: Record<ModuleId, ModuleDefinition> = {
  core: {
    id: 'core',
    name: 'Core',
    description: 'Basic portfolio and holding management',
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
    tables: ['portfolios', 'holdings', 'portfolio_members', 'organizations', 'organization_members'],
    routes: ['/dashboard', '/dashboard/holdings'],
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
    tables: ['metrics', 'metric_facts', 'staging_metric_facts', 'portfolio_metric_targets', 'widgets', 'holding_widgets', 'holding_locations'],
    routes: ['/dashboard/metrics', '/dashboard/map', '/dashboard/widgets'],
    systemPromptAddition: `
You can track and visualize impact metrics. Available metric types include:
- Environmental: CARBON_EMISSIONS, RENEWABLE_MWH, WATER_SAVED, TREES_PLANTED
- Social: JOBS_CREATED, PEOPLE_SERVED, STUDENTS_EDUCATED, MEALS_PROVIDED
- Financial: REVENUE_GENERATED, COST_SAVINGS, ROI_PERCENTAGE
Use create_widget and generate_d3_chart to create visualizations.`,
  },

  reporting: {
    id: 'reporting',
    name: 'Reporting',
    description: 'Custom reports, templates, and exports',
    isCore: false,
    icon: 'document-text',
    dependencies: ['impact_tracking'],
    tools: [
      'generate_holding_report',
      'generate_custom_report',
      'save_report_template',
      'list_report_templates',
      'generate_pdf_report',
      'export_data',
    ],
    tables: ['report_templates', 'generated_documents'],
    routes: ['/dashboard/reports'],
    systemPromptAddition: `
You can generate comprehensive reports with inline charts. Use generate_holding_report for single holdings,
generate_custom_report for portfolio-wide or sector-based reports. Reports can be saved as templates for reuse.`,
  },

  tax_optimization: {
    id: 'tax_optimization',
    name: 'Tax Optimization',
    description: 'Tax scenarios, deductions, and compliance',
    isCore: false,
    icon: 'calculator',
    tools: [
      'run_tax_scenario',
      'calculate_deduction',
      'analyze_contribution',
      'get_carryforward',
      'generate_form_8283',
    ],
    tables: ['tax_profiles', 'contributions', 'tax_documents', 'agi_estimates'],
    routes: ['/dashboard/tax', '/dashboard/tax/scenarios'],
    systemPromptAddition: `
You can help optimize tax strategy for charitable giving. Run scenarios comparing cash vs appreciated stock,
calculate potential deductions, track AGI limits and carryforwards, and generate Form 8283 for non-cash donations.`,
  },

  grant_management: {
    id: 'grant_management',
    name: 'Grant Management',
    description: 'Due diligence, milestones, and workflows',
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
    tables: ['grant_details', 'workflow_templates', 'workflow_instances', 'workflow_tasks', 'reminders'],
    routes: ['/dashboard/grants', '/dashboard/grants/workflows', '/dashboard/grants/calendar'],
    systemPromptAddition: `
You can manage grant workflows including due diligence checklists, milestone tracking, and deadline reminders.
Use start_due_diligence when evaluating new charities. Track grant milestones and reporting requirements.`,
  },

  donor_management: {
    id: 'donor_management',
    name: 'Donor Management',
    description: 'Track contributions received and acknowledgments',
    isCore: false,
    icon: 'users',
    tools: [
      'log_contribution_received',
      'generate_receipt',
      'generate_acknowledgment',
      'get_donor_summary',
      'search_donors',
    ],
    tables: ['donors', 'contributions_received', 'acknowledgment_letters', 'donor_communications'],
    routes: ['/dashboard/donors', '/dashboard/donors/receipts'],
    systemPromptAddition: `
You can track donations received by the organization, generate tax receipts for donors,
and manage acknowledgment letters. Use for organizations that receive charitable contributions.`,
  },

  external_data: {
    id: 'external_data',
    name: 'External Data',
    description: 'Charity Navigator, Candid, and news integration',
    isCore: false,
    icon: 'globe',
    tools: [
      'refresh_charity_data',
      'search_similar_charities',
      'fetch_news_about_holding',
      'get_charity_financials',
    ],
    tables: ['external_data_cache', 'holding_news', 'charity_ratings'],
    routes: [],  // Integrates into existing holding pages
    systemPromptAddition: `
You can fetch real-time data from external sources:
- Charity Navigator ratings and financial data
- Candid/GuideStar nonprofit profiles
- News articles about holdings
Use refresh_charity_data to update cached information.`,
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
      'run_monte_carlo',
    ],
    tables: ['benchmark_data', 'metric_projections_cache'],
    routes: ['/dashboard/analytics', '/dashboard/analytics/projections'],
    systemPromptAddition: `
You can provide advanced analytics including:
- Metric projections with confidence intervals (linear, exponential, Monte Carlo)
- Benchmarking against sector/size peers
- Portfolio risk analysis (concentration, diversification)
Use project_metric_trend for forecasting, benchmark_holding for peer comparison.`,
  },
};

/**
 * Get all tools for enabled modules
 */
export function getToolsForModules(enabledModules: ModuleId[]): string[] {
  const tools = new Set<string>();

  for (const moduleId of enabledModules) {
    const module = MODULE_REGISTRY[moduleId];
    if (module) {
      module.tools.forEach(tool => tools.add(tool));

      // Include dependency tools
      module.dependencies?.forEach(depId => {
        MODULE_REGISTRY[depId]?.tools.forEach(tool => tools.add(tool));
      });
    }
  }

  // Always include core tools
  MODULE_REGISTRY.core.tools.forEach(tool => tools.add(tool));

  return Array.from(tools);
}

/**
 * Get system prompt additions for enabled modules
 */
export function getSystemPromptForModules(enabledModules: ModuleId[]): string {
  const additions: string[] = [];

  for (const moduleId of enabledModules) {
    const module = MODULE_REGISTRY[moduleId];
    if (module?.systemPromptAddition) {
      additions.push(module.systemPromptAddition);
    }
  }

  return additions.join('\n\n');
}

/**
 * Check if a route is accessible given enabled modules
 */
export function isRouteAccessible(route: string, enabledModules: ModuleId[]): boolean {
  // Core routes always accessible
  if (MODULE_REGISTRY.core.routes.some(r => route.startsWith(r))) {
    return true;
  }

  // Check if any enabled module provides this route
  for (const moduleId of enabledModules) {
    const module = MODULE_REGISTRY[moduleId];
    if (module?.routes.some(r => route.startsWith(r))) {
      return true;
    }
  }

  return false;
}
```

---

## Dynamic Tool Filtering

```typescript
// /lib/modules/tool-filter.ts

import { Anthropic } from '@anthropic-ai/sdk';
import { MODULE_REGISTRY, ModuleId, getToolsForModules } from './registry';
import { PORTFOLIO_TOOLS } from '../claude-assistant';

/**
 * Filter tools based on enabled modules
 */
export function filterToolsForOrg(
  allTools: Anthropic.Tool[],
  enabledModules: ModuleId[]
): Anthropic.Tool[] {
  const allowedToolNames = new Set(getToolsForModules(enabledModules));

  return allTools.filter(tool => allowedToolNames.has(tool.name));
}

/**
 * Get enabled modules for an organization
 */
export async function getOrgEnabledModules(
  supabase: any,
  orgId: string
): Promise<ModuleId[]> {
  // Core is always enabled
  const modules: ModuleId[] = ['core'];

  const { data, error } = await supabase
    .from('organization_modules')
    .select('module_id')
    .eq('organization_id', orgId);

  if (!error && data) {
    data.forEach((row: { module_id: ModuleId }) => {
      if (!modules.includes(row.module_id)) {
        modules.push(row.module_id);
      }
    });
  }

  return modules;
}

/**
 * Enable a module for an organization
 */
export async function enableModule(
  supabase: any,
  orgId: string,
  moduleId: ModuleId,
  userId: string,
  config: Record<string, any> = {}
): Promise<{ success: boolean; error?: string }> {
  const module = MODULE_REGISTRY[moduleId];

  if (!module) {
    return { success: false, error: `Unknown module: ${moduleId}` };
  }

  if (module.isCore) {
    return { success: false, error: 'Core module is always enabled' };
  }

  // Enable dependencies first
  if (module.dependencies) {
    for (const depId of module.dependencies) {
      await enableModule(supabase, orgId, depId, userId);
    }
  }

  const { error } = await supabase
    .from('organization_modules')
    .upsert({
      organization_id: orgId,
      module_id: moduleId,
      enabled_by: userId,
      config,
    });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Disable a module for an organization
 */
export async function disableModule(
  supabase: any,
  orgId: string,
  moduleId: ModuleId
): Promise<{ success: boolean; error?: string }> {
  const module = MODULE_REGISTRY[moduleId];

  if (!module) {
    return { success: false, error: `Unknown module: ${moduleId}` };
  }

  if (module.isCore) {
    return { success: false, error: 'Core module cannot be disabled' };
  }

  // Check if other enabled modules depend on this one
  const { data: enabledModules } = await supabase
    .from('organization_modules')
    .select('module_id')
    .eq('organization_id', orgId);

  if (enabledModules) {
    for (const row of enabledModules) {
      const mod = MODULE_REGISTRY[row.module_id as ModuleId];
      if (mod?.dependencies?.includes(moduleId)) {
        return {
          success: false,
          error: `Cannot disable: ${mod.name} depends on this module`
        };
      }
    }
  }

  const { error } = await supabase
    .from('organization_modules')
    .delete()
    .eq('organization_id', orgId)
    .eq('module_id', moduleId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
```

---

## Modified Claude Assistant

```typescript
// Changes to /lib/claude-assistant.ts

// Add import
import {
  filterToolsForOrg,
  getOrgEnabledModules,
  getSystemPromptForModules,
  ModuleId
} from './modules/tool-filter';

export class ClaudePortfolioAssistant {
  private anthropic: Anthropic;
  private supabase: ReturnType<typeof createClient>;
  private enabledModules: ModuleId[] = ['core'];  // Default to core only

  constructor(supabaseServiceRole: string, anthropicApiKey: string) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseServiceRole,
      { auth: { persistSession: false } }
    );
  }

  /**
   * Initialize assistant with organization context
   */
  async initializeForOrg(orgId: string): Promise<void> {
    this.enabledModules = await getOrgEnabledModules(this.supabase, orgId);
  }

  /**
   * Get filtered tools based on enabled modules
   */
  private getFilteredTools(): Anthropic.Tool[] {
    return filterToolsForOrg(PORTFOLIO_TOOLS, this.enabledModules);
  }

  /**
   * Build system prompt with module-specific additions
   */
  private buildSystemPrompt(context: any): string {
    const basePrompt = `You are Ben, an AI portfolio assistant...`;
    const modulePrompt = getSystemPromptForModules(this.enabledModules);

    return `${basePrompt}\n\n${modulePrompt}\n\n${context}`;
  }

  async chat(params: {
    portfolioId: string;
    orgId?: string;  // New: organization context
    userId: string;
    sessionId: string;
    message: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    // Initialize for org if provided
    if (params.orgId) {
      await this.initializeForOrg(params.orgId);
    }

    // Use filtered tools
    const tools = this.getFilteredTools();

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: this.buildSystemPrompt(context),
      tools,  // Filtered based on enabled modules
      messages: claudeMessages,
    });

    // ... rest of chat logic
  }
}
```

---

## Frontend Module Provider

```typescript
// /contexts/ModuleContext.tsx

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ModuleId, MODULE_REGISTRY, isRouteAccessible } from '@/lib/modules/registry';

interface ModuleContextType {
  enabledModules: ModuleId[];
  isModuleEnabled: (moduleId: ModuleId) => boolean;
  canAccessRoute: (route: string) => boolean;
  loading: boolean;
  refreshModules: () => Promise<void>;
}

const ModuleContext = createContext<ModuleContextType | null>(null);

export function ModuleProvider({
  children,
  orgId
}: {
  children: ReactNode;
  orgId: string;
}) {
  const [enabledModules, setEnabledModules] = useState<ModuleId[]>(['core']);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  const fetchModules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organization_modules')
      .select('module_id')
      .eq('organization_id', orgId);

    if (!error && data) {
      const modules: ModuleId[] = ['core'];
      data.forEach((row: any) => {
        if (!modules.includes(row.module_id)) {
          modules.push(row.module_id);
        }
      });
      setEnabledModules(modules);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (orgId) {
      fetchModules();
    }
  }, [orgId]);

  const isModuleEnabled = (moduleId: ModuleId): boolean => {
    return enabledModules.includes(moduleId) ||
           MODULE_REGISTRY[moduleId]?.isCore === true;
  };

  const canAccessRoute = (route: string): boolean => {
    return isRouteAccessible(route, enabledModules);
  };

  return (
    <ModuleContext.Provider value={{
      enabledModules,
      isModuleEnabled,
      canAccessRoute,
      loading,
      refreshModules: fetchModules,
    }}>
      {children}
    </ModuleContext.Provider>
  );
}

export function useModules() {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModules must be used within ModuleProvider');
  }
  return context;
}

// Conditional rendering component
export function ModuleGate({
  module,
  children,
  fallback = null
}: {
  module: ModuleId;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { isModuleEnabled, loading } = useModules();

  if (loading) return null;
  if (!isModuleEnabled(module)) return fallback;

  return <>{children}</>;
}
```

---

## Module Settings Page

```typescript
// /app/org/[orgId]/settings/modules/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { MODULE_REGISTRY, ModuleId } from '@/lib/modules/registry';
import { Switch } from '@headlessui/react';

export default function ModuleSettingsPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const [enabledModules, setEnabledModules] = useState<Set<ModuleId>>(new Set(['core']));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ModuleId | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchModules();
  }, [orgId]);

  const fetchModules = async () => {
    const { data } = await supabase
      .from('organization_modules')
      .select('module_id')
      .eq('organization_id', orgId);

    if (data) {
      const modules = new Set<ModuleId>(['core']);
      data.forEach((row: any) => modules.add(row.module_id));
      setEnabledModules(modules);
    }
    setLoading(false);
  };

  const toggleModule = async (moduleId: ModuleId) => {
    setSaving(moduleId);
    const isEnabled = enabledModules.has(moduleId);

    if (isEnabled) {
      // Disable
      await supabase
        .from('organization_modules')
        .delete()
        .eq('organization_id', orgId)
        .eq('module_id', moduleId);

      setEnabledModules(prev => {
        const next = new Set(prev);
        next.delete(moduleId);
        return next;
      });
    } else {
      // Enable (and dependencies)
      const module = MODULE_REGISTRY[moduleId];
      const toEnable = [moduleId, ...(module.dependencies || [])];

      for (const id of toEnable) {
        await supabase
          .from('organization_modules')
          .upsert({ organization_id: orgId, module_id: id });
      }

      setEnabledModules(prev => {
        const next = new Set(prev);
        toEnable.forEach(id => next.add(id));
        return next;
      });
    }
    setSaving(null);
  };

  if (loading) {
    return <div className="p-8">Loading modules...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Module Settings</h1>
      <p className="text-neutral-600 mb-8">
        Enable or disable features for your organization. Only enabled modules
        will be available to Ben, your AI assistant.
      </p>

      <div className="space-y-4">
        {Object.values(MODULE_REGISTRY).map(module => (
          <div
            key={module.id}
            className={`flex items-center justify-between p-4 rounded-lg border ${
              module.isCore ? 'bg-neutral-50' : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${
                enabledModules.has(module.id) ? 'bg-azure text-white' : 'bg-neutral-100'
              }`}>
                <span>{module.icon}</span>
              </div>
              <div>
                <h3 className="font-semibold">{module.name}</h3>
                <p className="text-sm text-neutral-600">{module.description}</p>
                {module.dependencies && module.dependencies.length > 0 && (
                  <p className="text-xs text-neutral-500 mt-1">
                    Requires: {module.dependencies.map(d => MODULE_REGISTRY[d].name).join(', ')}
                  </p>
                )}
              </div>
            </div>

            <Switch
              checked={enabledModules.has(module.id)}
              onChange={() => toggleModule(module.id)}
              disabled={module.isCore || saving === module.id}
              className={`${
                enabledModules.has(module.id) ? 'bg-azure' : 'bg-neutral-200'
              } relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span
                className={`${
                  enabledModules.has(module.id) ? 'translate-x-6' : 'translate-x-1'
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
              />
            </Switch>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
1. Create database migration `0060_organization_modules.sql`
2. Implement `/lib/modules/registry.ts` with module definitions
3. Implement `/lib/modules/tool-filter.ts` for dynamic filtering
4. Modify `ClaudePortfolioAssistant` to accept org context and filter tools
5. Create basic module settings page

### Phase 2: Core Module Refinement (Week 2-3)
1. Audit existing tools and assign to modules
2. Create `ModuleContext` for frontend
3. Implement `ModuleGate` component for conditional rendering
4. Update navigation to respect enabled modules

### Phase 3: Module-specific Features (Week 3-5)
1. Implement missing tools for each module
2. Create module-specific UI components
3. Add module-aware system prompts to Claude

### Phase 4: Onboarding & Setup Wizard (Week 5-6)
1. Create organization setup wizard
2. AI-guided module selection ("Tell me about your organization...")
3. Module bundle presets (Family Foundation, Community Foundation, etc.)

### Phase 5: Testing & Polish (Week 6-7)
1. Integration testing across module combinations
2. Performance optimization
3. Documentation

---

## Testing Plan

### Module Isolation Test
1. Create org with only Core enabled
2. Ask AI about metrics → Should say "I can help with portfolio management..."
3. Enable Impact Tracking
4. Ask about metrics → Should offer to create visualizations

### Dependency Test
1. Try to enable Reporting without Impact Tracking
2. System should auto-enable Impact Tracking as dependency

### UI Conditional Rendering Test
1. Navigate to /dashboard/tax with tax module disabled
2. Should redirect to /dashboard or show "Module not enabled"
3. Enable tax module
4. Should now render Tax Dashboard

---

## Future Considerations

### Pricing Tiers
- **Free**: Core only
- **Starter**: Core + Impact Tracking + Reporting
- **Pro**: All modules
- **Enterprise**: All modules + custom modules

### Custom Modules
Organizations could potentially define custom tools that integrate with their specific workflows.

### Module Marketplace
Third-party developers could create modules that integrate with the platform.
