// lib/builder/tools.ts
import { SupabaseClient } from '@supabase/supabase-js';
import type { ToolDefinition } from '@/lib/ai/types';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import { buildScaffoldContext, formatScaffoldContextForPrompt } from './scaffold-context';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';
import { branding } from '@/lib/config';
import type { ModuleId } from '@/lib/modules/types';
import { MODULE_REGISTRY, canDisableModule } from '@/lib/modules/registry';
import { getOrgEnabledModules, enableModule, disableModule } from '@/lib/modules/tool-filter';

const MUTABLE_MODULE_IDS: readonly ModuleId[] = [
  'impact_tracking', 'reporting', 'tax_optimization', 'grant_management',
  'donor_management', 'pledge_tracking', 'external_data', 'analytics',
  'compliance_regulatory',
] as const;

// ─── Tool definitions ────────────────────────────────────────────────────────

export const BUILDER_TOOLS: ToolDefinition[] = [
  {
    name: 'update_org_branding',
    description: 'Update the organization branding: logo URL, primary brand color, and/or org display name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'New organization display name' },
        logo_url: { type: 'string', description: 'Full URL to the org logo image' },
        primary_color: { type: 'string', description: 'Hex color code e.g. #1a2e4a' },
      },
    },
  },
  {
    name: 'update_module_config',
    description: 'Enable or disable a feature module for this organization. Use list_modules first to check current state.',
    input_schema: {
      type: 'object' as const,
      properties: {
        module: {
          type: 'string',
          enum: [...MUTABLE_MODULE_IDS],
          description: 'Canonical module ID to toggle',
        },
        enabled: { type: 'boolean', description: 'true to enable, false to disable' },
      },
      required: ['module', 'enabled'],
    },
  },
  {
    name: 'create_metric_definition',
    description: 'Create a new KPI/metric definition for this organization.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Human-readable metric name e.g. "Jobs Created"' },
        slug: { type: 'string', description: 'Machine-readable key e.g. "jobs_created" (snake_case)' },
        unit: { type: 'string', description: 'Unit label e.g. "people", "USD", "tons_co2"' },
        description: { type: 'string', description: 'Optional description of what this metric tracks' },
        aggregation: {
          type: 'string',
          enum: ['sum', 'avg', 'last', 'first'],
          description: 'How to aggregate multiple readings',
        },
        direction: {
          type: 'string',
          enum: ['higher_is_better', 'lower_is_better', 'neutral'],
          description: 'Whether higher values are desirable',
        },
      },
      required: ['name', 'slug'],
    },
  },
  {
    name: 'list_kpi_definitions',
    description: 'List all KPI definitions for this organization. Use this before creating, updating, or deleting metrics to see what already exists.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'update_metric_definition',
    description: 'Update an existing KPI definition. Use list_kpi_definitions first to get the ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID of the KPI definition to update' },
        name: { type: 'string', description: 'New human-readable name' },
        unit: { type: 'string', description: 'New unit label e.g. "people", "USD"' },
        description: { type: 'string', description: 'New description' },
        aggregation: {
          type: 'string',
          enum: ['sum', 'avg', 'last', 'first'],
          description: 'How to aggregate readings',
        },
        direction: {
          type: 'string',
          enum: ['higher_is_better', 'lower_is_better', 'neutral'],
          description: 'Whether higher values are desirable',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_metric_definition',
    description: 'Soft-delete a KPI definition (sets is_active = false). Historical metric facts are preserved. Use list_kpi_definitions first to get the ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID of the KPI definition to deactivate' },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_ai_instructions',
    description: 'Set custom instructions for the AI assistant used by this organization. These instructions are injected into every main assistant chat session for this org — use them to set tone, persona, domain focus, or vocabulary preferences.',
    input_schema: {
      type: 'object' as const,
      properties: {
        instructions: {
          type: 'string',
          description: 'The custom instructions text. Pass an empty string to clear instructions.',
        },
      },
      required: ['instructions'],
    },
  },
  {
    name: 'submit_code_proposal',
    description: 'Submit a code change proposal for developer review. Use this when source files must be created or modified.',
    input_schema: {
      type: 'object' as const,
      properties: {
        request_summary: {
          type: 'string',
          description: 'Plain-English description of what this proposal does',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path relative to project root' },
              content: { type: 'string', description: 'Complete new file content' },
              diff: { type: 'string', description: 'Unified diff showing what changed' },
            },
            required: ['path', 'content', 'diff'],
          },
          description: 'Files to create or modify',
        },
      },
      required: ['request_summary', 'files'],
    },
  },
  {
    name: 'scaffold_module',
    description: 'Generate a complete new feature module from a plain-English description. Runs a three-phase process: planning (immediate), building (async background job), and review. Returns a plan card the admin must approve before building starts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: {
          type: 'string',
          description: 'Plain-English description of the module e.g. "Add a volunteer tracking module with fields for hours logged, volunteer role, and org unit"',
        },
      },
      required: ['description'],
    },
  },
];

// ─── Tool executors ──────────────────────────────────────────────────────────

