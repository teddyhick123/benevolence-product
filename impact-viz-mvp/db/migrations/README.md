# Database Migrations

Clean-room rework of the schema. Replaces 74 ad-hoc legacy files with 23 ordered
migrations organized by dependency layer.

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
| 0005_uploads_and_staging | Foundation | File uploads, staging tables |
| 0006_holdings | Investment | Universal asset table, holding_facts, widgets |
| 0007_investment_tracking | Investment | Valuations, transactions, co-investors |
| 0008_metrics_and_kpis | Investment | KPI definitions, metric facts, recommendations |
| 0009_grants | Investment | Grant management and reporting |
| 0010_charities_and_news | Reference | Charity lookup DB, news article cache |
| 0011_reports | Reports | Generated portfolio reports |
| 0012_owner_tax_profile | Tax | Portfolio owner's personal tax data (NOT the donor CRM) |
| 0013_tax_contributions | Tax | Charitable deductions, Form 8283, carryforward |
| 0014_donors | Donors | Donor CRM, contributions received |
| 0015_acknowledgments | Donors | Letter templates and acknowledgment letters |
| 0016_compliance | Compliance | Filing calendar, state registrations |
| 0017_quickbooks | QuickBooks | QB OAuth tokens, accounts, transactions |
| 0018_import_system | Import | Import jobs, mapping profiles, FK back-refs |
| 0019_portfolio_summary_views | Views | Materialized views, financial analysis cache |
| 0020_ai_portfolio_manager | AI | Conversation threads, action log |
| 0021_composite_indexes | Performance | Cross-table query indexes |
| 0022_module_enforcement | Admin | Module flags validation, module definitions |
| 0023_admin_superuser_policies | Admin | App admin policies, org type defaults, provision RPC |

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

### owner_tax_profile vs donors
- `owner_tax_profiles` (0012): the portfolio owner's personal tax data
  (AGI, filing status, QCD eligibility). Portfolio-scoped. Strict access.
- `donors` (0014): the donor CRM — external people who give to this org.
  Org-scoped. Member access.

### QuickBooks is org-scoped, no portfolio_id
One QB connection per org. `quickbooks_connections` and `qb_accounts` have
`org_id NOT NULL` and no `portfolio_id` column. QB transactions can optionally
link to individual holdings via `holding_id`.

### Demo data is separate
Never committed to `db/migrations/`. Lives in `db/demo/`. The migration runner
explicitly skips the `demo/` directory.

## Legacy files
The original 74 migration files are preserved in `db/legacy/` for reference.
They must not be run against any new deployment.
