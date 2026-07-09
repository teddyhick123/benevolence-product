import type { SupabaseClient } from '@supabase/supabase-js';

export const VIEW_CONFIG_SCOPES = ['dashboard', 'module_default', 'table_columns', 'entity_vocabulary'] as const;
export const ENTITY_VOCABULARY_TYPES = ['grant', 'holding', 'donor', 'contribution'] as const;
export const DASHBOARD_SECTION_IDS = ['tasks', 'summary', 'kpis', 'payout', 'holdings_widgets', 'grants', 'map'] as const;
export const GRANT_MODULE_VIEWS = ['pipeline', 'table', 'calendar', 'attention', 'workflows', 'payments', 'communications'] as const;
export const GRANTS_TABLE_COLUMNS = ['name', 'stage', 'amount', 'risk', 'custom_fields', 'period_end', 'portfolio', 'owner'] as const;

export type ViewConfigScope = typeof VIEW_CONFIG_SCOPES[number];
export type EntityVocabularyType = typeof ENTITY_VOCABULARY_TYPES[number];
export type DashboardSectionId = typeof DASHBOARD_SECTION_IDS[number];
export type GrantModuleView = typeof GRANT_MODULE_VIEWS[number];
export type GrantsTableColumn = typeof GRANTS_TABLE_COLUMNS[number] | `custom:${string}`;

export interface OrgViewConfigRow {
  id: string;
  org_id: string;
  config_scope: ViewConfigScope;
  scope_key: string;
  config_value: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface EntityVocabulary {
  singular: string;
  plural: string;
}

export const DEFAULT_ENTITY_VOCABULARY: Record<EntityVocabularyType, EntityVocabulary> = {
  grant: { singular: 'Grant', plural: 'Grants' },
  holding: { singular: 'Holding', plural: 'Holdings' },
  donor: { singular: 'Donor', plural: 'Donors' },
  contribution: { singular: 'Contribution', plural: 'Contributions' },
};

export function pluralizeLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  if (/s$/i.test(trimmed)) return trimmed;
  if (/[^aeiou]y$/i.test(trimmed)) return `${trimmed.slice(0, -1)}ies`;
  return `${trimmed}s`;
}

export function normalizeVocabulary(input: {
  singular?: unknown;
  plural?: unknown;
}, entityType: EntityVocabularyType): EntityVocabulary {
  const defaults = DEFAULT_ENTITY_VOCABULARY[entityType];
  const singular = typeof input.singular === 'string' && input.singular.trim()
    ? input.singular.trim().slice(0, 80)
    : defaults.singular;
  const plural = typeof input.plural === 'string' && input.plural.trim()
    ? input.plural.trim().slice(0, 100)
    : pluralizeLabel(singular);
  return { singular, plural };
}

export async function loadOrgViewConfig(
  db: SupabaseClient,
  orgId: string,
  options: { scope?: ViewConfigScope; scopeKey?: string } = {}
): Promise<OrgViewConfigRow[]> {
  let query = db
    .from('org_view_config')
    .select('id, org_id, config_scope, scope_key, config_value, created_at, updated_at')
    .eq('org_id', orgId)
    .order('config_scope')
    .order('scope_key');

  if (options.scope) query = query.eq('config_scope', options.scope);
  if (options.scopeKey) query = query.eq('scope_key', options.scopeKey);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load org view config: ${error.message}`);
  return (data ?? []) as OrgViewConfigRow[];
}

export async function loadEntityVocabulary(
  db: SupabaseClient,
  orgId: string
): Promise<Record<EntityVocabularyType, EntityVocabulary>> {
  const vocabulary = { ...DEFAULT_ENTITY_VOCABULARY };
  const rows = await loadOrgViewConfig(db, orgId, { scope: 'entity_vocabulary' });

  for (const row of rows) {
    const entityType = row.scope_key.replace(/^entity\./, '') as EntityVocabularyType;
    if (!ENTITY_VOCABULARY_TYPES.includes(entityType)) continue;
    vocabulary[entityType] = normalizeVocabulary(row.config_value, entityType);
  }

  return vocabulary;
}

export function resolveDashboardSections(configValue: Record<string, unknown> | null | undefined): DashboardSectionId[] {
  const requested = Array.isArray(configValue?.sections) ? configValue.sections : DASHBOARD_SECTION_IDS;
  const hidden = new Set(Array.isArray(configValue?.hidden_sections) ? configValue.hidden_sections : []);
  const seen = new Set<string>();
  const sections: DashboardSectionId[] = [];

  for (const item of requested) {
    if (!DASHBOARD_SECTION_IDS.includes(item as DashboardSectionId)) continue;
    if (hidden.has(item)) continue;
    if (seen.has(String(item))) continue;
    seen.add(String(item));
    sections.push(item as DashboardSectionId);
  }

  for (const item of DASHBOARD_SECTION_IDS) {
    if (hidden.has(item) || seen.has(item)) continue;
    sections.push(item);
  }

  return sections;
}

export function resolveGrantsTableColumns(configValue: Record<string, unknown> | null | undefined): GrantsTableColumn[] {
  const requested = Array.isArray(configValue?.columns) ? configValue.columns : GRANTS_TABLE_COLUMNS;
  const columns: GrantsTableColumn[] = [];
  const seen = new Set<string>();

  for (const item of requested) {
    if (typeof item !== 'string') continue;
    const valid = GRANTS_TABLE_COLUMNS.includes(item as any) || /^custom:[a-z][a-z0-9_]{0,63}$/.test(item);
    if (!valid || seen.has(item)) continue;
    seen.add(item);
    columns.push(item as GrantsTableColumn);
  }

  return columns.length > 0 ? columns : [...GRANTS_TABLE_COLUMNS];
}
