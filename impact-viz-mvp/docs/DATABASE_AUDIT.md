# Database Audit Report

Generated: 2026-03-01

## Summary

| Category | Count |
|----------|-------|
| Tables | 77 |
| Views | 26 |
| Functions | 56 |
| Triggers | 35 |
| Migration Files | 50+ |

---

## Usage Analysis

### Heavily Used Tables (>10 references in code)
| Table | References | Module |
|-------|------------|--------|
| `holdings` | 117 | Core |
| `metric_facts` | 52 | Impact Tracking |
| `charities` | 33 | External Data |
| `ai_actions` | 29 | AI Assistant |
| `portfolio_members` | 28 | Core |
| `contributions_received` | 27 | Donor Management |
| `grant_details` | 23 | Grant Management |
| `uploads` | 20 | Core |
| `portfolio_recommendations` | 20 | AI Assistant |
| `onboarding_sessions` | 19 | Onboarding |
| `widgets` | 17 | Core |
| `organizations` | 17 | Core |
| `organization_members` | 17 | Core |
| `portfolios` | 15 | Core |
| `donors` | 14 | Donor Management |
| `staging_metric_facts` | 13 | Impact Tracking |
| `organization_holdings` | 13 | Core |
| `holding_widgets` | 13 | Core |
| `holding_locations` | 13 | External Data |
| `acknowledgment_letters` | 13 | Donor Management |
| `organization_modules` | 12 | Core |
| `metrics` | 12 | Impact Tracking |

### Moderately Used Tables (3-10 references)
| Table | References | Module |
|-------|------------|--------|
| `tax_years` | 11 | Tax Optimization |
| `portfolio_metric_targets` | 11 | Impact Tracking |
| `tax_contributions` | 10 | Tax Optimization |
| `report_templates` | 9 | Reporting |
| `grant_milestones` | 9 | Grant Management |
| `generated_documents` | 8 | Reporting |
| `tax_profiles` | 7 | Tax Optimization |
| `donor_profiles` | 7 | Donor Management |
| `tax_documents` | 6 | Tax Optimization |
| `onboarding_analytics` | 6 | Onboarding |
| `holding_valuations` | 6 | Impact Tracking |
| `holding_transactions` | 6 | Impact Tracking |
| `grant_payments` | 6 | Grant Management |
| `workflow_tasks` | 5 | Grant Management |
| `workflow_instances` | 5 | Grant Management |
| `report_schedules` | 5 | Reporting |
| `recommendation_comments` | 5 | AI Assistant |
| `onboarding_recommendations` | 5 | Onboarding |
| `generated_financial_analyses` | 5 | External Data |
| `portfolio_risk_snapshots` | 4 | Analytics |
| `onboarding_profiles` | 4 | Onboarding |
| `holding_contributions` | 4 | Impact Tracking |
| `grant_communications` | 4 | Grant Management |
| `generated_letters` | 4 | Reporting |
| `charity_rating_cache` | 4 | External Data |
| `analytics_insights` | 4 | Analytics |
| `ai_sessions` | 4 | AI Assistant |
| `workflow_templates` | 3 | Grant Management |
| `recommendation_status_history` | 3 | AI Assistant |
| `recommendation_favorites` | 3 | AI Assistant |
| `profiles` | 3 | Core |
| `module_presets` | 3 | Core |
| `donor_communications` | 3 | Donor Management |

### Lightly Used Tables (1-2 references)
| Table | References | Module | Notes |
|-------|------------|--------|-------|
| `tax_carryforwards` | 2 | Tax Optimization | |
| `reminders` | 2 | Core | |
| `portfolio_settings` | 2 | Core | |
| `metric_projections_cache` | 2 | Analytics | |
| `geocode_cache` | 2 | External Data | |
| `cpa_share_links` | 2 | Tax Optimization | |
| `benchmark_data` | 2 | Analytics | |
| `admins` | 2 | Core | |
| `targets` | 1 | Impact Tracking | Legacy? |
| `news_articles` | 1 | External Data | |
| `events` | 1 | Core | |
| `charity_impact_stories` | 1 | External Data | |
| `charity_activity_feed` | 1 | External Data | |

### Potentially Unused Tables (0 references in code)
| Table | Module | Recommendation |
|-------|--------|----------------|
| `investees` | Core | Review - may be unused |
| `sdg_mapping` | Impact Tracking | Review - may be for future use |
| `kpi_definitions` | Impact Tracking | Check if migrated to `metrics` |
| `daf_grants` | Grant Management | Review - may be merged with grant_details |
| `foundation_990pf_data` | Tax Optimization | Review - specific use case |
| `cpa_access_logs` | Tax Optimization | Audit logging - keep |
| `grant_budget_items` | Grant Management | Review usage |
| `grant_contacts` | Grant Management | Review usage |
| `grant_documents` | Grant Management | Review usage |
| `grant_reports` | Grant Management | Review usage |

---

## Views Usage