export interface ScaffoldPlanContent {
  moduleName: string;
  moduleSlug: string;
  moduleIcon: string;
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }>;
  files: Array<{ path: string; description: string }>;
  registryEntry: string;
  apiShape: string;
}

export type ToolResult =
  | { type: 'config_success'; tool: string; message: string }
  | { type: 'proposal_created'; proposalId: string; summary: string; fileCount: number }
  | { type: 'scaffold_plan_ready'; proposalId: string; planContent: ScaffoldPlanContent }
  | { type: 'error'; tool: string; message: string };

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  orgId: string,
  userId: string,
  requestText: string,
  supabase: SupabaseClient,
  adminSupabase: SupabaseClient
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'update_org_branding': {
        const patch: Record<string, string> = {};
        if (toolInput.logo_url !== undefined) patch.logo_url = toolInput.logo_url as string;
        if (toolInput.primary_color !== undefined) patch.primary_color = toolInput.primary_color as string;

        const orgPatch: Record<string, unknown> = {};
        if (toolInput.name !== undefined) orgPatch.name = toolInput.name as string;

        if (Object.keys(patch).length === 0 && Object.keys(orgPatch).length === 0) {
          return { type: 'error', tool: toolName, message: 'No fields provided. Pass logo_url, primary_color, or name.' };
        }

        const { data: org } = await supabase
          .from('organizations')
          .select('branding')
          .eq('id', orgId)
          .single();

        const merged = { ...(org?.branding ?? {}), ...patch };
        orgPatch.branding = merged;

        const { error } = await supabase
          .from('organizations')
          .update(orgPatch)
          .eq('id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };

        const parts: string[] = [];
        if (toolInput.name) parts.push(`name set to "${toolInput.name}"`);
        if (patch.logo_url) parts.push('logo updated');
        if (patch.primary_color) parts.push(`color set to ${patch.primary_color}`);
        return { type: 'config_success', tool: toolName, message: `Updated: ${parts.join(', ')}.` };
      }

      case 'update_module_config': {
        const moduleId = toolInput.module as ModuleId;
        const enabled = toolInput.enabled as boolean;

        if (!moduleId || !(MUTABLE_MODULE_IDS as readonly string[]).includes(moduleId)) {
          return { type: 'error', tool: toolName, message: `module must be one of: ${MUTABLE_MODULE_IDS.join(', ')}` };
        }
        if (typeof enabled !== 'boolean') {
          return { type: 'error', tool: toolName, message: 'enabled must be a boolean' };
        }

        const result = enabled
          ? await enableModule(adminSupabase, orgId, moduleId, userId)
          : await disableModule(adminSupabase, orgId, moduleId);

        if (!result.success) {
          return { type: 'error', tool: toolName, message: result.error ?? 'Module update failed' };
        }
        return {
          type: 'config_success',
          tool: toolName,
          message: `Module "${moduleId}" ${enabled ? 'enabled' : 'disabled'}.`,
        };
      }

      case 'create_metric_definition': {
        const { error } = await supabase.from('kpi_definitions').insert({
          org_id: orgId,
          name: toolInput.name as string,
          slug: toolInput.slug as string,
          unit: (toolInput.unit as string) || null,
          description: (toolInput.description as string) || null,
          aggregation: (toolInput.aggregation as string) || 'sum',
          direction: (toolInput.direction as string) || 'higher_is_better',
        });

        if (error) return { type: 'error', tool: toolName, message: error.message };
        return {
          type: 'config_success',
          tool: toolName,
          message: `Metric "${toolInput.name}" created successfully.`,
        };
      }

      case 'list_kpi_definitions': {
        const { data, error } = await supabase
          .from('kpi_definitions')
          .select('id, name, slug, unit, description, aggregation, direction, is_active, display_order')
          .eq('org_id', orgId)
          .order('display_order', { ascending: true });

        if (error) return { type: 'error', tool: toolName, message: error.message };

        const list = (data ?? []).map(k =>
          `[${k.id}] ${k.name} (${k.slug}) — unit: ${k.unit ?? 'none'}, ${k.is_active ? 'active' : 'inactive'}`
        ).join('\n');

        return {
          type: 'config_success',
          tool: toolName,
          message: data?.length
            ? `Found ${data.length} KPI definition(s):\n${list}`
            : 'No KPI definitions found for this org.',
        };
      }

      case 'update_metric_definition': {
        const id = toolInput.id as string;
        const patch: Record<string, unknown> = {};
        if (toolInput.name !== undefined) patch.name = toolInput.name;
        if (toolInput.unit !== undefined) patch.unit = toolInput.unit;
        if (toolInput.description !== undefined) patch.description = toolInput.description;
        if (toolInput.aggregation !== undefined) patch.aggregation = toolInput.aggregation;
        if (toolInput.direction !== undefined) patch.direction = toolInput.direction;

        if (Object.keys(patch).length === 0) {
          return { type: 'error', tool: toolName, message: 'No fields to update provided.' };
        }

        const { error } = await supabase
          .from('kpi_definitions')
          .update(patch)
          .eq('id', id)
          .eq('org_id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };
        return { type: 'config_success', tool: toolName, message: `KPI definition ${id} updated.` };
      }

      case 'delete_metric_definition': {
        const id = toolInput.id as string;
        const { error } = await supabase
          .from('kpi_definitions')
          .update({ is_active: false })
          .eq('id', id)
          .eq('org_id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };
        return {
          type: 'config_success',
          tool: toolName,
          message: `KPI definition ${id} deactivated. Historical data preserved.`,
        };
      }

      case 'set_ai_instructions': {
        const instructions = toolInput.instructions as string;
        const { error } = await supabase
          .from('organizations')
          .update({ ai_instructions: instructions || null })
          .eq('id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };

        return {
          type: 'config_success',
          tool: toolName,
          message: instructions
            ? 'AI instructions saved. They will be applied to all future assistant sessions.'
            : 'AI instructions cleared.',
        };
      }

      case 'submit_code_proposal': {
        const files = toolInput.files as Array<{ path: string; content: string; diff: string }>;
        const summary = toolInput.request_summary as string;

        const { data, error } = await adminSupabase.from('builder_proposals').insert({
          org_id: orgId,
          requested_by: userId,
          request_text: requestText,
          proposal_type: 'code',
          status: 'pending',
          generated_code: { files },
        }).select('id').single();

        if (error) return { type: 'error', tool: toolName, message: error.message };
        return {
          type: 'proposal_created',
          proposalId: data.id,
          summary,
          fileCount: files.length,
        };
      }

      case 'scaffold_module': {
        const description = toolInput.description as string;

        let indexStr = '';
        try {
          const index = getCodebaseIndex();
          indexStr = formatIndexForPrompt(index);
        } catch { /* proceed without index */ }

        const scaffoldCtx = buildScaffoldContext(indexStr);
        const contextPrompt = formatScaffoldContextForPrompt(scaffoldCtx);

        const provider = createAIProvider();
        const planningSystemPrompt = `You are a senior software engineer planning a new feature module for the ${branding.appName} platform — a white-label philanthropic portfolio management system built with Next.js 15, TypeScript, Supabase (PostgreSQL + RLS), and Tailwind CSS.${contextPrompt}`;

        const planningUserPrompt = `Admin request: "${description}"

Based on the module templates and codebase conventions above, create a detailed implementation plan.

Respond with ONLY a valid JSON object matching this exact schema (no markdown, no explanation):
{
  "moduleName": "Volunteer Tracking",
  "moduleSlug": "volunteer_tracking",
  "moduleIcon": "users",
  "tables": [
    {
      "name": "volunteer_records",
      "columns": [
        { "name": "id", "type": "uuid", "nullable": false },
        { "name": "organization_id", "type": "uuid", "nullable": false }
      ]
    }
  ],
  "files": [
    { "path": "db/migrations/${scaffoldCtx.nextMigrationNumber}_volunteer_tracking.sql", "description": "Migration for volunteer_records table" },
    { "path": "lib/modules/registry.ts", "description": "Add volunteer_tracking to MODULE_REGISTRY" },
    { "path": "app/api/org/[orgId]/volunteer-tracking/route.ts", "description": "GET + POST API route" },
    { "path": "components/volunteer-tracking/VolunteerTrackingList.tsx", "description": "List component" },
    { "path": "app/dashboard/volunteer-tracking/page.tsx", "description": "Dashboard page" }
  ],
  "registryEntry": "volunteer_tracking: { id: 'volunteer_tracking', name: 'Volunteer Tracking', ... }",
  "apiShape": "Fields: hours_logged (number), volunteer_role (string), org_unit (string)"
}`;

        const planResponse = await provider.createMessage({
          model: AI_MODELS.scaffoldPlan,
          maxTokens: 4096,
          messages: [{ role: 'user', content: planningUserPrompt }],
          system: planningSystemPrompt,
        });

        const textBlock = planResponse.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          return { type: 'error', tool: toolName, message: 'Planning call returned no text.' };
        }

        let planContent: ScaffoldPlanContent;
        try {
          const raw = textBlock.text.replace(/^```json?\n?|```$/gm, '').trim();
          planContent = JSON.parse(raw) as ScaffoldPlanContent;
        } catch {
          return { type: 'error', tool: toolName, message: `Failed to parse plan JSON: ${textBlock.text.slice(0, 200)}` };
        }

        const { data: proposal, error: proposalError } = await adminSupabase
          .from('builder_proposals')
          .insert({
            org_id: orgId,
            requested_by: userId,
            request_text: requestText,
            proposal_type: 'code',
            status: 'pending',
            phase: 'plan_ready',
            plan_content: planContent,
            generated_code: { files: [] },
          })
          .select('id')
          .single();

        if (proposalError || !proposal) {
          return { type: 'error', tool: toolName, message: proposalError?.message ?? 'Failed to create proposal.' };
        }

        return {
          type: 'scaffold_plan_ready',
          proposalId: proposal.id,
          planContent,
        };
      }

      default:
        return { type: 'error', tool: toolName, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    return { type: 'error', tool: toolName, message };
  }
}
