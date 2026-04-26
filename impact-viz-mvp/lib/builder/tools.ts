// lib/builder/tools.ts
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

// ─── Tool definitions (Anthropic format) ───────────────────────────────────

export const BUILDER_TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_org_branding',
    description: 'Update the organization branding: logo URL and/or primary brand color.',
    input_schema: {
      type: 'object' as const,
      properties: {
        logo_url: { type: 'string', description: 'Full URL to the org logo image' },
        primary_color: { type: 'string', description: 'Hex color code e.g. #1a2e4a' },
      },
    },
  },
  {
    name: 'update_module_config',
    description: 'Enable or disable a feature module for this organization.',
    input_schema: {
      type: 'object' as const,
      properties: {
        module: {
          type: 'string',
          enum: ['tax', 'donors', 'compliance', 'quickbooks'],
          description: 'Module key to toggle',
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
];

// ─── Tool executors ──────────────────────────────────────────────────────────

export type ToolResult =
  | { type: 'config_success'; tool: string; message: string }
  | { type: 'proposal_created'; proposalId: string; summary: string; fileCount: number }
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
        if (toolInput.logo_url) patch.logo_url = toolInput.logo_url as string;
        if (toolInput.primary_color) patch.primary_color = toolInput.primary_color as string;

        const { data: org } = await supabase
          .from('organizations')
          .select('branding')
          .eq('id', orgId)
          .single();

        const merged = { ...(org?.branding ?? {}), ...patch };

        const { error } = await supabase
          .from('organizations')
          .update({ branding: merged })
          .eq('id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };

        const parts: string[] = [];
        if (patch.logo_url) parts.push('logo updated');
        if (patch.primary_color) parts.push(`primary color set to ${patch.primary_color}`);
        return { type: 'config_success', tool: toolName, message: `Branding updated: ${parts.join(', ')}.` };
      }

      case 'update_module_config': {
        const module = toolInput.module as string;
        const enabled = toolInput.enabled as boolean;

        const { data: org } = await supabase
          .from('organizations')
          .select('modules')
          .eq('id', orgId)
          .single();

        const modules = { ...(org?.modules ?? {}), [module]: enabled };

        const { error } = await supabase
          .from('organizations')
          .update({ modules })
          .eq('id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };
        return {
          type: 'config_success',
          tool: toolName,
          message: `Module "${module}" ${enabled ? 'enabled' : 'disabled'}.`,
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

      default:
        return { type: 'error', tool: toolName, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    return { type: 'error', tool: toolName, message };
  }
}
