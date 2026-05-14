# Module System Documentation

## Overview

The module system enables organizations to customize their platform experience by enabling/disabling feature sets. Each module encapsulates:

- **Database tables**: Schema and RLS policies
- **AI tools**: Provider-neutral assistant capabilities
- **API routes**: REST endpoints
- **UI components**: React components and pages
- **System prompts**: AI context for the module

## Module Registry

### Location

- **Types**: `/lib/modules/types.ts`
- **Client Info**: `/lib/modules/client-info.ts`
- **Full Registry**: `/lib/modules/registry.ts`
- **Tool Filter**: `/lib/modules/tool-filter.ts`
- **Index**: `/lib/modules/index.ts`

### Module Definition Structure

```typescript
interface ModuleDefinition {
  id: ModuleId;              // Unique identifier (snake_case)
  name: string;               // Display name
  description: string;        // User-facing description
  isCore: boolean;           // True = always enabled
  icon: string;              // Heroicon name
  tools: string[];           // AI tool names
  tables: string[];          // Database table names
  routes: string[];          // UI route prefixes
  dependencies?: ModuleId[]; // Required modules
  systemPromptAddition?: string; // AI context
}
```

## Current Modules

### Core (Always Enabled)

**ID**: `core`

Provides fundamental portfolio management capabilities.

**Tools**:
- `list_holdings` - View all holdings
- `get_portfolio_summary` - Portfolio overview
- `search_holdings` - Find holdings
- `add_holding` - Create holding
- `update_holding` - Modify holding
- `remove_holding` - Delete holding
- `get_holding_details` - Detailed view

**Tables**: `portfolios`, `holdings`, `portfolio_members`, `organizations`, `organization_members`

**Routes**: `/dashboard`, `/dashboard/holdings`, `/org`

---

### Impact Tracking

**ID**: `impact_tracking`

Enables KPI tracking, metrics, and visualizations.

**Tools**:
- `add_metric_fact` - Record data point
- `get_metric_trend` - View trends
- `compare_holdings` - Cross-holding analysis
- `create_widget` - Create visualization
- `create_portfolio_widget` - Portfolio-level viz
- `generate_d3_chart` - Custom charts
- `get_chart_data` - Chart data
- `list_widgets` - View widgets
- `display_widget` - Render widget
- `add_location` - Geographic data

**Tables**: `metrics`, `metric_facts`, `staging_metric_facts`, `portfolio_metric_targets`, `widgets`, `holding_widgets`, `holding_locations`

**Routes**: `/dashboard/metrics`, `/dashboard/map`, `/dashboard/widgets`

---

### Reporting

**ID**: `reporting`

Generates reports and exports data.

**Dependencies**: `impact_tracking`

**Tools**:
- `generate_holding_report` - Single holding report
- `generate_custom_report` - Custom report
- `save_report_template` - Save template
- `list_report_templates` - View templates
- `export_data` - CSV/JSON/Excel export

**Tables**: `report_templates`, `generated_documents`, `report_schedules`

**Routes**: `/dashboard/reports`

---

### Tax Optimization

**ID**: `tax_optimization`

Tax planning and compliance tools.

**Tools**:
- `run_tax_scenario` - Compare scenarios
- `calculate_deduction` - Deduction estimates
- `get_carryforward` - Carryforward tracking

**Tables**: `tax_profiles`, `contributions`, `tax_documents`, `agi_estimates`

**Routes**: `/dashboard/tax`, `/dashboard/tax/scenarios`, `/dashboard/tax/contributions`

---

### Grant Management

**ID**: `grant_management`

Grant workflow and due diligence.

**Tools**:
- `start_due_diligence` - Begin DD process
- `get_workflow_status` - Workflow progress
- `complete_workflow_task` - Mark task done
- `track_milestone` - Milestone tracking
- `schedule_reminder` - Set reminders
- `get_upcoming_deadlines` - Deadline view
- `log_grant_communication` - Log comms
- `get_grant_health` - Health assessment
- `record_grant_payment` - Payment tracking

**Tables**: `grant_details`, `grant_milestones`, `grant_reports`, `workflow_templates`, `workflow_instances`, `workflow_tasks`, `grant_payments`, `grant_budget_items`, `grant_communications`, `grant_contacts`, `grant_documents`, `reminders`

**Routes**: `/dashboard/grants`, `/dashboard/grants/workflows`, `/dashboard/grants/calendar`, `/dashboard/grants/payments`

---

### Donor Management

**ID**: `donor_management`

Track donations received and generate acknowledgments.

**Tools**:
- `log_contribution_received` - Record donation
- `generate_receipt` - Tax receipt
- `generate_acknowledgment` - Thank you letter
- `get_donor_summary` - Donor overview
- `search_donors` - Find donors

**Tables**: `donors`, `contributions_received`, `acknowledgment_letters`, `donor_communications`

