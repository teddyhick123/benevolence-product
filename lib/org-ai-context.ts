import type { SupabaseClient } from '@/lib/database-client';

export const ORG_AI_CONTEXT_TYPES = ['operating_norm', 'naming_convention', 'process_rule', 'preference'] as const;
export const ORG_AI_CONTEXT_SOURCES = ['builder_chat', 'onboarding', 'ai_suggestion'] as const;
export const ORG_AI_CONTEXT_KEY_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;

export type OrgAiContextType = typeof ORG_AI_CONTEXT_TYPES[number];
export type OrgAiContextSource = typeof ORG_AI_CONTEXT_SOURCES[number];

export interface OrgAiContextRecord {
  id: string;
  org_id: string;
  context_type: OrgAiContextType;
  context_key: string;
  context_value: string;
  source: OrgAiContextSource;
  is_active: boolean;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

export function normalizeContextKey(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 80);
  return /^[a-z]/.test(key) ? key : `context_${key}`.slice(0, 80);
}

export async function loadOrgAiContext(
  db: SupabaseClient,
  orgId: string,
  options: { activeOnly?: boolean } = {}
): Promise<OrgAiContextRecord[]> {
  let query = db
    .from('org_ai_context')
    .select('id, org_id, context_type, context_key, context_value, source, is_active, created_by, created_at, updated_at')
    .eq('org_id', orgId)
    .order('context_type')
    .order('context_key');

  if (options.activeOnly !== false) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load org AI context: ${error.message}`);
  return (data ?? []) as OrgAiContextRecord[];
}

export function formatOrgAiContextForPrompt(records: OrgAiContextRecord[]): string {
  const active = records.filter(record => record.is_active);
  if (active.length === 0) return '';

  const labels: Record<OrgAiContextType, string> = {
    operating_norm: 'Operating Norms',
    naming_convention: 'Naming Conventions',
    process_rule: 'Process Rules',
    preference: 'Preferences',
  };

  const byType = new Map<OrgAiContextType, OrgAiContextRecord[]>();
  for (const record of active) {
    if (!byType.has(record.context_type)) byType.set(record.context_type, []);
    byType.get(record.context_type)!.push(record);
  }

  const sections: string[] = [];
  for (const type of ORG_AI_CONTEXT_TYPES) {
    const rows = byType.get(type) ?? [];
    if (rows.length === 0) continue;
    sections.push(`${labels[type]}:\n${rows.map(row => `- ${row.context_value}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
