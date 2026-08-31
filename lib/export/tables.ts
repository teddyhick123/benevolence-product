// lib/export/tables.ts
// Classification of every base table in `public`, for organization export.
//
// A completeness test fails the build when a table exists in the database but
// not here. That is deliberate: a table added later would otherwise be absent
// from every client's export, and nobody would notice until someone tried to
// leave and found their data missing.
//
// Views are never listed. They are derived from base tables the archive already
// carries, and their rows cannot be inserted anywhere.

export type TableExportRule =
  /** Scoped directly. `column` is org_id everywhere except `organizations`,
   *  which is the organization's own row and is keyed by id. */
  | { table: string; kind: 'org_scoped'; column: 'org_id' | 'id' }
  /** Scoped by joining to a parent that is itself exported. */
  | { table: string; kind: 'via_parent'; parent: string; parentKey: string; localKey: string }
  /** Platform data, identical on every instance. Not the tenant's. */
  | { table: string; kind: 'reference'; reason: string }
  /** Instance state rather than tenant data. */
  | { table: string; kind: 'platform'; reason: string };

export const EXPORT_TABLES: readonly TableExportRule[] = [
  // --- The organization's own row, keyed by id rather than org_id ---
  { table: 'organizations', kind: 'org_scoped', column: 'id' },

  // --- org_scoped: 83 tables carrying org_id ---
  { table: 'acknowledgment_letters', kind: 'org_scoped', column: 'org_id' },
  { table: 'ai_deployment_evaluation_runs', kind: 'org_scoped', column: 'org_id' },
  { table: 'ai_usage_log', kind: 'org_scoped', column: 'org_id' },
  { table: 'audit_log', kind: 'org_scoped', column: 'org_id' },
  { table: 'builder_events', kind: 'org_scoped', column: 'org_id' },
  { table: 'builder_proposals', kind: 'org_scoped', column: 'org_id' },
  { table: 'builder_sessions', kind: 'org_scoped', column: 'org_id' },
  { table: 'compliance_profiles', kind: 'org_scoped', column: 'org_id' },
  { table: 'contributions_received', kind: 'org_scoped', column: 'org_id' },
  { table: 'cpa_share_links', kind: 'org_scoped', column: 'org_id' },
  { table: 'daf_grants', kind: 'org_scoped', column: 'org_id' },
  { table: 'disqualified_persons', kind: 'org_scoped', column: 'org_id' },
  { table: 'donor_communications', kind: 'org_scoped', column: 'org_id' },
  { table: 'donors', kind: 'org_scoped', column: 'org_id' },
  { table: 'events', kind: 'org_scoped', column: 'org_id' },
  { table: 'filing_calendar', kind: 'org_scoped', column: 'org_id' },
  { table: 'foundation_990pf_data', kind: 'org_scoped', column: 'org_id' },
  { table: 'grant_checklist_completions', kind: 'org_scoped', column: 'org_id' },
  { table: 'grant_decisions', kind: 'org_scoped', column: 'org_id' },
  { table: 'grant_status_history', kind: 'org_scoped', column: 'org_id' },
  { table: 'grants', kind: 'org_scoped', column: 'org_id' },
  { table: 'holding_contributions', kind: 'org_scoped', column: 'org_id' },
  { table: 'holdings', kind: 'org_scoped', column: 'org_id' },
  { table: 'import_jobs', kind: 'org_scoped', column: 'org_id' },
  { table: 'import_mapping_profiles', kind: 'org_scoped', column: 'org_id' },
  { table: 'kpi_definitions', kind: 'org_scoped', column: 'org_id' },
  { table: 'letter_templates', kind: 'org_scoped', column: 'org_id' },
  { table: 'news_articles', kind: 'org_scoped', column: 'org_id' },
  { table: 'notification_events', kind: 'org_scoped', column: 'org_id' },
  { table: 'onboarding_sessions', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_ai_connections', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_ai_context', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_ai_credentials', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_ai_deployments', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_ai_route_targets', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_ai_routes', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_ai_spend_caps', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_audit_log', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_automation_outbox', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_automation_rules', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_automation_runs', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_custom_field_definitions', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_custom_field_values', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_invitation_email_outbox', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_invitations', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_view_config', kind: 'org_scoped', column: 'org_id' },
  { table: 'org_workflow_config', kind: 'org_scoped', column: 'org_id' },
  { table: 'organization_member_capabilities', kind: 'org_scoped', column: 'org_id' },
  { table: 'organization_members', kind: 'org_scoped', column: 'org_id' },
  { table: 'pledge_events', kind: 'org_scoped', column: 'org_id' },
  { table: 'pledge_installments', kind: 'org_scoped', column: 'org_id' },
  { table: 'pledges', kind: 'org_scoped', column: 'org_id' },
  { table: 'portfolios', kind: 'org_scoped', column: 'org_id' },
  { table: 'qb_accounts', kind: 'org_scoped', column: 'org_id' },
  { table: 'qb_export_attempts', kind: 'org_scoped', column: 'org_id' },
  { table: 'qb_sync_log', kind: 'org_scoped', column: 'org_id' },
  { table: 'qb_transactions', kind: 'org_scoped', column: 'org_id' },
  { table: 'quickbooks_connections', kind: 'org_scoped', column: 'org_id' },
  { table: 'reminders', kind: 'org_scoped', column: 'org_id' },
  { table: 'reports', kind: 'org_scoped', column: 'org_id' },
  { table: 'self_dealing_incidents', kind: 'org_scoped', column: 'org_id' },
  { table: 'staging_import_contributions', kind: 'org_scoped', column: 'org_id' },
  { table: 'staging_import_donors', kind: 'org_scoped', column: 'org_id' },
  { table: 'staging_import_holdings', kind: 'org_scoped', column: 'org_id' },
  { table: 'staging_import_investees', kind: 'org_scoped', column: 'org_id' },
  { table: 'staging_import_metrics', kind: 'org_scoped', column: 'org_id' },
  { table: 'staging_import_rows', kind: 'org_scoped', column: 'org_id' },
  { table: 'state_registrations', kind: 'org_scoped', column: 'org_id' },
  { table: 'task_automation_outbox', kind: 'org_scoped', column: 'org_id' },
  { table: 'task_automation_runs', kind: 'org_scoped', column: 'org_id' },
  { table: 'task_comments', kind: 'org_scoped', column: 'org_id' },
  { table: 'task_entity_links', kind: 'org_scoped', column: 'org_id' },
  { table: 'task_events', kind: 'org_scoped', column: 'org_id' },
  { table: 'tasks', kind: 'org_scoped', column: 'org_id' },
  { table: 'tax_carryforward_applications', kind: 'org_scoped', column: 'org_id' },
  { table: 'tax_carryforwards', kind: 'org_scoped', column: 'org_id' },
  { table: 'tax_contributions', kind: 'org_scoped', column: 'org_id' },
  { table: 'tax_documents', kind: 'org_scoped', column: 'org_id' },
  { table: 'tax_profiles', kind: 'org_scoped', column: 'org_id' },
  { table: 'tax_years', kind: 'org_scoped', column: 'org_id' },
  { table: 'uploads', kind: 'org_scoped', column: 'org_id' },
  { table: 'workflow_instances', kind: 'org_scoped', column: 'org_id' },
  { table: 'workflow_templates', kind: 'org_scoped', column: 'org_id' },

  // --- via_parent: 55 tables scoped through a parent ---
  { table: 'ai_actions', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'ai_deployment_evaluation_results', kind: 'via_parent', parent: 'ai_deployment_evaluation_runs', parentKey: 'id', localKey: 'run_id' },
  { table: 'ai_messages', kind: 'via_parent', parent: 'ai_turns', parentKey: 'id', localKey: 'turn_id' },
  { table: 'ai_sessions', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'ai_turns', kind: 'via_parent', parent: 'ai_sessions', parentKey: 'id', localKey: 'session_id' },
  { table: 'analytics_insights', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'builder_delivery_records', kind: 'via_parent', parent: 'builder_proposals', parentKey: 'id', localKey: 'proposal_id' },
  { table: 'builder_proposal_revisions', kind: 'via_parent', parent: 'builder_proposals', parentKey: 'id', localKey: 'proposal_id' },
  { table: 'builder_review_attempts', kind: 'via_parent', parent: 'builder_proposals', parentKey: 'id', localKey: 'proposal_id' },
  { table: 'builder_review_findings', kind: 'via_parent', parent: 'builder_review_attempts', parentKey: 'id', localKey: 'review_attempt_id' },
  { table: 'builder_verification_runs', kind: 'via_parent', parent: 'builder_review_attempts', parentKey: 'id', localKey: 'review_attempt_id' },
  { table: 'cpa_access_logs', kind: 'via_parent', parent: 'cpa_share_links', parentKey: 'id', localKey: 'share_link_id' },
  { table: 'expenditure_responsibility_grants', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'financial_analysis_cache', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'generated_documents', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'generated_financial_analyses', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'grant_budget_items', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'grant_communications', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'grant_contacts', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'grant_documents', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'grant_milestones', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'grant_payments', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'grant_reports', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'holding_co_investors', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'holding_contacts', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'holding_facts', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'holding_locations', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'holding_transactions', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'holding_valuations', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'holding_widgets', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'import_ai_suggestions', kind: 'via_parent', parent: 'import_jobs', parentKey: 'id', localKey: 'import_job_id' },
  { table: 'import_audit_log', kind: 'via_parent', parent: 'import_jobs', parentKey: 'id', localKey: 'import_job_id' },
  { table: 'metric_facts', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'metric_projections_cache', kind: 'via_parent', parent: 'holdings', parentKey: 'id', localKey: 'holding_id' },
  { table: 'onboarding_analytics', kind: 'via_parent', parent: 'onboarding_sessions', parentKey: 'id', localKey: 'session_id' },
  { table: 'onboarding_messages', kind: 'via_parent', parent: 'onboarding_sessions', parentKey: 'id', localKey: 'session_id' },
  { table: 'onboarding_profiles', kind: 'via_parent', parent: 'onboarding_sessions', parentKey: 'id', localKey: 'session_id' },
  { table: 'onboarding_recommendations', kind: 'via_parent', parent: 'onboarding_sessions', parentKey: 'id', localKey: 'session_id' },
  { table: 'onboarding_turns', kind: 'via_parent', parent: 'onboarding_sessions', parentKey: 'id', localKey: 'session_id' },
  { table: 'payout_history', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'portfolio_charities', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'portfolio_members', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'portfolio_recommendations', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'portfolio_risk_snapshots', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'portfolio_settings', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'profiles', kind: 'via_parent', parent: 'organization_members', parentKey: 'user_id', localKey: 'id' },
  { table: 'qualifying_distributions', kind: 'via_parent', parent: 'grants', parentKey: 'id', localKey: 'grant_id' },
  { table: 'recommendation_comments', kind: 'via_parent', parent: 'portfolio_recommendations', parentKey: 'id', localKey: 'recommendation_id' },
  { table: 'recommendation_favorites', kind: 'via_parent', parent: 'portfolio_recommendations', parentKey: 'id', localKey: 'recommendation_id' },
  { table: 'recommendation_status_history', kind: 'via_parent', parent: 'portfolio_recommendations', parentKey: 'id', localKey: 'recommendation_id' },
  { table: 'report_schedules', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'report_templates', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'staging_metric_facts', kind: 'via_parent', parent: 'import_jobs', parentKey: 'id', localKey: 'import_job_id' },
  { table: 'widgets', kind: 'via_parent', parent: 'portfolios', parentKey: 'id', localKey: 'portfolio_id' },
  { table: 'workflow_tasks', kind: 'via_parent', parent: 'tasks', parentKey: 'id', localKey: 'task_id' },

  // --- reference: platform data, identical on every instance ---
  { table: 'benchmark_data', kind: 'reference', reason: 'platform benchmark set used for comparison' },
  { table: 'charities', kind: 'reference', reason: 'platform charity registry, identical on every instance' },
  { table: 'investees', kind: 'reference', reason: 'shared investee directory keyed by EIN, not org-scoped' },
  { table: 'metrics', kind: 'reference', reason: 'platform metric definitions (code, unit, description)' },
  { table: 'module_definitions', kind: 'reference', reason: 'platform module catalogue' },
  { table: 'module_presets', kind: 'reference', reason: 'platform module bundles offered at provisioning' },
  { table: 'org_type_defaults', kind: 'reference', reason: 'platform defaults applied when provisioning an org' },

  // --- platform: instance state, not tenant data ---
  { table: 'applied_migrations', kind: 'platform', reason: 'instance migration ledger; carried in the manifest instead' },
  { table: 'charity_rating_cache', kind: 'platform', reason: 'derived cache, rebuildable from the rating providers' },
  { table: 'geocode_cache', kind: 'platform', reason: 'derived cache, rebuildable from the geocoding provider' },
];

/** The tables an export actually reads. */
export function exportableTables() {
  return EXPORT_TABLES.filter(
    (rule): rule is Extract<TableExportRule, { kind: 'org_scoped' | 'via_parent' }> =>
      rule.kind === 'org_scoped' || rule.kind === 'via_parent',
  );
}

export function ruleFor(table: string): TableExportRule | undefined {
  return EXPORT_TABLES.find(rule => rule.table === table);
}
