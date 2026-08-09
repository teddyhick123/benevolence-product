# Database Migrations

Single source of truth for the schema. 54 ordered migrations replace the ad-hoc
legacy files and the stale consolidated module files. Late prerelease patches
have been folded into the canonical owning migrations.

## Running migrations

```bash
# Apply all migrations in order (idempotent — skips already-applied)
scripts/run-migrations.sh

# Apply a single file (for development)
psql $DATABASE_URL -f db/migrations/0006_holdings.sql

# Seed demo data (local dev only — never in production)
psql $DATABASE_URL -f db/demo/seed_demo_org.sql
```

## File index

| File | Layer | Description |
|------|-------|-------------|
| 0001_extensions_and_shared_infra | Foundation | Extensions, enums, utility functions, audit log |
| 0002_organizations | Foundation | Organizations, members, invitations — root tenant |
| 0003_profiles | Foundation | User profiles, auto-created on signup |
| 0004_portfolios | Foundation | Portfolios, portfolio members, membership⊆org trigger |
| 0005_uploads_and_staging | Foundation | File uploads, staging tables for import |
| 0006_holdings | Investment | Universal asset table, holding_facts, widgets, holding locations |
| 0007_investment_tracking | Investment | Valuations, transactions, co-investors |
| 0008_metrics_and_kpis | Investment | KPI definitions, metric facts, recommendations |
| 0009_grants | Historical | Placeholder only; canonical grant lifecycle tables are created in 0041 |
| 0010_charities_and_news | Reference | Charity lookup DB, investees, external caches, news, events |
| 0011_reports | Reports | Reports, templates, generated documents, schedules |
| 0012_owner_tax_profile | Historical | Placeholder only; personal tax data lives in 0013 tax tables |
| 0013_tax_contributions | Tax | Charitable deductions, Form 8283, carryforward |
| 0014_donors | Donors | Donor CRM, contributions received, communications |
| 0015_acknowledgments | Donors | Letter templates and acknowledgment letters |
| 0016_compliance | Compliance | Filing calendar, registrations, profiles, self-dealing, payout history |
| 0017_quickbooks | QuickBooks | QB OAuth tokens, accounts, transactions |
| 0018_import_system | Import | Import jobs, mapping profiles, AI suggestions, stale-job watchdog, FK back-refs |
| 0019_portfolio_summary_views | Views | Portfolio summary and holdings enriched views |
| 0020_ai_portfolio_manager | Historical | Placeholder only; canonical AI session/action tables are created in 0033 |
| 0021_composite_indexes | Performance | Cross-table query indexes |
| 0022_module_enforcement | Admin | Module flags validation, module_definitions table |
| 0023_admin_superuser_policies | Admin | App admin policies, org type defaults, provision RPC |
| 0024_settings_ops_hub | Settings | org_audit_log and notification_prefs |
| 0025_builder | Builder | Canonical Builder schema: proposals, sessions, and the durable orchestration contract (revisions, review attempts, verification runs, findings, delivery records) |
| 0027_portfolio_charities | Charities | Portfolio-level charity links |
| 0028_foundation_payout | Historical | Placeholder only; foundation_990pf_data is defined in 0013 |
| 0029_ai_action_source | Historical | Placeholder only; ai_actions.initiated_by is defined in 0033 |
| 0030_ai_usage_log | AI | Token usage log per AI chat call (cost visibility) |
| 0031_staging_cleanup | Admin | `cleanup_staging_pii()` function (SECURITY DEFINER) |
| 0033_ai_sessions | AI | ai_sessions, durable ai_turns/ai_messages, ai_actions, portfolio_recommendations |
| 0034_onboarding | Onboarding | Onboarding sessions, profiles, recommendations, analytics |
| 0035_analytics_module | Analytics | Benchmarks, projections cache, risk snapshots, insights, investment performance views |
| 0036_seeds | Seeds | Module definitions and preset bundles |
| 0037_qb_sync_log | QuickBooks | QuickBooks sync event logging |
| 0038_pledge_tracking | Donors | Pledge lifecycle, installments, events, and pipeline view |
| 0039_alignment_fixes | Historical | Placeholder only; receipt fields and module aliases are folded into canonical migrations |
| 0040_holdings_org_alignment | Fix | Holdings org alignment and compatibility fixes |
| 0041_task_workflow_foundation | Workflow | Tasks, workflow tables, canonical grant lifecycle tables, grant-linked compliance, and deadline views |
| 0042_task_automation_runs | Workflow | Task automation run log and advisory lock helper |
| 0043_tax_cpa_sharing | Tax | CPA share links and access logging |
| 0044_builder_events | Builder | Builder event log and activity views |
| 0045_security_invoker_views | Security | Rebuild scoped views with `security_invoker = true` |
| 0046_compliance_documents_bucket | Compliance | Private compliance document storage bucket and policies |
| 0047_grant_lifecycle_transition_rpc | Grants | Canonical grant lifecycle transition RPC and history enforcement |
| 0048_cpa_atomic_access_logging | Tax | Atomic CPA access logging and share-link validation helper |
| 0049_workflow_config | Workflow | Org workflow configuration and grant checklist completions |
| 0050_custom_fields | Configurability | Org custom field definitions and entity values |
| 0051_configurable_automations | Automation | Org automation rules and run history |
| 0052_org_ai_context | AI | Organization AI context and guidance configuration |
| 0053_org_view_config | Configurability | Per-org view configuration |
| 0054_org_member_capabilities | Access | Additive org-member capabilities for implementation review |
| 0055_role_permission_alignment | Access | Align canonical role and ownership enforcement |
| 0056_onboarding_provisioning_recovery | Onboarding | Retry-safe onboarding automation seeding |

