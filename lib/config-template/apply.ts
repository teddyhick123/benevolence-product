import { compareConfig, type ConfigComparison } from '@/lib/config-template/compare';
import { templateSha256 } from '@/lib/config-template/canonical';
import { readLiveConfig } from '@/lib/config-template/live';
import { assertNoSourceUuidReferences, assertTargetReferences } from '@/lib/config-template/references';
import type { ConfigTemplate, ConfigTemplateSection } from '@/lib/config-template/types';
import { naturalKey } from '@/lib/config-template/types';
import { checkSchemaCompatibility } from '@/lib/org-import/compatibility';
import type { Tx } from '@/lib/org-import/connection';

export type ApplyConfigInput = {
  orgId: string;
  actorId: string;
  portfolioId?: string;
  template: ConfigTemplate;
};

type ModuleDefinition = { slug: string; depends_on: string[] | null; is_core: boolean };
type OrgModules = { modules: Record<string, unknown> | null };

function rowsToApply<T>(
  section: ConfigTemplateSection,
  rows: readonly T[],
  comparison: ConfigComparison,
): T[] {
  const keys = new Set(
    [...comparison.create, ...comparison.update]
      .filter(item => item.section === section)
      .map(item => item.key),
  );
  return rows.filter(row => keys.has(naturalKey(section, row as never)));
}

async function assertAdminActor(tx: Tx, orgId: string, actorId: string): Promise<void> {
  const { rows } = await tx.query<{ role: string }>(
    `SELECT role::text AS role
     FROM public.organization_members
     WHERE org_id = $1 AND user_id = $2 AND deleted_at IS NULL
     FOR UPDATE`, [orgId, actorId]);
  if (!rows[0] || !['owner', 'admin'].includes(rows[0].role)) {
    throw new Error('Only an active organization owner or admin can apply a configuration template.');
  }
}

async function mergedModules(tx: Tx, orgId: string, wanted: string[]): Promise<Record<string, unknown>> {
  if (!wanted.includes('portfolio')) {
    throw new Error('Configuration templates must include the core portfolio module.');
  }
  const [{ rows: orgRows }, { rows: definitions }] = await Promise.all([
    tx.query<OrgModules>('SELECT modules FROM public.organizations WHERE id = $1 FOR UPDATE', [orgId]),
    tx.query<ModuleDefinition>('SELECT slug, depends_on, is_core FROM public.module_definitions'),
  ]);
  const organization = orgRows[0];
  if (!organization) throw new Error(`Organization ${orgId} does not exist.`);

  const bySlug = new Map(definitions.map(definition => [definition.slug, definition]));
  const next: Record<string, unknown> = { ...(organization.modules ?? {}) };
  for (const slug of wanted) {
    if (!bySlug.has(slug)) throw new Error(`Configuration template names unknown module "${slug}".`);
    next[slug] = true;
  }
  next.portfolio = true;

  for (const [slug, enabled] of Object.entries(next)) {
    if (enabled !== true) continue;
    const definition = bySlug.get(slug);
    if (!definition) throw new Error(`Target organization enables unknown module "${slug}".`);
    for (const dependency of definition.depends_on ?? []) {
      if (next[dependency] !== true) {
        throw new Error(`Module "${slug}" requires module "${dependency}" to be enabled.`);
      }
    }
  }
  return next;
}

async function upsertRows(tx: Tx, sql: string, rows: unknown[], params: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.query(sql, [...params, JSON.stringify(rows)]);
}