### Used Views
| View | References | Purpose |
|------|------------|---------|
| `v_portfolio_kpi_latest` | 12 | Latest KPI values per portfolio |
| `v_tax_contributions_enriched` | 6 | Tax contributions with deduction info |
| `v_donor_summary` | 6 | Donor giving summaries |
| `v_tax_contributions_with_limits` | 5 | Tax contributions with AGI limits |
| `v_investment_performance` | 4 | Investment returns |
| `v_holdings` | 4 | Holdings with related data |
| `v_grant_health` | 4 | Grant health scores |
| `v_portfolio_tax_summary` | 3 | Portfolio tax overview |
| `v_portfolio_grant_summary` | 3 | Portfolio grant overview |
| `v_grants` | 2 | Grant listings |
| `v_contribution_with_donor` | 2 | Contributions with donor info |
| `v_active_carryforwards` | 2 | Active tax carryforwards |

### Unused Views
| View | Purpose | Recommendation |
|------|---------|----------------|
| `v_portfolio_kpi_series` | Time series KPIs | Keep - likely used in charts |
| `v_portfolio_unified_summary` | Combined summary | Review |
| `v_active_insights` | Active analytics | Review |
| `v_active_schedules` | Active report schedules | Review |
| `v_benchmark_lookup` | Benchmark data | Review |
| `v_carryforward_schedule` | Carryforward timeline | May be used |
| `v_latest_risk_snapshot` | Latest risk data | Review |
| `v_recent_documents` | Recent docs | Review |
| `v_holdings_with_tax` | Holdings + tax | Review |
| `charities_with_stats` | Charity statistics | Review |
| `recommendations_with_stats` | Rec statistics | Review |
| `recommendations_with_status` | Rec status | Review |

---

## RPC Functions Usage

### Heavily Used Functions
| Function | Calls | Purpose |
|----------|-------|---------|
| `can_edit_portfolio` | 55 | Permission check |
| `org_role` | 14 | Get user's org role |
| `is_admin` | 14 | Admin check |
| `is_org_admin` | 11 | Org admin check |
| `can_edit_org` | 11 | Org edit permission |

### Moderately Used Functions
| Function | Calls | Purpose |
|----------|-------|---------|
| `generate_receipt_number` | 5 | Donor receipts |
| `role_for_portfolio` | 4 | Portfolio role |
| `get_upcoming_deadlines` | 2 | Grant deadlines |
| `get_donor_annual_summary` | 2 | Donor summaries |
| `generate_share_token` | 2 | CPA sharing |
| `generate_risk_snapshot` | 2 | Risk analytics |
| `can_view_portfolio` | 2 | View permission |

### Used Once
| Function | Purpose |
|----------|---------|
| `get_or_create_onboarding_session` | Onboarding |
| `get_or_create_ai_session` | AI assistant |
| `get_portfolio_latest_kpis_sum` | KPI aggregation |
| `get_top_kpis_per_holding` | KPI display |
| `get_donation_capacity` | Tax planning |
| `get_geocode_cache_stats` | Admin stats |
| `clean_expired_geocode_cache` | Maintenance |
| `revoke_share_link` | CPA sharing |

---

## Module Dependencies

### CORE (Required for all deployments)
**Tables:**
- `profiles`
- `portfolios`
- `portfolio_members`
- `portfolio_settings`
- `holdings`
- `organizations`
- `organization_members`
- `organization_modules`
- `organization_holdings`
- `modules`
- `module_presets`
- `admins`
- `uploads`
- `widgets`
- `holding_widgets`

**Functions:**
- `can_edit_portfolio`
- `can_view_portfolio`
- `role_for_portfolio`
- `owner_count_for_portfolio`
- `is_admin`
- `org_role`
- `is_org_admin`
- `is_org_member`
- `can_edit_org`
- `can_view_org_through_holding`
- `get_org_modules`
- `org_has_module`
- `set_updated_at`

---

### IMPACT_TRACKING Module
**Tables:**
- `metrics`
- `metric_facts`
- `staging_metric_facts`
- `portfolio_metric_targets`
- `holding_valuations`
- `holding_transactions`
- `holding_contributions`
- `targets` (legacy?)

**Views:**
- `v_portfolio_kpi_latest`
- `v_portfolio_kpi_series`
- `v_holdings`

**Functions:**
- `get_portfolio_latest_kpis_sum`
- `get_top_kpis_per_holding`

---

### GRANT_MANAGEMENT Module
**Tables:**
- `grant_details`
- `grant_milestones`
- `grant_payments`
- `grant_reports`
- `grant_documents`
- `grant_communications`
- `grant_contacts`
- `grant_budget_items`
- `workflow_templates`
- `workflow_instances`
- `workflow_tasks`
- `daf_grants`

**Views:**
- `v_grants`
- `v_grant_health`
- `v_portfolio_grant_summary`

**Functions:**
- `get_upcoming_deadlines`
- `get_overdue_milestones`
- `get_upcoming_grant_reports`

