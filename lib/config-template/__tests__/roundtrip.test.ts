// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyConfig,
  canonicalTemplateJson,
  readLiveConfig,
  templateSha256,
} from '@/lib/config-template';
import { withTransaction, type Tx } from '@/lib/org-import/connection';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

type Foundation = { orgId: string; actorId: string; portfolioId: string };

async function createFoundation(tx: Tx, name: string, modules: Record<string, boolean>): Promise<Foundation> {
  const orgId = randomUUID();
  const actorId = randomUUID();
  const portfolioId = randomUUID();
  await tx.query(
    `INSERT INTO auth.users (
       id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       $2, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [actorId, `roundtrip-${actorId}@example.test`],
  );
  await tx.query(
    `INSERT INTO public.organizations (id, name, org_type, modules)
     VALUES ($1, $2, 'private_foundation', $3::jsonb)`, [orgId, name, JSON.stringify(modules)],
  );
  await tx.query(
    `INSERT INTO public.organization_members (org_id, user_id, role, accepted_at)
     VALUES ($1, $2, 'admin', now())`, [orgId, actorId],
  );
  await tx.query(
    `INSERT INTO public.portfolios (id, org_id, owner_id, name)
     VALUES ($1, $2, $3, 'Main portfolio')`, [portfolioId, orgId, actorId],
  );
  return { orgId, actorId, portfolioId };
}

async function seedAllSections(tx: Tx, source: Foundation): Promise<void> {
  await tx.query(
    `INSERT INTO public.kpi_definitions
       (org_id, name, slug, description, unit, aggregation, direction, target_value, baseline_value, is_active, display_order)
     VALUES ($1, 'People reached', 'people_reached', 'A durable KPI', 'people', 'sum', 'higher_is_better', 1000, 100, true, 1)`,
    [source.orgId],
  );
  await tx.query(
    `INSERT INTO public.org_custom_field_definitions
       (org_id, entity_type, field_key, field_label, field_type, enum_options, required_at_stage, is_ai_readable, sort_order)
     VALUES ($1, 'grant', 'program_area', 'Program area', 'enum', '["Climate", "Health"]'::jsonb, NULL, true, 1)`,
    [source.orgId],
  );
  await tx.query(
    `INSERT INTO public.org_view_config (org_id, config_scope, scope_key, config_value)
     VALUES ($1, 'dashboard', 'main', '{"welcome":"Impact overview"}'::jsonb)`, [source.orgId]);
  await tx.query(
    `INSERT INTO public.widgets (portfolio_id, type, title, config, position)
     VALUES ($1, 'kpi', 'People reached', '{"metric_code":"people_reached"}'::jsonb, 1)`, [source.portfolioId]);
  await tx.query(
    `INSERT INTO public.report_templates (portfolio_id, created_by, name, description, scope, config, is_default)
     VALUES ($1, $2, 'Board report', 'Quarterly board report', 'portfolio', '{"sections":["summary"]}'::jsonb, true)`,
    [source.portfolioId, source.actorId],
  );
  await tx.query(
    `INSERT INTO public.org_workflow_config
       (org_id, module, config_type, stage_key, config_key, config_value, sort_order)
     VALUES ($1, 'grant_management', 'stage_label', 'draft', 'label', '{"label":"Draft"}'::jsonb, 1)`,
    [source.orgId],
  );
  await tx.query(
    `INSERT INTO public.org_automation_rules
       (org_id, name, is_active, trigger_type, trigger_config, conditions, action_type, action_config, created_by)
     VALUES ($1, 'Draft reminder', true, 'grant_stage_change', '{"stage":"draft"}'::jsonb, '[]'::jsonb,
       'create_task', '{"title_template":"Review draft"}'::jsonb, $2)`,
    [source.orgId, source.actorId],
  );
  await tx.query(
    `INSERT INTO public.workflow_templates (org_id, name, workflow_type, description, is_system, is_active, steps)
     VALUES ($1, 'Grant review', 'grant', 'Reusable review workflow', false, true,
       '[{"order":1,"title":"Review"}]'::jsonb)`, [source.orgId]);
}

describe('configuration template source-to-target round trip', () => {
  it('preserves every supported section across foundations and ignores export metadata', async () => {
    await withTransaction(async tx => {
      const source = await createFoundation(tx, 'Ford Source', {
        portfolio: true, reports: true, grant_management: true,
      });
      const target = await createFoundation(tx, 'Next Foundation', { portfolio: true });
      await seedAllSections(tx, source);

      const exported = await readLiveConfig(tx, { orgId: source.orgId, portfolioId: source.portfolioId });
      await applyConfig(tx, {
        orgId: target.orgId,
        actorId: target.actorId,
        portfolioId: target.portfolioId,
        template: exported,
      });
      const reexported = await readLiveConfig(tx, { orgId: target.orgId, portfolioId: target.portfolioId });

      expect(reexported.metadata.sourceOrgName).toBe('Next Foundation');
      expect(reexported.metadata.exportedAt).not.toBe(exported.metadata.exportedAt);
      expect(canonicalTemplateJson(reexported)).toBe(canonicalTemplateJson(exported));
      expect(templateSha256(reexported)).toBe(templateSha256(exported));
    });
  });
});
