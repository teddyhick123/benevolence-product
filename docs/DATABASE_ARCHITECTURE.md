# Database Architecture

## Overview

This document maps all database tables to their respective modules, enabling modular client deployments.

**Total Tables**: 77
**Migration Files**: 50+

---

## Table Organization by Module

### 🔒 CORE (Always Required)
*These tables are needed for any deployment*

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles linked to Supabase auth |
| `portfolios` | Investment/grant portfolios |
| `holdings` | Individual holdings within portfolios |
| `organizations` | Client organizations |
| `organization_members` | User-org membership & roles |
| `organization_modules` | Which modules each org has enabled |
| `modules` | Module definitions (seed data) |
| `module_presets` | Pre-configured module bundles |
| `portfolio_members` | User-portfolio membership |
| `portfolio_settings` | Portfolio configuration |
| `admins` | Platform administrators |

**Migration Files**: `0001_init.sql`, `0002_current.sql`, `0047_organizations.sql`, `0060_organization_modules.sql`

---

### 📊 IMPACT_TRACKING Module
*KPIs, metrics, and impact measurement*

| Table | Purpose |
|-------|---------|
| `metrics` | Metric definitions (e.g., "Jobs Created") |
| `metric_facts` | Actual metric values with timestamps |
| `staging_metric_facts` | Pending metrics awaiting approval |
| `portfolio_metric_targets` | Target values for metrics |
| `holding_valuations` | Financial valuations over time |
| `holding_transactions` | Cash flows (grants, investments) |
| `holding_contributions` | Funding contributions to holdings |
| `sdg_mapping` | UN SDG mappings for holdings |
| `targets` | Legacy targets table |
| `holding_locations` | Geolocation data for map views |

**Migration Files**: `0002_current.sql`, `0003_kpi_aggregation.sql`, `0035_holdings_geocoding.sql`, `0039_portfolio_metric_targets.sql`

---

### 📋 GRANT_MANAGEMENT Module
*For foundations & DAFs managing grants*

| Table | Purpose |
|-------|---------|
| `grant_details` | Core grant information (linked to holdings) |
| `grant_milestones` | Deliverables and deadlines |
| `grant_payments` | Scheduled and actual disbursements |
| `grant_reports` | Required reporting schedules |
| `grant_documents` | Grant-related file storage |
| `grant_communications` | Communication log with grantees |
| `grant_contacts` | Contact persons at grantee orgs |
| `grant_budget_items` | Line-item budgets |
| `workflow_templates` | Reusable workflow definitions |
| `workflow_instances` | Active workflow executions |
| `workflow_tasks` | Individual workflow tasks |
| `daf_grants` | DAF-specific grant data |

**Migration Files**: `0019_grant_management.sql`, `0065_grant_management_enhanced.sql`

---

### 👥 DONOR_MANAGEMENT Module
*For nonprofits tracking incoming donations*

| Table | Purpose |
|-------|---------|
| `donors` | Donor profiles and contact info |
| `donor_profiles` | Extended donor information |
| `contributions_received` | Incoming donation records |
| `donor_communications` | Outreach and thank-you tracking |
| `acknowledgment_letters` | Generated acknowledgment letters |

**Migration Files**: `0070_donor_management.sql`

---

### 💰 TAX_OPTIMIZATION Module
*Tax planning and compliance*

| Table | Purpose |
|-------|---------|
| `tax_profiles` | Taxpayer information (AGI, filing status) |
| `tax_years` | Year-specific tax data |
| `tax_contributions` | Charitable contributions for tax purposes |
| `tax_carryforwards` | Unused deduction carryforwards |
| `tax_documents` | Tax-related document storage |
| `foundation_990pf_data` | IRS 990-PF form data |
| `cpa_share_links` | CPA collaboration share links |
| `cpa_access_logs` | CPA access audit trail |

**Migration Files**: `0013_tax_tracking.sql`, `0015_tax_documents_storage.sql`, `0021_tax_holding_integration.sql`, `0024_enhanced_tax_fields.sql`, `0028_cpa_collaboration.sql`

---

### 📄 REPORTING Module
*Report generation and templates*

| Table | Purpose |
|-------|---------|
| `report_templates` | Reusable report templates |
| `report_schedules` | Scheduled report generation |
| `generated_documents` | Generated report outputs |
| `generated_letters` | Generated correspondence |

**Migration Files**: `0050_report_templates.sql`, `0075_reporting_enhanced.sql`

---

### 📈 ANALYTICS Module
*Advanced analytics and projections*

| Table | Purpose |
|-------|---------|
| `analytics_insights` | AI-generated insights |
| `benchmark_data` | Industry benchmark comparisons |
| `metric_projections_cache` | Projected metric values |
| `portfolio_risk_snapshots` | Risk assessment snapshots |

