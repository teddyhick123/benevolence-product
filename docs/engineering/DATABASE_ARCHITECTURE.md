# Database Architecture

This document is a current, human-readable map of the active database. The schema source of truth remains `db/migrations`; if a table, column, function, or RLS policy differs from this summary, trust the migration files.

## Core Principles

- `organizations` is the root tenant boundary.
- Org-scoped rows use `org_id`, not `organization_id`.
- Module state lives on `organizations.modules` JSONB; there is no `organization_modules` table.
- Portfolio access is subordinate to org access through `portfolio_members`.
- Holdings carry `org_id` directly.
- Canonical grant lifecycle data lives in `grants`, not `grant_details`.
- Sensitive module tables enforce module state through `org_has_module(p_org_id, p_module)`.
- SQL views that expose scoped data should use `security_invoker = true`.

## Core Tables

| Table | Purpose |
|---|---|
| `organizations` | Root tenant record, org type, enabled modules JSONB |
| `organization_members` | User membership and org roles |
| `profiles` | User profile rows linked to Supabase auth users |
| `portfolios` | Portfolio containers within an organization |
| `portfolio_members` | Portfolio-level membership, constrained by org membership |
| `holdings` | Universal asset / grantee / investment holding table |
| `investees` | Recipient organizations linked to holdings and imports |
| `uploads` | Uploaded source files and processing state |
| `staging_*` | Import staging tables |

## Module Tables

### Impact Tracking

| Table | Purpose |
|---|---|
| `metrics`, `kpi_definitions` | Metric definitions |
| `metric_facts`, `staging_metric_facts` | Submitted and staged impact facts |
| `portfolio_metric_targets` | Target values by portfolio/metric |
| `widgets`, `holding_widgets` | Dashboard/widget configuration |
| `holding_locations` | Geospatial data for map views |

### Investment Tracking

| Table | Purpose |
|---|---|
| `holding_valuations` | Valuation history |
| `holding_transactions` | Cash flows and investment transactions |
| `holding_co_investors` | Co-investor relationships |

### Grant Management

| Table | Purpose |
|---|---|
| `grants` | Canonical grant lifecycle parent |
| `grant_status_history` | Lifecycle transition audit history |
| `grant_decisions` | Board/staff decisions tied to grants |
| `grant_milestones` | Deliverables and milestones |
| `grant_reports` | Required grantee reports |
| `grant_payments` | Scheduled and actual disbursements |
| `grant_budget_items` | Budget line items |
| `grant_communications` | Communication log |
| `grant_contacts` | Grantee contacts |
| `grant_documents` | Grant files in private storage |

### Workflow And Tasks

| Table | Purpose |
|---|---|
| `tasks` | Unified org task inbox |
| `task_events` | Task event audit trail |
| `task_comments` | Task discussion |
| `task_entity_links` | Links from tasks to grants, filings, imports, etc. |
| `workflow_templates`, `workflow_instances`, `workflow_tasks` | Reusable workflow system |
| `task_automation_runs` | Automation run logs and summaries |
| `task_automation_outbox` | Durable, retryable handoff for post-commit task-completion automation |

Task creation, updates, comments, completion, generated-task upserts, audit
events, and grant-milestone reverse synchronization enter through service-only
transaction functions in migration `0041`. Completion commits an immutable task
snapshot to `task_automation_outbox`; the task job drains that outbox with
idempotent per-rule run keys, including on a later cron run after a request or
worker failure.

### Tax Center

| Table | Purpose |
|---|---|
| `tax_profiles` | Portfolio owner tax planning defaults |
| `tax_years` | Year-specific AGI, filing status, limits, and planning fields |
| `tax_contributions` | Charitable contribution records |
| `holding_contributions` | Links between holdings and tax contributions |
| `tax_carryforwards` | Carryforward tracking |
| `tax_documents` | Receipts, acknowledgments, appraisals, and generated tax docs |
| `daf_grants` | DAF grant records |
| `foundation_990pf_data` | 990-PF assembly data |
| `cpa_share_links`, `cpa_access_logs` | CPA public portal sharing and audit trail |

