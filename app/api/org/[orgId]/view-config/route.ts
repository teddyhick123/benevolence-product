import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  DASHBOARD_SECTION_IDS,
  ENTITY_VOCABULARY_TYPES,
  GRANT_MODULE_VIEWS,
  GRANTS_TABLE_COLUMNS,
  VIEW_CONFIG_SCOPES,
  loadEntityVocabulary,
  loadOrgViewConfig,
  normalizeVocabulary,
  type ViewConfigScope,
} from '@/lib/view-config';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const writeSchema = z.discriminatedUnion('config_scope', [
  z.object({
    config_scope: z.literal('dashboard'),
    scope_key: z.literal('main'),
    config_value: z.object({
      sections: z.array(z.enum(DASHBOARD_SECTION_IDS)).min(1).max(DASHBOARD_SECTION_IDS.length),
      hidden_sections: z.array(z.enum(DASHBOARD_SECTION_IDS)).max(DASHBOARD_SECTION_IDS.length).default([]),
    }).strict(),
  }).strict(),
  z.object({
    config_scope: z.literal('module_default'),
    scope_key: z.literal('grant_module'),
    config_value: z.object({
      default_view: z.enum(GRANT_MODULE_VIEWS),
    }).strict(),
  }).strict(),
  z.object({
    config_scope: z.literal('table_columns'),
    scope_key: z.literal('grants_table'),
    config_value: z.object({
      columns: z.array(z.string()).min(1).max(40),
    }).strict(),
  }).strict(),
  z.object({
    config_scope: z.literal('entity_vocabulary'),
    scope_key: z.enum(ENTITY_VOCABULARY_TYPES.map((entity) => `entity.${entity}`) as [string, ...string[]]),
    config_value: z.object({
      singular: z.string().trim().min(1).max(80),
      plural: z.string().trim().max(100).optional(),
    }).strict(),
  }).strict(),
]);

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;

    const scopeParam = req.nextUrl.searchParams.get('scope');
    const scopeKey = req.nextUrl.searchParams.get('scope_key') ?? undefined;
    const includeVocabulary = req.nextUrl.searchParams.get('include_vocabulary') === 'true';

    const scope = scopeParam && VIEW_CONFIG_SCOPES.includes(scopeParam as ViewConfigScope)
      ? scopeParam as ViewConfigScope
      : undefined;
    if (scopeParam && !scope) {
      return jsonError(`scope must be one of: ${VIEW_CONFIG_SCOPES.join(', ')}`, 400);
    }

    const db = access.context.db;
    const [configs, vocabulary] = await Promise.all([
      loadOrgViewConfig(db, orgId, { scope, scopeKey }),
      includeVocabulary ? loadEntityVocabulary(db, orgId) : Promise.resolve(null),
    ]);

    return jsonOk({ configs, vocabulary });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;

    const body = await req.json().catch(() => ({}));
    const parsed = writeSchema.safeParse(body);
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });

    const input = parsed.data;
    let configValue: Record<string, unknown> = input.config_value;

    if (input.config_scope === 'dashboard') {
      const sections = [...new Set(input.config_value.sections)];
      const hiddenSections = [...new Set(input.config_value.hidden_sections)];
      if (sections.every((section) => hiddenSections.includes(section))) {
        return jsonError('At least one dashboard section must remain visible', 400);
      }
      configValue = { sections, hidden_sections: hiddenSections };
    }

    if (input.config_scope === 'table_columns') {
      const columns = [...new Set(input.config_value.columns)];
      const valid = columns.every((column) => GRANTS_TABLE_COLUMNS.includes(column as any) || /^custom:[a-z][a-z0-9_]{0,63}$/.test(column));
      if (!valid) return jsonError('Invalid grants table column', 400);
      configValue = { columns };
    }

    if (input.config_scope === 'entity_vocabulary') {
      const entityType = input.scope_key.replace('entity.', '') as typeof ENTITY_VOCABULARY_TYPES[number];
      configValue = { ...normalizeVocabulary(input.config_value, entityType) };
    }

    const { data, error } = await access.context.db
      .from('org_view_config')
      .upsert({
        org_id: orgId,
        config_scope: input.config_scope,
        scope_key: input.scope_key,
        config_value: configValue,
      }, { onConflict: 'org_id,config_scope,scope_key' })
      .select('id, org_id, config_scope, scope_key, config_value, created_at, updated_at')
      .single();

    if (error) throw error;
    return jsonOk({ data });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