**Migration Files**: `0080_analytics_enhanced.sql`

---

### 🌐 EXTERNAL_DATA Module
*Third-party data integrations*

| Table | Purpose |
|-------|---------|
| `charities` | Global charity database |
| `charity_rating_cache` | Cached ratings (Charity Navigator, etc.) |
| `charity_activity_feed` | Recent charity news/updates |
| `charity_impact_stories` | Impact narratives |
| `news_articles` | Aggregated news |
| `geocode_cache` | Geocoding API cache |
| `generated_financial_analyses` | AI financial analyses |

**Migration Files**: `0030_charities_global_database.sql`, `0034_charity_rating_cache.sql`, `0036_geocode_cache.sql`

---

### 🤖 AI_ASSISTANT (Part of Core)
*AI-powered features*

| Table | Purpose |
|-------|---------|
| `ai_sessions` | Conversation sessions |
| `ai_actions` | Actions taken by AI |
| `portfolio_recommendations` | AI grant recommendations |
| `recommendation_comments` | Comments on recommendations |
| `recommendation_favorites` | Saved recommendations |
| `recommendation_status_history` | Recommendation status tracking |

**Migration Files**: `0012_ai_portfolio_manager.sql`, `0013_portfolio_recommendations.sql`

---

### 🚀 ONBOARDING (Part of Core)
*User onboarding flow*

| Table | Purpose |
|-------|---------|
| `onboarding_sessions` | Onboarding session state |
| `onboarding_profiles` | Extracted user needs |
| `onboarding_recommendations` | Module recommendations |
| `onboarding_analytics` | Onboarding funnel metrics |

**Migration Files**: `0085_onboarding_system.sql`

---

### 🔧 UTILITY Tables
*Supporting infrastructure*

| Table | Purpose |
|-------|---------|
| `uploads` | File upload tracking |
| `holding_widgets` | Custom widget configurations |
| `widgets` | Widget definitions |
| `events` | System events |
| `reminders` | Scheduled reminders |
| `investees` | Investment recipients |

---

## Modular Migration Strategy

### For New Client Deployment

```bash
# 1. ALWAYS RUN - Core tables
db/core/
├── 0001_core_schema.sql        # profiles, portfolios, holdings
├── 0002_organizations.sql       # orgs, members, modules
└── 0003_ai_assistant.sql        # ai_sessions, onboarding

# 2. RUN BASED ON ENABLED MODULES
db/modules/
├── impact_tracking.sql          # IF impact_tracking enabled
├── grant_management.sql         # IF grant_management enabled
├── donor_management.sql         # IF donor_management enabled
├── tax_optimization.sql         # IF tax_optimization enabled
├── reporting.sql                # IF reporting enabled
├── analytics.sql                # IF analytics enabled
└── external_data.sql            # IF external_data enabled
```

### Recommended Reorganization

Current state: 50+ numbered migrations (hard to maintain)
Proposed state: Consolidated module-based migrations

```
db/
├── core/
│   └── schema.sql              # All core tables
├── modules/
│   ├── impact_tracking.sql
│   ├── grant_management.sql
│   ├── donor_management.sql
│   ├── tax_optimization.sql
│   ├── reporting.sql
│   ├── analytics.sql
│   └── external_data.sql
├── seeds/
│   ├── modules.sql             # Module definitions
│   ├── metrics.sql             # Default metrics
│   └── demo_data.sql           # Optional demo data
└── migrations/
    └── (incremental changes)
```

---

## Client Provisioning Checklist

### Supabase Setup
- [ ] Create new Supabase project
- [ ] Run core schema
- [ ] Run selected module schemas
- [ ] Seed module definitions
- [ ] Configure RLS policies
- [ ] Set up storage buckets

### Environment Variables
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE`
- [ ] `ANTHROPIC_API_KEY`
- [ ] Branding variables

### Post-Setup
- [ ] Create admin user
- [ ] Enable selected modules via onboarding
- [ ] Apply client branding
- [ ] Deploy to Vercel

---

## Table Dependencies

```
profiles ←── portfolio_members ←── portfolios
    │                                   │
    │                                   ├── holdings
    │                                   │      │
    └── organization_members            │      ├── metric_facts
               │                        │      ├── grant_details
               v                        │      └── holding_contributions
        organizations                   │
               │                        └── portfolio_recommendations
               └── organization_modules
```

---

## Migration Consolidation TODO

1. **Audit current migrations** - identify what's actually used
2. **Create consolidated scripts** - one per module
3. **Test fresh deployment** - verify all tables create correctly
4. **Add provisioning script** - automate client setup
5. **Document RLS policies** - ensure security is module-aware
