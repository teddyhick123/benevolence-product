# Consolidated Database Migrations

This directory contains consolidated, module-based SQL migrations for provisioning new Benevolence client instances.

## Overview

These migrations consolidate 50+ numbered migration files into organized, module-based files that can be run in sequence to set up a complete database schema.

## Execution Order

Run migrations in numerical order. **00_core.sql must always be run first** as it contains tables and functions required by all other modules.

| File | Module | Required | Description |
|------|--------|----------|-------------|
| `00_core.sql` | Core | Yes | Base tables, helper functions, RLS policies |
| `01_impact_tracking.sql` | Impact Tracking | No | Metrics, KPIs, valuations |
| `02_grant_management.sql` | Grant Management | No | Grants, milestones, workflows |
| `03_donor_management.sql` | Donor Management | No | Donors, contributions, acknowledgments |
| `04_tax_optimization.sql` | Tax Optimization | No | Tax profiles, deductions, CPA sharing |
| `05_reporting.sql` | Reporting | No | Report templates, schedules, documents |
| `06_analytics.sql` | Analytics | No | Benchmarks, projections, risk analysis |
| `07_external_data.sql` | External Data | No | Charities, ratings, news aggregation |
| `08_ai_assistant.sql` | AI Assistant | No | AI sessions, actions, recommendations |
| `09_onboarding.sql` | Onboarding | No | Onboarding sessions, profiles, analytics |
| `10_seeds.sql` | Seed Data | Yes | Module definitions, presets |

## Module Dependencies

Some modules depend on others:

- **Reporting** depends on **Impact Tracking** (requires `01_impact_tracking.sql`)
- **Analytics** depends on **Impact Tracking** (requires `01_impact_tracking.sql`)

## Minimal Deployment

For a minimal deployment, run:

```bash
psql $DATABASE_URL < 00_core.sql
psql $DATABASE_URL < 10_seeds.sql
```

## Full Deployment

For a full deployment with all features:

```bash
for f in *.sql; do
  psql $DATABASE_URL < "$f"
done
```

## Table Summary

### 00_core.sql (Always Required)
- `profiles` - User profiles linked to auth.users
- `portfolios` - Portfolios owned by users
- `portfolio_members` - Portfolio collaboration/sharing
- `holdings` - Individual grantees/holdings in portfolios
- `organizations` - Organization entities
- `organization_members` - Organization membership and roles
- `modules` - Available feature modules
- `organization_modules` - Which modules each org has enabled
- `module_presets` - Pre-configured module bundles
- `admins` - Platform administrators
- `uploads` - Document/file uploads
- `widgets` - Dashboard widget configurations

### 01_impact_tracking.sql
- `metrics` - Impact metric definitions
- `metric_facts` - Metric values over time
- `staging_metric_facts` - Staging for bulk imports
- `portfolio_metric_targets` - Target values per portfolio
- `holding_valuations` - Financial valuations
- `holding_transactions` - Transaction history
- `holding_contributions` - Contribution records
- `holding_locations` - Geographic data

### 02_grant_management.sql
- `grant_details` - Grant-specific details for holdings
- `grant_milestones` - Milestone tracking
- `grant_payments` - Payment schedules
- `grant_reports` - Required reports
- `grant_documents` - Document attachments
- `grant_communications` - Communication log
- `grant_contacts` - Contact information
- `grant_budget_items` - Budget line items
- `workflow_templates` - Reusable workflows
- `workflow_instances` - Active workflow instances
- `workflow_tasks` - Individual tasks

### 03_donor_management.sql
- `donors` - Donor records
- `donor_profiles` - Extended donor information
- `contributions_received` - Incoming contributions
- `acknowledgment_letters` - Thank you letters
- `donor_communications` - Communication history

### 04_tax_optimization.sql
- `tax_profiles` - Tax configuration per portfolio
- `tax_years` - Tax year snapshots
- `tax_contributions` - Contribution records for tax
- `tax_carryforwards` - Carryforward tracking
- `tax_documents` - Tax-related documents
- `foundation_990pf_data` - Form 990-PF data
- `cpa_share_links` - Shareable links for CPAs
- `cpa_access_logs` - Access audit trail

### 05_reporting.sql
- `report_templates` - Report configurations
- `report_schedules` - Scheduled report generation
- `generated_documents` - Generated reports
- `generated_letters` - Generated correspondence

### 06_analytics.sql
- `benchmark_data` - Industry benchmarks
- `metric_projections_cache` - Cached projections
- `portfolio_risk_snapshots` - Risk assessments
- `analytics_insights` - AI-generated insights

### 07_external_data.sql
- `charities` - Global charity database
- `charity_rating_cache` - Cached ratings from providers
- `charity_activity_feed` - Charity news and updates
- `charity_impact_stories` - Impact narratives
- `news_articles` - Aggregated news
- `geocode_cache` - Geocoding cache
- `generated_financial_analyses` - AI financial analyses

### 08_ai_assistant.sql
- `ai_sessions` - AI conversation sessions
- `ai_actions` - Actions taken by AI
- `portfolio_recommendations` - AI recommendations
- `recommendation_comments` - Comments on recommendations
- `recommendation_favorites` - Favorited recommendations
- `recommendation_status_history` - Status change tracking

### 09_onboarding.sql
- `onboarding_sessions` - Onboarding session lifecycle
- `onboarding_profiles` - Extracted user insights
- `onboarding_recommendations` - Module recommendations
- `onboarding_analytics` - Funnel metrics

### 10_seeds.sql
- Module definitions (8 modules)
- Module presets (6 organization types)

## Notes

- All tables include Row Level Security (RLS) policies
- The `service_role` has full access for backend operations
- Helper functions (e.g., `can_edit_portfolio()`, `is_org_member()`) are defined in `00_core.sql`
- The `set_updated_at()` trigger function is defined in `00_core.sql` and used by all modules
