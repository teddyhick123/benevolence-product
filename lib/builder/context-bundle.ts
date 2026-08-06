// lib/builder/context-bundle.ts
import type { SupabaseClient } from '@/lib/database-client';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';
import { branding } from '@/lib/config';

export interface OrgSnapshot {
  orgId: string;
  name: string;
  orgType: string;
  modules: Record<string, boolean>;
  branding: Record<string, string>;
  aiInstructions: string | null;
  teamCount: number;
  portfolioCount: number;
  metricCount: number;
}

export async function fetchOrgSnapshot(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgSnapshot | null> {
  const [orgRes, teamRes, portfolioRes, metricsRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, org_type, modules, branding, ai_instructions')
      .eq('id', orgId)
      .single(),
    supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('portfolios')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('kpi_definitions')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('is_active', true),
  ]);

  if (teamRes.error) console.warn('[Builder] teamCount query failed:', teamRes.error.message);
  if (portfolioRes.error) console.warn('[Builder] portfolioCount query failed:', portfolioRes.error.message);
  if (metricsRes.error) console.warn('[Builder] metricCount query failed:', metricsRes.error.message);

  if (orgRes.error || !orgRes.data) return null;
  const org = orgRes.data;

  return {
    orgId,
    name: org.name,
    orgType: org.org_type,
    modules: (org.modules as Record<string, boolean>) || {},
    branding: (org.branding as Record<string, string>) || {},
    aiInstructions: (org.ai_instructions as string | null) ?? null,
    teamCount: teamRes.count ?? 0,
    portfolioCount: portfolioRes.count ?? 0,
    metricCount: metricsRes.count ?? 0,
  };
}

export function buildSystemPrompt(snapshot: OrgSnapshot, indexAvailable: boolean): string {
  const activeModules = Object.entries(snapshot.modules)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ') || 'none';

  let prompt = `You are the ${branding.appName} Builder — a foundation workspace configuration assistant.

## Organization Context
Name: ${snapshot.name}
Type: ${snapshot.orgType}
Active modules: ${activeModules}
Team members: ${snapshot.teamCount}
Portfolios: ${snapshot.portfolioCount}
Active KPI definitions: ${snapshot.metricCount}
Current branding: ${JSON.stringify(snapshot.branding)}

## Your Capabilities

You have two categories of tools:

### Config tools (immediate effect)
Use these for changes that can be made at the data layer without modifying source code:
- \`update_org_branding\` — change logo URL or brand color stored in the organizations table
- \`create_metric_definition\` — add a new KPI definition for this org
- \`update_module_config\` — enable or disable feature modules
- Workflow, custom field, automation, AI context, view/vocabulary, report-template, history, and summary tools — use these as the self-service control panel for org configuration

### Implementation proposal tool
Use \`submit_code_proposal\` only when a request requires source-code changes — new components, API routes, DB migrations, modules, or visualizations. The proposal is routed to an implementation reviewer; it is not self-service app generation.

## Guidelines
- Always use a config tool when the request can be satisfied at the data layer. Only escalate to an implementation proposal when source files must change.
- When proposing code, include complete file contents (not partial snippets) and a unified diff.
- Be specific about which files are affected and why.
- If a request is ambiguous, ask a clarifying question before using any tool.
`;

  if (indexAvailable) {
    try {
      const index = getCodebaseIndex();
      prompt += '\n' + formatIndexForPrompt(index);
    } catch {
      prompt += '\n(Codebase index unavailable — proceed without file-level context.)';
    }
  } else {
    prompt += '\n(Codebase index unavailable — proceed without file-level context.)';
  }

  return prompt;
}