async function applyWidgets(
  tx: Tx,
  portfolioId: string,
  rows: ConfigTemplate['widgets'],
): Promise<void> {
  if (rows.length === 0) return;
  // widgets_portfolio_position_key is DEFERRABLE for reorder support and so
  // cannot be used in ON CONFLICT. The same portfolio lock used by the widget
  // RPCs makes this select/update/insert sequence serializable.
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('widgets:' || $1::text))", [portfolioId]);
  for (const widget of rows) {
    const { rows: existing } = await tx.query<{ id: string }>(
      'SELECT id FROM public.widgets WHERE portfolio_id = $1 AND position = $2 FOR UPDATE',
      [portfolioId, widget.position]);
    if (existing[0]) {
      await tx.query(
        'UPDATE public.widgets SET type = $2, title = $3, config = $4::jsonb WHERE id = $1',
        [existing[0].id, widget.type, widget.title, JSON.stringify(widget.config)],
      );
    } else {
      await tx.query(
        `INSERT INTO public.widgets (portfolio_id, type, title, config, position)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [portfolioId, widget.type, widget.title, JSON.stringify(widget.config), widget.position],
      );
    }
  }
}

/**
 * Applies exactly the create/update portion of a template. The caller owns the
 * transaction, so a failed validation, upsert, widget write, or audit insert
 * leaves no partial configuration behind.
 */
export async function applyConfig(tx: Tx, input: ApplyConfigInput): Promise<ConfigComparison> {
  const { orgId, actorId, portfolioId, template } = input;
  if ((template.widgets.length > 0 || template.reportTemplates.length > 0) && !portfolioId) {
    throw new Error('This template contains portfolio-scoped widgets or report templates; pass --portfolio.');
  }
  assertNoSourceUuidReferences(template);
  await assertAdminActor(tx, orgId, actorId);

  const live = await readLiveConfig(tx, { orgId, portfolioId });
  const compatibility = checkSchemaCompatibility(template.schema.ledger, live.schema.ledger);
  if (!compatibility.ok) throw new Error(compatibility.reason);

  assertTargetReferences(template, live);
  const comparison = compareConfig(template, live);
  const modules = await mergedModules(tx, orgId, template.modules);
  const hasModuleChanges = comparison.create.some(item => item.section === 'modules');
  if (hasModuleChanges) {
    await tx.query('UPDATE public.organizations SET modules = $2::jsonb WHERE id = $1', [orgId, JSON.stringify(modules)]);
  }

  await upsertRows(tx,
    `INSERT INTO public.kpi_definitions
       (org_id, name, slug, description, unit, aggregation, direction, target_value, baseline_value, is_active, display_order)
     SELECT $1, r.name, r.slug, r.description, r.unit, r.aggregation, r.direction,
            r.target_value::numeric, r.baseline_value::numeric, r.is_active, r.display_order
     FROM jsonb_to_recordset($2::jsonb) AS r(
       name text, slug text, description text, unit text, aggregation text, direction text,
       target_value text, baseline_value text, is_active boolean, display_order integer
     )
     ON CONFLICT (org_id, slug) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, unit = EXCLUDED.unit,
       aggregation = EXCLUDED.aggregation, direction = EXCLUDED.direction,
       target_value = EXCLUDED.target_value, baseline_value = EXCLUDED.baseline_value,
       is_active = EXCLUDED.is_active, display_order = EXCLUDED.display_order`,
    rowsToApply('kpis', template.kpis, comparison), [orgId]);

  await upsertRows(tx,
    `INSERT INTO public.org_custom_field_definitions
       (org_id, entity_type, field_key, field_label, field_type, enum_options, required_at_stage, is_ai_readable, sort_order)
     SELECT $1, r.entity_type, r.field_key, r.field_label, r.field_type, r.enum_options,
            r.required_at_stage, r.is_ai_readable, r.sort_order
     FROM jsonb_to_recordset($2::jsonb) AS r(
       entity_type text, field_key text, field_label text, field_type text, enum_options jsonb,
       required_at_stage text, is_ai_readable boolean, sort_order integer
     )
     ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
       field_label = EXCLUDED.field_label, field_type = EXCLUDED.field_type,
       enum_options = EXCLUDED.enum_options, required_at_stage = EXCLUDED.required_at_stage,
       is_ai_readable = EXCLUDED.is_ai_readable, sort_order = EXCLUDED.sort_order`,
    rowsToApply('customFields', template.customFields, comparison), [orgId]);

  await upsertRows(tx,
    `INSERT INTO public.org_view_config (org_id, config_scope, scope_key, config_value)
     SELECT $1, r.config_scope, r.scope_key, r.config_value
     FROM jsonb_to_recordset($2::jsonb) AS r(config_scope text, scope_key text, config_value jsonb)
     ON CONFLICT (org_id, config_scope, scope_key) DO UPDATE SET config_value = EXCLUDED.config_value`,
    rowsToApply('views', template.views, comparison), [orgId]);

  await upsertRows(tx,
    `INSERT INTO public.org_workflow_config
       (org_id, module, config_type, stage_key, config_key, config_value, sort_order)
     SELECT $1, r.module, r.config_type, r.stage_key, r.config_key, r.config_value, r.sort_order
     FROM jsonb_to_recordset($2::jsonb) AS r(
       module text, config_type text, stage_key text, config_key text, config_value jsonb, sort_order integer
     )
     ON CONFLICT (org_id, module, config_type, stage_key, config_key) DO UPDATE SET
       config_value = EXCLUDED.config_value, sort_order = EXCLUDED.sort_order`,
    rowsToApply('workflowConfig', template.workflowConfig, comparison), [orgId]);

  await upsertRows(tx,
    `INSERT INTO public.org_automation_rules
       (org_id, name, is_active, trigger_type, trigger_config, conditions, action_type, action_config, created_by)
     SELECT $1, r.name, r.is_active, r.trigger_type, r.trigger_config, r.conditions,
            r.action_type, r.action_config, $2::uuid
     FROM jsonb_to_recordset($3::jsonb) AS r(
       name text, is_active boolean, trigger_type text, trigger_config jsonb, conditions jsonb,
       action_type text, action_config jsonb
     )
     ON CONFLICT (org_id, name) DO UPDATE SET
       is_active = EXCLUDED.is_active, trigger_type = EXCLUDED.trigger_type,
       trigger_config = EXCLUDED.trigger_config, conditions = EXCLUDED.conditions,
       action_type = EXCLUDED.action_type, action_config = EXCLUDED.action_config`,
    rowsToApply('automationRules', template.automationRules, comparison), [orgId, actorId]);

  await upsertRows(tx,
    `INSERT INTO public.workflow_templates (org_id, name, workflow_type, description, is_system, is_active, steps)
     SELECT $1, r.name, r.workflow_type, r.description, false, r.is_active, r.steps
     FROM jsonb_to_recordset($2::jsonb) AS r(
       name text, workflow_type text, description text, is_active boolean, steps jsonb
     )
     ON CONFLICT (org_id, name) DO UPDATE SET
       workflow_type = EXCLUDED.workflow_type, description = EXCLUDED.description,
       is_active = EXCLUDED.is_active, steps = EXCLUDED.steps`,
    rowsToApply('workflowTemplates', template.workflowTemplates, comparison), [orgId]);

  if (portfolioId) {
    await upsertRows(tx,
      `INSERT INTO public.report_templates
         (portfolio_id, created_by, name, description, scope, config, is_default)
       SELECT $1, $2::uuid, r.name, r.description, r.scope, r.config, r.is_default
       FROM jsonb_to_recordset($3::jsonb) AS r(
         name text, description text, scope text, config jsonb, is_default boolean
       )
       ON CONFLICT (portfolio_id, name) DO UPDATE SET
         description = EXCLUDED.description, scope = EXCLUDED.scope,
         config = EXCLUDED.config, is_default = EXCLUDED.is_default`,
      rowsToApply('reportTemplates', template.reportTemplates, comparison), [portfolioId, actorId]);
    await applyWidgets(tx, portfolioId, rowsToApply('widgets', template.widgets, comparison));
  }

  await tx.query(
    `INSERT INTO public.org_audit_log (org_id, actor_id, actor_subject_id, action, metadata)
     VALUES ($1, $2, $2, 'configuration_template_applied', $3::jsonb)`,
    [orgId, actorId, JSON.stringify({
      template_sha256: templateSha256(template),
      source_org_name: template.metadata.sourceOrgName,
      create: comparison.create,
      update: comparison.update,
      same: comparison.same,
      extra: comparison.extra,
    })],
  );
  return comparison;
}
