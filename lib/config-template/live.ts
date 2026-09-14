import type { Tx } from '@/lib/org-import/connection';
import type { ConfigTemplate } from '@/lib/config-template/types';

export type ReadConfigInput = {
  orgId: string;
  portfolioId?: string;
  /** Metadata is intentionally excluded from canonical semantic comparison. */
  metadata?: ConfigTemplate['metadata'];
};

type OrganizationRow = { name: string; modules: Record<string, unknown> | null };
type LedgerRow = { version: string; checksum: string };

function textNumeric(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

async function assertPortfolioInOrg(tx: Tx, orgId: string, portfolioId: string): Promise<void> {
  const { rows } = await tx.query<{ id: string }>(
    'SELECT id FROM public.portfolios WHERE id = $1 AND org_id = $2', [portfolioId, orgId]);
  if (rows.length === 0) {
    throw new Error(`Portfolio ${portfolioId} does not belong to organization ${orgId}.`);
  }
}

/**
 * Reads only the semantic columns that can be carried between organizations.
 * This is intentionally explicit rather than a generated SELECT * projection.
 */
export async function readLiveConfig(tx: Tx, input: ReadConfigInput): Promise<ConfigTemplate> {
  const { orgId, portfolioId } = input;
  const { rows: organizations } = await tx.query<OrganizationRow>(
    'SELECT name, modules FROM public.organizations WHERE id = $1', [orgId]);
  const organization = organizations[0];
  if (!organization) throw new Error(`Organization ${orgId} does not exist.`);
  if (portfolioId) await assertPortfolioInOrg(tx, orgId, portfolioId);

  // `Tx` wraps one pg.Client. Querying it concurrently is deprecated today and
  // will be an error in pg 9, so this deliberately serializes the snapshot.
  const ledger = await tx.query<LedgerRow>('SELECT version, checksum FROM public.applied_migrations ORDER BY version');
  const kpis = await tx.query<ConfigTemplate['kpis'][number]>(
    `SELECT name, slug, description, unit, aggregation, direction,
            target_value::text, baseline_value::text, is_active, display_order
     FROM public.kpi_definitions WHERE org_id = $1`, [orgId]);
  const customFields = await tx.query<ConfigTemplate['customFields'][number]>(
    `SELECT entity_type, field_key, field_label, field_type, enum_options,
            required_at_stage, is_ai_readable, sort_order
     FROM public.org_custom_field_definitions WHERE org_id = $1`, [orgId]);
  const views = await tx.query<ConfigTemplate['views'][number]>(
    `SELECT config_scope, scope_key, config_value
     FROM public.org_view_config WHERE org_id = $1`, [orgId]);
  const workflowConfig = await tx.query<ConfigTemplate['workflowConfig'][number]>(
    `SELECT module, config_type, stage_key, config_key, config_value, sort_order
     FROM public.org_workflow_config WHERE org_id = $1`, [orgId]);
  const automationRules = await tx.query<ConfigTemplate['automationRules'][number]>(
    `SELECT name, is_active, trigger_type, trigger_config, conditions, action_type, action_config
     FROM public.org_automation_rules WHERE org_id = $1`, [orgId]);
  const workflowTemplates = await tx.query<ConfigTemplate['workflowTemplates'][number]>(
    `SELECT name, workflow_type, description, is_active, steps
     FROM public.workflow_templates WHERE org_id = $1`, [orgId]);
  const widgets = portfolioId
    ? await tx.query<ConfigTemplate['widgets'][number]>(
      `SELECT type, title, config, position
       FROM public.widgets WHERE portfolio_id = $1`, [portfolioId])
    : { rows: [] as ConfigTemplate['widgets'], rowCount: 0 };
  const reportTemplates = portfolioId
    ? await tx.query<ConfigTemplate['reportTemplates'][number]>(
      `SELECT name, description, scope, config, is_default
       FROM public.report_templates WHERE portfolio_id = $1`, [portfolioId])
    : { rows: [] as ConfigTemplate['reportTemplates'], rowCount: 0 };

  const modules = Object.entries(organization.modules ?? {})
    .filter(([, enabled]) => enabled === true)
    .map(([slug]) => slug);

  return {
    formatVersion: 1,
    metadata: input.metadata ?? {
      exportedAt: new Date().toISOString(),
      sourceOrgName: organization.name,
    },
    schema: { ledger: ledger.rows.map(row => ({ version: row.version, checksum: row.checksum })) },
    modules,
    kpis: kpis.rows.map(row => ({ ...row, target_value: textNumeric(row.target_value), baseline_value: textNumeric(row.baseline_value) })),
    customFields: customFields.rows,
    views: views.rows,
    widgets: widgets.rows,
    reportTemplates: reportTemplates.rows,
    workflowConfig: workflowConfig.rows,
    automationRules: automationRules.rows,
    workflowTemplates: workflowTemplates.rows,
  };
}
