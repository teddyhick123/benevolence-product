# Module System Documentation

## Overview

The module system enables organizations to customize their platform experience by enabling/disabling feature sets. Each module encapsulates:

- **Database tables**: Schema and RLS policies
- **AI tools**: Provider-neutral assistant capabilities
- **API routes**: REST endpoints
- **UI components**: React components and pages
- **System prompts**: AI context for the module

Current module state is stored on `organizations.modules` as JSONB and checked in SQL with `org_has_module(p_org_id, p_module)`. There is no `organization_modules` table. App-facing IDs such as `tax_optimization`, `donor_management`, `pledge_tracking`, and `compliance_regulatory` map to database module slugs such as `tax`, `donors`, `pledges`, and `compliance` where needed.

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

**Tables**: `tax_profiles`, `tax_years`, `tax_contributions`, `holding_contributions`, `tax_carryforwards`, `tax_documents`, `daf_grants`, `foundation_990pf_data`, `cpa_share_links`, `cpa_access_logs`

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

**Tables**: `grants`, `grant_milestones`, `grant_reports`, `grant_payments`, `grant_budget_items`, `grant_communications`, `grant_contacts`, `grant_documents`, `grant_decisions`, `grant_status_history`, `workflow_templates`, `workflow_instances`, `workflow_tasks`, `tasks`, `task_events`, `task_comments`, `task_entity_links`, `reminders`

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

### Pledge Tracking

**ID**: `pledge_tracking`

Tracks donor commitments, installment schedules, and pledge fulfillment.

**Dependencies**: `donor_management`

**Tools**: None in the current release.

**Tables**: `pledges`, `pledge_installments`, `pledge_events`

**Routes**: `/dashboard/pledges`

---

### External Data

**ID**: `external_data`

Third-party data integrations.

**Tools**:
- `refresh_charity_data` - Update from sources
- `search_similar_charities` - Find similar orgs
- `get_charity_financials` - Financial data

**Tables**: `charities`, `news_articles`, `portfolio_charities`, `charity_rating_cache`, `geocode_cache`

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

---

### Compliance & Regulatory

**ID**: `compliance_regulatory`

Compliance, payout tracking, self-dealing screening, filing calendar, expenditure responsibility, and 990-PF data assembly.

**Dependencies**: `grant_management`

**Tools**:
- `get_compliance_status`
- `calculate_payout_requirement`
- `get_payout_forecast`
- `screen_for_self_dealing`
- `register_disqualified_person`
- `track_filing_deadline`
- `log_expenditure_responsibility`
- `assess_qualifying_distribution`
- `get_990pf_export_data`
- `get_state_registration_status`

**Tables**: `filing_calendar`, `state_registrations`, `foundation_990pf_data`, `compliance_profiles`, `disqualified_persons`, `self_dealing_incidents`, `expenditure_responsibility_grants`, `qualifying_distributions`, `payout_history`

**Routes**: `/dashboard/compliance`

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

### UI visibility

There is no global `ModuleContext` or generic `ModuleGate`. Authorized server
loads and org-scoped APIs return the enabled module state needed by a page.
Navigation and components derive visibility from registered module metadata and
receive explicit state from their owner.

## Creating a New Module

The tested guide is `templates/module/README.md`. In summary:

1. Apply the schema decision protocol. A cross-organization platform concept may
   become canonical schema; organization-specific fields and behavior use
   `custom_fields`, metric facts, widgets, view/workflow/automation config, or
   `organizations.modules`.
2. Register the app-facing ID and database-slug mapping in
   `lib/modules/types.ts`, `lib/modules/client-info.ts`, and
   `lib/modules/registry.ts`.
3. If canonical DDL is justified, add `db/migrations/NNNN_name.sql` for a
   product increment (or fold a prerelease correction into its owning
   migration) and regenerate `lib/database.types.ts`.
4. Implement elevated data access in a tenant-scoped repository. The route must
   prove access before constructing it.
5. Put org-scoped mutations under `app/api/org/[orgId]/...` and use the shared
   access and response helpers.
6. Put interactive browser data in `lib/<domain>/hooks.ts`, backed by
   `lib/api/client.ts` and `lib/api/client-hooks.ts`.
7. Add provider-neutral AI definitions and small tool executors. Elevated
   behavior enters through scoped `AssistantToolCapabilities`.
8. Keep assistant persistence in the established chat lifecycle:
   request-idempotent `ai_turns`, append-only `ai_messages`, and persisted
   `ai_actions`.
9. Run `npm run verify:hygiene`, focused boundary contracts, and the normal
   verification suite.
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
- Use scoped repositories and explicit capabilities for data access

### Tool Design

- Tools should be atomic operations
- Include validation in tool executors
- Track actions for undo capability
- Keep turn/message persistence and request idempotency in the assistant route

### Database Design

- Use sanctioned data/configuration extension points for organization variability
- Canonical module tables use `org_id` and the generated `Database` type
- Use consistent naming: `{module}_items`
- Always include RLS policies

### UI Patterns

- Pass authorized module state explicitly from the owning server/API boundary
- Use domain hooks and the shared browser transport for interactive data
- Show upsell for disabled modules