---

### DONOR_MANAGEMENT Module
**Tables:**
- `donors`
- `donor_profiles`
- `contributions_received`
- `donor_communications`
- `acknowledgment_letters`

**Views:**
- `v_donor_summary`
- `v_contribution_with_donor`

**Functions:**
- `generate_receipt_number`
- `get_donor_annual_summary`
- `update_donor_giving_stats`

---

### TAX_OPTIMIZATION Module
**Tables:**
- `tax_profiles`
- `tax_years`
- `tax_contributions`
- `tax_carryforwards`
- `tax_documents`
- `foundation_990pf_data`
- `cpa_share_links`
- `cpa_access_logs`

**Views:**
- `v_tax_contributions_enriched`
- `v_tax_contributions_with_limits`
- `v_portfolio_tax_summary`
- `v_active_carryforwards`
- `v_carryforward_schedule`
- `v_holdings_with_tax`

**Functions:**
- `get_donation_capacity`
- `get_agi_for_year`
- `calculate_deduction_limit`
- `auto_generate_carryforwards`
- `validate_qcd_eligibility`
- `generate_share_token`
- `get_valid_share_link`
- `revoke_share_link`
- `increment_share_link_access`

---

### REPORTING Module
**Tables:**
- `report_templates`
- `report_schedules`
- `generated_documents`
- `generated_letters`

**Views:**
- `v_recent_documents`
- `v_active_schedules`

**Functions:**
- `calculate_next_run_time`
- `auto_calculate_next_run`
- `enforce_single_default_template`

---

### ANALYTICS Module
**Tables:**
- `analytics_insights`
- `benchmark_data`
- `metric_projections_cache`
- `portfolio_risk_snapshots`

**Views:**
- `v_active_insights`
- `v_benchmark_lookup`
- `v_latest_risk_snapshot`

**Functions:**
- `generate_risk_snapshot`
- `calculate_hhi`
- `calculate_donor_age`
- `get_concentration_risk_level`

---

### EXTERNAL_DATA Module
**Tables:**
- `charities`
- `charity_rating_cache`
- `charity_activity_feed`
- `charity_impact_stories`
- `news_articles`
- `geocode_cache`
- `holding_locations`
- `generated_financial_analyses`

**Views:**
- `charities_with_stats`

**Functions:**
- `charities_search_vector_trigger`
- `cleanup_expired_rating_cache`
- `clean_expired_geocode_cache`
- `mark_geocode_pending`
- `get_geocode_cache_stats`
- `sync_recommendation_to_charity`

---

### AI_ASSISTANT (Part of Core)
**Tables:**
- `ai_sessions`
- `ai_actions`
- `portfolio_recommendations`
- `recommendation_comments`
- `recommendation_favorites`
- `recommendation_status_history`

**Views:**
- `recommendations_with_stats`
- `recommendations_with_status`

**Functions:**
- `get_or_create_ai_session`
- `undo_ai_action`
- `redo_ai_action`
- `get_recommendation_comment_count`
- `record_recommendation_status_change`

---

### ONBOARDING (Part of Core)
**Tables:**
- `onboarding_sessions`
- `onboarding_profiles`
- `onboarding_recommendations`
- `onboarding_analytics`

**Functions:**
- `get_or_create_onboarding_session`
- `get_latest_onboarding_session`
- `has_completed_onboarding`

---

## Consolidation Plan

### Phase 1: Create Consolidated Module Files
1. `db/consolidated/00_core.sql` - All core tables, functions, policies
2. `db/consolidated/01_impact_tracking.sql`
3. `db/consolidated/02_grant_management.sql`
4. `db/consolidated/03_donor_management.sql`
5. `db/consolidated/04_tax_optimization.sql`
6. `db/consolidated/05_reporting.sql`
7. `db/consolidated/06_analytics.sql`
8. `db/consolidated/07_external_data.sql`
9. `db/consolidated/08_seeds.sql` - Module definitions, presets

### Phase 2: Test Fresh Deployment
1. Create test Supabase project
2. Run consolidated scripts in order
3. Verify all tables, views, functions exist
4. Run app against test database
5. Fix any issues found

### Phase 3: Document Client Setup
1. Create provisioning script
2. Document environment variables
3. Create deployment checklist

---

## Tables to Review for Removal

| Table | Reason | Action |
|-------|--------|--------|
| `kpi_definitions` | Replaced by `metrics`? | Verify and remove |
| `targets` | Only 1 reference | Check if migrated |
| `investees` | 0 references | Likely unused |
| `events` | 1 reference | Check purpose |
| `reminders` | 2 references | May be unused |
| `sdg_mapping` | 0 references | Future feature? |

---

## Next Steps

1. [ ] Review "potentially unused" tables with user
2. [ ] Create consolidated core.sql
3. [ ] Create consolidated module files
4. [ ] Test on fresh Supabase instance
5. [ ] Update provisioning documentation
