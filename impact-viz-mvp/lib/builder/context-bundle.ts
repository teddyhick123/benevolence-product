// lib/builder/context-bundle.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';

export interface OrgSnapshot {
  orgId: string;
  name: string;
  orgType: string;
  modules: Record<string, boolean>;
  branding: Record<string, string>;
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
      .select('name, org_type, modules, branding')
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

  if (orgRes.error || !orgRes.data) return null;
  const org = orgRes.data;

  return {
    orgId,
    name: org.name,
    orgType: org.org_type,
    modules: (org.modules as Record<string, boolean>) || {},
    branding: (org.branding as Record<string, string>) || {},
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

  let prompt = `You are the Benevolence Builder — an AI coding agent that helps customize this organization's Benevolence instance.

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

### Code proposal tool
Use \`submit_code_proposal\` for anything that requires new or changed source files — new components, API routes, DB migrations, modules, or visualizations. The proposal is stored for developer review; the user will see a "submitted for review" card and be notified when it's applied.

## Guidelines
- Always use a config tool when the request can be satisfied at the data layer. Only escalate to a code proposal when source files must change.
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
