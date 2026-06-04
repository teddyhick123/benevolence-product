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
import { InputValidator } from '@/lib/ai/validators';

const MUTABLE_MODULE_IDS: readonly ModuleId[] = [
  'impact_tracking', 'reporting', 'tax_optimization', 'grant_management',
  'donor_management', 'pledge_tracking', 'external_data', 'analytics',
  'compliance_regulatory',
];

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
    name: 'list_modules',
    description: 'List all available modules and their current enabled/disabled state for this org. Call this before update_module_config.',
    input_schema: {
      type: 'object' as const,
      properties: {},
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
  {
    name: 'update_workflow_template',
    description: 'Add, remove, or reorder steps in a grant workflow template. Replaces existing steps.',
    input_schema: {
      type: 'object' as const,
      required: ['template_id', 'steps'],
      properties: {
        template_id: { type: 'string', description: 'UUID of the workflow template to update' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name:        { type: 'string' },
              description: { type: 'string' },
              order:       { type: 'number' },
              required:    { type: 'boolean' },
            },
            required: ['name', 'order'],
          },
          description: 'Complete ordered list of steps (replaces existing)',
        },
      },
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
        try {
          InputValidator.validateRequired(toolInput.module, 'module');
          InputValidator.validateEnum(toolInput.module, 'module', MUTABLE_MODULE_IDS);
          InputValidator.validateRequired(toolInput.enabled, 'enabled');
          InputValidator.validateEnum(toolInput.enabled, 'enabled', [true, false] as const);
        } catch (e) {
          return { type: 'error', tool: toolName, message: e instanceof Error ? e.message : 'Invalid input' };
        }

        const moduleId = toolInput.module as ModuleId;
        const enabled = toolInput.enabled as boolean;

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

      case 'list_modules': {
        const enabledIds = await getOrgEnabledModules(adminSupabase, orgId);
        const enabledSet = new Set(enabledIds);

        const modules = Object.values(MODULE_REGISTRY).map(mod => {
          const enabled = enabledSet.has(mod.id);
          // canToggle: false for core; false for enabled modules whose removal would break dependents
          const canToggle = mod.isCore
            ? false
            : !enabled || canDisableModule(mod.id, enabledIds).canDisable;
          return {
            id: mod.id,
            name: mod.name,
            description: mod.description,
            enabled,
            isCore: mod.isCore,
            dependencies: mod.dependencies ?? [],
            canToggle,
          };
        });

        const lines = modules.map(m =>
          `${m.enabled ? '[ON] ' : '[OFF]'} ${m.id} — ${m.name}${m.isCore ? ' (core, always on)' : ''}${m.dependencies.length ? ` (requires: ${m.dependencies.join(', ')})` : ''}`
        ).join('\n');

        return {
          type: 'config_success',
          tool: toolName,
          message: `Modules for this org:\n${lines}`,
        };
      }

      case 'update_workflow_template': {
        // Validate inputs
        const templateId = toolInput.template_id as string;
        const steps = toolInput.steps as Array<{ name: string; description?: string; order: number; required?: boolean }>;
        try { InputValidator.validateUUID(templateId, 'template_id'); }
        catch (e) { return { type: 'error', tool: toolName, message: e instanceof Error ? e.message : 'Invalid template_id' }; }
        if (!Array.isArray(steps) || steps.length === 0) return { type: 'error', tool: toolName, message: 'steps must be a non-empty array' };
        const stepErr = steps.reduce<string | null>((acc, s) => {
          if (acc) return acc;
          try { InputValidator.validateString(s.name, 'step.name', { maxLength: 200 }); } catch (e) { return e instanceof Error ? e.message : 'Invalid step.name'; }
          if (!s.name) return 'Each step.name must be non-empty'; if (typeof s.order !== 'number') return 'Each step must have a numeric order';
          return null;
        }, null);
        if (stepErr) return { type: 'error', tool: toolName, message: stepErr };
        // Fetch template and enforce org boundaries: cross-org is Forbidden, is_system triggers clone-on-write insert
        const { data: tmpl, error: fetchErr } = await adminSupabase.from('workflow_templates')
          .select('id, org_id, is_system, name, workflow_type, description, steps').eq('id', templateId).maybeSingle();
        if (fetchErr) return { type: 'error', tool: toolName, message: fetchErr.message };
        if (!tmpl) return { type: 'error', tool: toolName, message: `Workflow template ${templateId} not found` };
        if (tmpl.org_id && tmpl.org_id !== orgId) return { type: 'error', tool: toolName, message: 'Forbidden: that template belongs to another org' };
        if (!tmpl.org_id || tmpl.is_system) {
          const { data: cloned, error: cloneErr } = await adminSupabase.from('workflow_templates')
            .insert({ org_id: orgId, is_system: false, name: tmpl.name, workflow_type: tmpl.workflow_type, description: tmpl.description, steps })
            .select('id').single();
          if (cloneErr) return { type: 'error', tool: toolName, message: cloneErr.message };
          return { type: 'config_success', tool: toolName, message: `System template cloned as org-specific template (id: ${cloned.id}) with ${steps.length} steps.` };
        }
        const { error: updateErr } = await adminSupabase.from('workflow_templates').update({ steps }).eq('id', templateId).eq('org_id', orgId);
        if (updateErr) return { type: 'error', tool: toolName, message: updateErr.message };
        return { type: 'config_success', tool: toolName, message: `Workflow template updated with ${steps.length} steps.` };
      }

      default:
        return { type: 'error', tool: toolName, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    return { type: 'error', tool: toolName, message };
  }
}
