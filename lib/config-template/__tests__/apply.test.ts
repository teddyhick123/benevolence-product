// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyConfig,
  parseConfigTemplate,
  readLiveConfig,
} from '@/lib/config-template';
import { withTransaction } from '@/lib/org-import/connection';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

type Fixture = { tx: Parameters<typeof applyConfig>[0]; actorId: string; orgId: string; portfolioId: string };

async function inSeededTarget<T>(callback: (_fixture: Fixture) => Promise<T>): Promise<T> {
  return withTransaction(async tx => {
    const actorId = randomUUID();
    const orgId = randomUUID();
    const portfolioId = randomUUID();
    await tx.query(
      `INSERT INTO auth.users (
         id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       ) VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         $2, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`, [actorId, `config-template-${actorId}@example.test`]);
    await tx.query(
      `INSERT INTO public.organizations (id, name, org_type, modules)
       VALUES ($1, 'Target Foundation', 'private_foundation', '{"portfolio": true}'::jsonb)`, [orgId]);
    await tx.query(
      `INSERT INTO public.organization_members (org_id, user_id, role, accepted_at)
       VALUES ($1, $2, 'admin', now())`, [orgId, actorId]);
    await tx.query(
      `INSERT INTO public.portfolios (id, org_id, owner_id, name)
       VALUES ($1, $2, $3, 'Target Portfolio')`, [portfolioId, orgId, actorId]);
    await tx.query(
      `INSERT INTO public.kpi_definitions
       (org_id, name, slug, aggregation, direction, is_active, display_order)
       VALUES ($1, 'Local only', 'local_only', 'sum', 'higher_is_better', true, 9)`, [orgId]);
    return callback({ tx, actorId, orgId, portfolioId });
  });
}

function template(ledger: { version: string; checksum: string }[]) {
  return parseConfigTemplate(JSON.stringify({
    formatVersion: 1,
    metadata: { exportedAt: '2026-09-13T00:00:00.000Z', sourceOrgName: 'Ford Foundation' },
    schema: { ledger },
    modules: ['portfolio', 'reports'],
    kpis: [{
      name: 'People reached', slug: 'people_reached', description: null, unit: 'people',
      aggregation: 'sum', direction: 'higher_is_better', target_value: '1000.00',
      baseline_value: null, is_active: true, display_order: 1,
    }],
    customFields: [],
    views: [{ config_scope: 'dashboard', scope_key: 'main', config_value: { greeting: 'Welcome' } }],
    widgets: [{ type: 'kpi', title: 'Reach', position: 1, config: { metric_code: 'people_reached' } }],
    reportTemplates: [{ name: 'Board report', description: null, scope: 'portfolio', config: {}, is_default: true }],
    workflowConfig: [{
      module: 'grant_management', config_type: 'stage_label', stage_key: 'draft', config_key: 'label',
      config_value: { label: 'Draft' }, sort_order: 1,
    }],
    automationRules: [{
      name: 'Draft reminder', is_active: true, trigger_type: 'grant_stage_change',
      trigger_config: { stage: 'draft' }, conditions: [], action_type: 'create_task',
      action_config: { title_template: 'Review draft' },
    }],
    workflowTemplates: [{
      name: 'Grant review', workflow_type: 'grant', description: null, is_active: true,
      steps: [{ order: 1, title: 'Review' }],
    }],
  }));
}

describe('applyConfig', () => {
  it('atomically applies a portable template, preserves extras, and writes an audit record', async () => {
    await inSeededTarget(async ({ tx, actorId, orgId, portfolioId }) => {
      const live = await readLiveConfig(tx, { orgId, portfolioId });
      const report = await applyConfig(tx, {
        orgId, actorId, portfolioId, template: template(live.schema.ledger),
      });

      expect(report.create).toEqual(expect.arrayContaining([
        { section: 'modules', key: 'reports', status: 'create' },
        { section: 'kpis', key: 'people_reached', status: 'create' },
        { section: 'widgets', key: '1', status: 'create' },
        { section: 'automationRules', key: 'Draft reminder', status: 'create' },
      ]));
      expect(report.extra).toContainEqual({ section: 'kpis', key: 'local_only', status: 'extra' });

      const { rows: result } = await tx.query<{
        modules: Record<string, unknown>; kpis: string[]; widgets: number; reports: number; audits: number;
      }>(
        `SELECT
           (SELECT modules FROM public.organizations WHERE id = $1) AS modules,
           (SELECT array_agg(slug ORDER BY slug) FROM public.kpi_definitions WHERE org_id = $1) AS kpis,
           (SELECT count(*)::int FROM public.widgets WHERE portfolio_id = $2) AS widgets,
           (SELECT count(*)::int FROM public.report_templates WHERE portfolio_id = $2) AS reports,
           (SELECT count(*)::int FROM public.org_audit_log WHERE org_id = $1 AND action = 'configuration_template_applied') AS audits`,
        [orgId, portfolioId],
      );
      expect(result[0]).toMatchObject({
        modules: expect.objectContaining({ portfolio: true, reports: true }),
        kpis: ['local_only', 'people_reached'], widgets: 1, reports: 1, audits: 1,
      });

      const again = await applyConfig(tx, {
        orgId, actorId, portfolioId, template: template(live.schema.ledger),
      });
      expect(again.create).toEqual([]);
      expect(again.update).toEqual([]);
      expect(again.same).toEqual(expect.arrayContaining([
        { section: 'kpis', key: 'people_reached', status: 'same' },
        { section: 'widgets', key: '1', status: 'same' },
      ]));
    });
  });

  it('refuses a non-admin actor before it writes', async () => {
    await inSeededTarget(async ({ tx, orgId, portfolioId }) => {
      const live = await readLiveConfig(tx, { orgId, portfolioId });
      await expect(applyConfig(tx, {
        orgId,
        actorId: randomUUID(),
        portfolioId,
        template: template(live.schema.ledger),
      })).rejects.toThrow(/owner or admin/);
      const { rows } = await tx.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM public.kpi_definitions WHERE org_id = $1', [orgId]);
      expect(rows[0].count).toBe('1');
    });
  });

  it('refuses a missing target reference before any upsert or audit write', async () => {
    await inSeededTarget(async ({ tx, actorId, orgId, portfolioId }) => {
      const live = await readLiveConfig(tx, { orgId, portfolioId });
      const invalid = template(live.schema.ledger);
      invalid.widgets[0].config.metric_code = 'missing_metric';
      await expect(applyConfig(tx, { orgId, actorId, portfolioId, template: invalid }))
        .rejects.toThrow(/missing_metric/);
      const { rows } = await tx.query<{ kpis: string; audits: string }>(
        `SELECT
           (SELECT count(*)::text FROM public.kpi_definitions WHERE org_id = $1) AS kpis,
           (SELECT count(*)::text FROM public.org_audit_log WHERE org_id = $1) AS audits`,
        [orgId],
      );
      expect(rows[0]).toEqual({ kpis: '1', audits: '0' });
    });
  });
});
