// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('Phase 2 custom fields migration contract', () => {
  const sql = readFileSync('db/migrations/0050_custom_fields.sql', 'utf8');

  it('creates definition and value tables', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.org_custom_field_definitions/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.org_custom_field_values/);
  });

  it('supports the canonical entity and field types', () => {
    expect(sql).toMatch(/entity_type IN \('grant', 'holding', 'donor', 'contribution'\)/);
    expect(sql).toMatch(/field_type IN \('text', 'integer', 'decimal', 'boolean', 'date', 'enum'\)/);
  });

  it('enforces polymorphic entity ownership and typed values with trigger functions', () => {
    expect(sql).toMatch(/custom_field_entity_org/);
    expect(sql).toMatch(/validate_custom_field_value/);
    expect(sql).toMatch(/CUSTOM_FIELD_VALUE_REQUIRES_EXACTLY_ONE_TYPED_VALUE/);
    expect(sql).toMatch(/CUSTOM_FIELD_ENTITY_ORG_MISMATCH/);
    expect(sql).toMatch(/CUSTOM_FIELD_ENUM_VALUE_INVALID/);
  });

  it('uses SECURITY DEFINER for trigger-side entity checks', () => {
    expect(sql).toMatch(/FUNCTION public\.custom_field_entity_org[\s\S]*SECURITY DEFINER/);
    expect(sql).toMatch(/FUNCTION public\.validate_custom_field_value[\s\S]*SECURITY DEFINER/);
  });

  it('allows viewers to read values but requires member access to write them', () => {
    expect(sql).toMatch(
      /CREATE POLICY "org_custom_field_values_read"[\s\S]*can_view_org\(org_id\)/
    );
    expect(sql).toMatch(
      /CREATE POLICY "org_custom_field_values_write"[\s\S]*USING \(public\.org_role_gte\(org_id, 'member'\)\)[\s\S]*WITH CHECK \(public\.org_role_gte\(org_id, 'member'\)\)/
    );

    const route = readFileSync('app/api/org/[orgId]/custom-fields/values/route.ts', 'utf8');
    expect(route).toContain('canOperateOrg');
    expect(route).toContain('requireOrgMember(orgId, true)');
  });
});

describe('Phase 2 runtime surface contract', () => {
  it('adds a batch API for table/list custom-field values', () => {
    const route = readFileSync('app/api/org/[orgId]/custom-fields/batch/route.ts', 'utf8');
    expect(route).toMatch(/MAX_ENTITY_IDS = 200/);
    expect(route).toMatch(/user_org_role/);
    expect(route).toMatch(/values_by_entity/);
    expect(route).toMatch(/loadScopedEntityIds/);
  });

  it('renders custom fields on grant, holding, and donor detail pages', () => {
    expect(readFileSync('app/dashboard/grants/[grantId]/page.tsx', 'utf8')).toMatch(/CustomFieldsPanel/);
    expect(readFileSync('app/dashboard/holdings/[holdingId]/page.tsx', 'utf8')).toMatch(/entityType="holding"/);
    expect(readFileSync('app/dashboard/donors/[donorId]/page.tsx', 'utf8')).toMatch(/entityType="donor"/);
  });

  it('shows custom fields as sortable and filterable grant table columns', () => {
    const table = readFileSync('components/grants/GrantTableView.tsx', 'utf8');
    expect(table).toMatch(/custom-fields\/batch/);
    expect(table).toMatch(/customFilterField/);
    expect(table).toMatch(/handleSort\(`custom:\$\{field\.field_key\}`\)/);
    expect(table).toMatch(/customValueLabel/);
  });

  it('registers AI read and search tools for custom fields', () => {
    const defs = readFileSync('lib/ai/assistant/tool-definitions.ts', 'utf8');
    const exec = readFileSync('lib/ai/assistant/executor.ts', 'utf8');
    const registry = readFileSync('lib/modules/registry.ts', 'utf8');
    expect(defs).toMatch(/get_custom_fields/);
    expect(defs).toMatch(/search_custom_field_values/);
    expect(exec).toMatch(/case 'search_custom_field_values'/);
    expect(registry).toMatch(/search_custom_field_values/);
  });
});