### Donor CRM And Pledges

| Table | Purpose |
|---|---|
| `donors` | Donor profiles |
| `contributions_received` | Incoming gifts |
| `donor_communications` | Donor communication history |
| `acknowledgment_letters` | Receipt/acknowledgment records |
| `pledges`, `pledge_installments`, `pledge_events` | Pledge lifecycle and installment tracking |

### Compliance

| Table | Purpose |
|---|---|
| `compliance_profiles` | Compliance settings per org/portfolio |
| `filing_calendar` | Federal/state filing deadlines |
| `state_registrations` | State registration status |
| `disqualified_persons` | IRC 4946 registry |
| `self_dealing_incidents` | Potential self-dealing incidents |
| `payout_history` | Distribution requirement history |
| `qualifying_distributions` | Qualifying distribution records |
| `expenditure_responsibility_grants` | ER tracking for non-public-charity grantees |

### Reporting

| Table | Purpose |
|---|---|
| `reports` | Report snapshots and public sharing metadata |
| `report_templates` | Reusable report configurations |
| `generated_documents` | Generated reports and exports |
| `report_schedules` | Recurring report schedules |
| `letter_templates` | Reusable letter templates |

### External Data And Analytics

| Table | Purpose |
|---|---|
| `charities` | Charity lookup database |
| `portfolio_charities` | Portfolio-charity associations |
| `news_articles`, `events` | External news and event data |
| `charity_rating_cache`, `geocode_cache` | External API caches |
| `generated_financial_analyses` | AI-generated financial analysis artifacts |
| `benchmark_data`, `metric_projections_cache`, `portfolio_risk_snapshots`, `analytics_insights` | Analytics module tables |

### QuickBooks

| Table | Purpose |
|---|---|
| `quickbooks_connections` | One QuickBooks OAuth connection per org |
| `qb_accounts` | Synced chart of accounts |
| `qb_transactions` | Synced QuickBooks transaction mirror |
| `qb_sync_log` | Sync/export event log |

### AI, Builder, Onboarding, And Admin

| Table | Purpose |
|---|---|
| `ai_sessions`, `ai_turns`, `ai_messages`, `ai_actions`, `ai_usage_log` | Sessions, request-idempotent turns, append-only messages, undo/redo actions, usage accounting |
| `portfolio_recommendations`, `recommendation_*` | AI recommendations and interaction metadata |
| `onboarding_sessions`, `onboarding_profiles`, `onboarding_recommendations`, `onboarding_analytics` | Onboarding flow |
| `builder_*` | Builder proposals, artifacts, events, and application history |
| `org_audit_log`, `notification_events` | Settings/audit and notification infrastructure |
| `module_definitions`, `module_presets` | Module metadata and default bundles |

## Canonical Helpers

| Helper | Purpose |
|---|---|
| `can_view_org(p_org_id)` | Org membership visibility check |
| `is_org_admin(org_id)` | Org admin/owner check |
| `user_org_role(p_org_id)` | Current user's org role |
| `is_app_admin()` | Platform admin check |
| `can_view_portfolio(p_portfolio_id)` | Portfolio visibility check |
| `can_edit_portfolio(p_portfolio_id)` | Portfolio mutation check |
| `org_has_module(p_org_id, p_module)` | Module enablement check |
| `provision_organization(...)` | Transactional onboarding/org provisioning |

## Storage Buckets

| Bucket | Privacy | Purpose |
|---|---|---|
| `tax-documents` | Private | Tax substantiation and generated tax documents |
| `grant-documents` | Private | Grant agreements, reports, and support files |
| `compliance-documents` | Private | Filing-calendar attachments |
| `documents` | Private by route policy | Generated donor acknowledgments and related docs |
| `imports` | Private | Import source files |

## Migration Notes

- Apply active migrations from `db/migrations` in filename order.
- Git history is the archive for retired SQL; do not recreate a parallel migration history.
- Demo data is separate from migrations and should never become schema canon.