## Architecture decisions

### Org-first from migration 0002
`organizations` is the root entity. `portfolios` requires `org_id NOT NULL`.
There is no way to create a portfolio without an org. This enforces the
per-client deployment model from the very first record.

### Unified role vocabulary
Both org and portfolio use `member_role_enum`: `owner / admin / member / viewer`.
No more `editor` vs `owner` vs `admin` inconsistency.

### Portfolio membership ⊆ org membership
A user cannot be added to a portfolio unless they are already an org member.
Enforced by trigger `trg_enforce_portfolio_member_in_org`. This prevents
portfolio-level access from bypassing org-level access control.

### Module enforcement in RLS
Sensitive tables (tax, donors, compliance, quickbooks) check
`org_has_module(org_id, '<module>')` inside their RLS policies.
A user with org membership but a disabled module gets a 0-row response,
not a 403 — consistent with PostgREST behavior.

### Tax profiles vs donors
- `0012_owner_tax_profile` is an empty historical placeholder. The removed
  `owner_tax_profiles` table must not be recreated.
- Personal tax planning data lives in `tax_profiles` and `tax_years`.
- `donors` (0014) is the donor CRM — external people who give to this org.
  It is org-scoped with member access.

### QuickBooks is org-scoped, no portfolio_id
One QB connection per org. `quickbooks_connections` and `qb_accounts` have
`org_id NOT NULL` and no `portfolio_id` column. QB transactions can optionally
link to individual holdings via `holding_id`.

### AI tables
`ai_sessions`, `ai_turns`, `ai_messages`, and `ai_actions` (0033) are the
canonical assistant state tables. Sessions hold metadata, turns provide a
request-id idempotency boundary, and messages are normalized append-only rows.
The earlier `ai_conversations` and `ai_action_log` schema is intentionally not
created in active migrations.

### Seeds are migrations (0036)
Module definitions and presets live in 0036_seeds.sql so they run in the same
pipeline as schema changes. All inserts use `ON CONFLICT DO UPDATE` for
idempotency.

### Demo data is separate
Never committed to `db/migrations/`. Lives in `db/demo/`. The migration runner
explicitly skips the `demo/` directory.

## Retired SQL

Git history is the only archive for superseded migrations. Do not recreate a
`db/legacy/` tree or use old SQL as implementation authority.