**Routes**: `/dashboard/donors`, `/dashboard/donors/receipts`, `/dashboard/donors/acknowledgments`

---

### External Data

**ID**: `external_data`

Third-party data integrations.

**Tools**:
- `refresh_charity_data` - Update from sources
- `search_similar_charities` - Find similar orgs
- `get_charity_financials` - Financial data

**Tables**: `external_data_cache`, `holding_news`, `charity_ratings`

**Routes**: None (background functionality)

---

### Analytics

**ID**: `analytics`

Advanced analytics and AI insights.

**Dependencies**: `impact_tracking`

**Tools**:
- `project_metric_trend` - Trend projections
- `benchmark_holding` - Comparative analysis
- `analyze_portfolio_risk` - Risk assessment
- `generate_insight` - AI insights
- `get_risk_snapshot` - Risk overview

**Tables**: `benchmark_data`, `metric_projections_cache`, `portfolio_risk_snapshots`, `analytics_insights`

**Routes**: `/dashboard/analytics`, `/dashboard/analytics/projections`, `/dashboard/analytics/benchmarks`, `/dashboard/analytics/risk`, `/dashboard/analytics/insights`

## Module Functions

### Server-Side

```typescript
// Get tools for enabled modules
getToolsForModules(enabledModules: ModuleId[]): string[]

// Get system prompt additions
getSystemPromptForModules(enabledModules: ModuleId[]): string

// Check route accessibility
isRouteAccessible(route: string, enabledModules: ModuleId[]): boolean

// Filter AI tools
filterToolsForOrg(allTools: ToolDefinition[], enabledModules: ModuleId[]): ToolDefinition[]

// Get org's enabled modules
getOrgEnabledModules(supabase: SupabaseClient, orgId: string): Promise<ModuleId[]>

// Enable module (with dependencies)
enableModule(supabase, orgId, moduleId, userId): Promise<{success, enabledModules}>

// Disable module (checks dependents)
disableModule(supabase, orgId, moduleId): Promise<{success, error}>
```

### Client-Side

```typescript
// Hook for module context
useModules(): {
  enabledModules: ModuleId[],
  isModuleEnabled: (moduleId) => boolean,
  canAccessRoute: (route) => boolean,
  enableModule: (moduleId) => Promise<{success}>,
  disableModule: (moduleId) => Promise<{success}>
}

// Conditional rendering
<ModuleGate module="analytics" fallback={<Upsell />}>
  <AnalyticsComponent />
</ModuleGate>
```

## Creating a New Module

### Step 1: Define Types

Add to `/lib/modules/types.ts`:

```typescript
export type ModuleId =
  | ...
  | 'new_module';
```

### Step 2: Add Client Info

Add to `/lib/modules/client-info.ts`:

```typescript
new_module: {
  id: 'new_module',
  name: 'New Module',
  description: 'What it does',
  icon: 'icon-name',
  routes: ['/dashboard/new-module'],
  isCore: false,
  dependencies: [],
},
```

### Step 3: Add Full Registry

Add to `/lib/modules/registry.ts`:

```typescript
new_module: {
  id: 'new_module',
  name: 'New Module',
  description: 'What it does',
  isCore: false,
  icon: 'icon-name',
  tools: ['list_items', 'create_item'],
  tables: ['new_module_items'],
  routes: ['/dashboard/new-module'],
  dependencies: [],
  systemPromptAddition: `
You can help with New Module. Available actions include:
- List items
- Create items
`,
},
```

### Step 4: Create Database Migration

Create `/db/00XX_new_module.sql` using the template.

### Step 5: Create AI Tools

Create `/lib/ai/tools/new_module.ts` using the template.

### Step 6: Create API Routes

Create `/app/api/new_module/route.ts` and `[id]/route.ts`.

### Step 7: Create Components

Create components in `/components/new_module/`.

### Step 8: Create Pages

Create pages in `/app/dashboard/new-module/`.

### Step 9: Test

- Enable module via API or onboarding
- Verify tools appear in AI
- Test all CRUD operations
- Verify RLS policies

## Module Presets

Organizations can apply presets to quickly enable module sets:

| Preset | Modules |
|--------|---------|
| Foundation | impact_tracking, reporting, grant_management, analytics |
| DAF | impact_tracking, reporting, tax_optimization |
| Nonprofit | impact_tracking, donor_management, grant_management |
| Impact Investor | impact_tracking, reporting, analytics |

## Best Practices

### Module Boundaries

- Each module should be cohesive
- Minimize cross-module dependencies
- Use events/hooks for loose coupling

### Tool Design

- Tools should be atomic operations
- Include validation in tool executors
- Track actions for undo capability

### Database Design

- Module tables should reference org, not user
- Use consistent naming: `{module}_items`
- Always include RLS policies

### UI Patterns

- Use ModuleGate for conditional rendering
- Check module availability before navigation
- Show upsell for disabled modules
