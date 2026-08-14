// lib/builder/tools.ts
import type { SupabaseClient } from '@/lib/database-client';
import type { ToolDefinition } from '@/lib/ai/types';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import { buildScaffoldContext, formatScaffoldContextForPrompt } from './scaffold-context';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';
import { evaluatePathPolicy, evaluateFileBudget, formatPathPolicyViolations } from './path-policy';
import { branding } from '@/lib/config';
import type { ModuleId } from '@/lib/modules/types';
import { MODULE_REGISTRY, canDisableModule } from '@/lib/modules/registry';
import { getOrgEnabledModules, enableModule, disableModule } from '@/lib/modules/tool-filter';
import { InputValidator } from '@/lib/ai/validators';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import { REQUIRED_FIELD_ALLOWLIST } from '@/lib/grants/workflow-config-constants';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_KEY_PATTERN,
  CUSTOM_FIELD_TYPES,
  normalizeFieldKey,
  type CustomFieldEntityType,
  type CustomFieldType,
} from '@/lib/custom-fields';
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  type AutomationActionType,
  type AutomationTriggerType,
} from '@/lib/tasks/automation/dynamic-rules';
import {
  ORG_AI_CONTEXT_KEY_PATTERN,
  ORG_AI_CONTEXT_TYPES,
  normalizeContextKey,
  type OrgAiContextType,
} from '@/lib/organizations/ai-context';
import {
  DASHBOARD_SECTION_IDS,
  ENTITY_VOCABULARY_TYPES,
  GRANT_MODULE_VIEWS,
  GRANTS_TABLE_COLUMNS,
  VIEW_CONFIG_SCOPES,
  normalizeVocabulary,
  type DashboardSectionId,
  type EntityVocabularyType,
  type GrantModuleView,
  type GrantsTableColumn,
  type ViewConfigScope,
} from '@/lib/organizations/view-config';
import { CODE_STATES } from '@/lib/builder/proposal-state';
import {
  buildFileManifest,
  manifestHash,
  buildUnifiedDiff,
  canonicalJson,
  sha256Hex,
  artifactPrefix,
  putJsonArtifact,
  putTextArtifact,
  ARTIFACT_KEYS,
} from '@/lib/builder/artifacts';

const MUTABLE_MODULE_IDS: readonly ModuleId[] = [
  'impact_tracking', 'reporting', 'tax_optimization', 'grant_management',
  'donor_management', 'pledge_tracking', 'external_data', 'analytics',
  'compliance_regulatory',
];
const METRIC_AGGREGATIONS = ['sum', 'avg', 'last', 'first'] as const;
const METRIC_DIRECTIONS = ['higher_is_better', 'lower_is_better', 'neutral'] as const;
const BUILDER_EVENT_TYPES = ['tool_call', 'ai_request', 'proposal_created', 'proposal_applied', 'proposal_rejected'] as const;
const REPORT_TEMPLATE_SCOPES = ['portfolio', 'holding', 'sector'] as const;
const BOARD_REPORT_SECTIONS = ['overview', 'financials', 'holdings', 'impact', 'tax', 'tasks', 'appendix'] as const;

function validationMessage(err: unknown, fallback = 'Invalid input'): string {
  return err instanceof Error ? err.message : fallback;
}

function requiredString(value: unknown, fieldName: string, options?: { maxLength?: number; pattern?: RegExp; allowEmpty?: boolean }): string {
  if (options?.allowEmpty) {
    if (value === undefined || value === null) throw new Error(`${fieldName} is required`);
  } else {
    InputValidator.validateRequired(value, fieldName);
  }
  InputValidator.validateString(value, fieldName, { maxLength: options?.maxLength, pattern: options?.pattern });
  return value as string;
}

function optionalString(value: unknown, fieldName: string, options?: { maxLength?: number; pattern?: RegExp; allowEmpty?: boolean }): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!options?.allowEmpty && value === '') throw new Error(`${fieldName} cannot be empty`);
  InputValidator.validateString(value, fieldName, { maxLength: options?.maxLength, pattern: options?.pattern });
  return value as string;
}

function requiredBoolean(value: unknown, fieldName: string): boolean {
  InputValidator.validateRequired(value, fieldName);
  if (typeof value !== 'boolean') throw new Error(`${fieldName} must be a boolean`);
  return value;
}

function requiredUuid(value: unknown, fieldName: string): string {
  const str = requiredString(value, fieldName);
  InputValidator.validateUUID(str, fieldName);
  return str;
}

function optionalEnum<T extends string>(value: unknown, fieldName: string, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === null) return undefined;
  InputValidator.validateEnum(value, fieldName, allowed);
  return value as T;
}

function validateUrl(value: unknown, fieldName: string): string | undefined {
  const url = optionalString(value, fieldName, { maxLength: 2048 });
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${fieldName} must use http or https`);
  }
  return url;
}

function validateBuilderPath(value: unknown, fieldName: string): string {
  const path = requiredString(value, fieldName, { maxLength: 240 });
  if (path.startsWith('/') || path.startsWith('\\')) throw new Error(`${fieldName} must be relative`);
  if (path.includes('\\') || path.includes('\0')) throw new Error(`${fieldName} has invalid path characters`);
  if (path.split('/').includes('..')) throw new Error(`${fieldName} cannot contain .. segments`);
  return path.replace(/^\.\//, '');
}

function validateProposalFiles(value: unknown): Array<{ path: string; content: string; diff: string }> {
  InputValidator.validateRequired(value, 'files');
  InputValidator.validateArray(value, 'files', { maxLength: 50 });
  const files = value as unknown[];
  if (files.length === 0) throw new Error('files must contain at least one file');

  const validated = files.map((file, index) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw new Error(`files[${index}] must be an object`);
    }
    const item = file as Record<string, unknown>;
    return {
      path: validateBuilderPath(item.path, `files[${index}].path`),
      content: requiredString(item.content, `files[${index}].content`, { maxLength: 500_000, allowEmpty: true }),
      diff: requiredString(item.diff, `files[${index}].diff`, { maxLength: 500_000, allowEmpty: true }),
    };
  });

  const budgetError = evaluateFileBudget(validated);
  if (budgetError) throw new Error(budgetError);

  const policy = evaluatePathPolicy(validated.map(f => f.path));
  if (!policy.allowed) {
    throw new Error(`Proposal touches protected paths. ${formatPathPolicyViolations(policy.violations)}`);
  }

  return validated;
}

function validateScaffoldPlanContent(value: unknown): ScaffoldPlanContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('plan must be a JSON object');
  const plan = value as Record<string, unknown>;
  const moduleName = requiredString(plan.moduleName, 'plan.moduleName', { maxLength: 120 });
  const moduleSlug = requiredString(plan.moduleSlug, 'plan.moduleSlug', { maxLength: 64, pattern: /^[a-z][a-z0-9_]*$/ });
  const moduleIcon = requiredString(plan.moduleIcon, 'plan.moduleIcon', { maxLength: 64 });
  if (!Array.isArray(plan.files) || plan.files.length === 0) throw new Error('plan.files must be a non-empty array');
  if (plan.files.length > 50) throw new Error('plan.files is limited to 50 files');

  const files = plan.files.map((file, index) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error(`plan.files[${index}] must be an object`);
    const item = file as Record<string, unknown>;
    return {
      path: validateBuilderPath(item.path, `plan.files[${index}].path`),
      description: requiredString(item.description, `plan.files[${index}].description`, { maxLength: 2000 }),
    };
  });

  const policy = evaluatePathPolicy(files.map(f => f.path));
  if (!policy.allowed) {
    throw new Error(`Plan touches protected paths. ${formatPathPolicyViolations(policy.violations)}`);
  }

  return {
    moduleName,
    moduleSlug,
    moduleIcon,
    tables: Array.isArray(plan.tables) ? (plan.tables as ScaffoldPlanContent['tables']) : [],
    files,
    registryEntry: typeof plan.registryEntry === 'string' ? plan.registryEntry : '',
    apiShape: typeof plan.apiShape === 'string' ? plan.apiShape : '',
  };
}

function validateWorkflowSteps(value: unknown): Array<{ name: string; description?: string; order: number; required?: boolean }> {
  InputValidator.validateRequired(value, 'steps');
  InputValidator.validateArray(value, 'steps', { maxLength: 100 });
  const rawSteps = value as unknown[];
  if (rawSteps.length === 0) throw new Error('steps must be a non-empty array');

  return rawSteps.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`steps[${index}] must be an object`);
    }
    const item = step as Record<string, unknown>;
    const name = requiredString(item.name, `steps[${index}].name`, { maxLength: 200 });
    const description = optionalString(item.description, `steps[${index}].description`, { maxLength: 2000 });
    InputValidator.validateNumber(item.order, `steps[${index}].order`, { min: 1, max: 1000 });
    const order = Number(item.order);
    if (!Number.isFinite(order)) throw new Error(`steps[${index}].order must be a finite number`);
    if (item.required !== undefined && typeof item.required !== 'boolean') {
      throw new Error(`steps[${index}].required must be a boolean`);
    }
    return {
      name,
      description,
      order,
      required: item.required as boolean | undefined,
    };
  });
}

function validateCustomFieldEnumOptions(value: unknown): Array<{ value: string; label: string }> | null {
  if (value === undefined || value === null) return null;
  InputValidator.validateArray(value, 'enum_options', { maxLength: 50 });
  const options = value as unknown[];
  if (options.length === 0) throw new Error('enum_options must contain at least one option');

  return options.map((option, index) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      throw new Error(`enum_options[${index}] must be an object`);
    }
    const item = option as Record<string, unknown>;
    return {
      value: requiredString(item.value, `enum_options[${index}].value`, { maxLength: 64, pattern: CUSTOM_FIELD_KEY_PATTERN }),
      label: requiredString(item.label, `enum_options[${index}].label`, { maxLength: 120 }),
    };
  });
}

function validateStringArray<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
  options?: { required?: boolean; maxLength?: number }
): T[] {
  if (value === undefined || value === null) {
    if (options?.required) throw new Error(`${fieldName} is required`);
    return [];
  }
  InputValidator.validateArray(value, fieldName, { maxLength: options?.maxLength ?? allowed.length });
  return (value as unknown[]).map((item, index) => {
    InputValidator.validateEnum(item, `${fieldName}[${index}]`, allowed);
    return item as T;
  });
}

async function resolveOrgPortfolioId(
  adminSupabase: SupabaseClient,
  orgId: string,
  value: unknown
): Promise<string> {
  if (value !== undefined && value !== null) {
    const portfolioId = requiredUuid(value, 'portfolio_id');
    const { data, error } = await adminSupabase
      .from('portfolios')
      .select('id')
      .eq('id', portfolioId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('portfolio_id was not found for this org');
    return portfolioId;
  }

  const { data, error } = await adminSupabase
    .from('portfolios')
    .select('id')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(2);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('This org has no portfolio to attach the report template to.');
  if (data.length > 1) throw new Error('This org has multiple portfolios. Pass portfolio_id so the template is attached to the right one.');
  return data[0].id;
}

function formatConfigRows(rows: any[] | null | undefined, formatter: (row: any) => string): string {
  if (!rows || rows.length === 0) return 'None configured.';
  return rows.map(formatter).join('\n');
}

// ─── Telemetry helper ────────────────────────────────────────────────────────

async function emitBuilderEvent(
  adminSupabase: SupabaseClient,
  orgId: string,
  userId: string,
  eventType: 'tool_call' | 'ai_request' | 'proposal_created' | 'proposal_applied' | 'proposal_rejected',
  extra: {
    tool_name?: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await adminSupabase.from('builder_events').insert({
    org_id: orgId,
    user_id: userId,
    event_type: eventType,
    tool_name: extra.tool_name ?? null,
    payload: extra.payload ?? null,
  });
  if (error) {
    console.error('Failed to emit builder event:', error.message);
  }
}

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
    name: 'record_operating_norm',
    description: 'Record an org-specific operating norm, process rule, preference, or naming convention the AI assistant should apply in future sessions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        context_type: {
          type: 'string',
          enum: [...ORG_AI_CONTEXT_TYPES],
          description: 'Type of context. Defaults to operating_norm.',
        },
        context_key: {
          type: 'string',
          description: 'Optional stable snake_case key. If omitted, generated from context_value.',
        },
        context_value: {
          type: 'string',
          description: 'Human-readable context to remember. Max 4000 characters.',
        },
      },
      required: ['context_value'],
    },
  },
  {
    name: 'record_naming_convention',
    description: 'Record a naming or vocabulary preference for this org, such as "we call grants awards".',
    input_schema: {
      type: 'object' as const,
      properties: {
        context_key: { type: 'string', description: 'Optional stable snake_case key. If omitted, generated from the phrase.' },
        context_value: { type: 'string', description: 'Human-readable naming convention. Max 4000 characters.' },
      },
      required: ['context_value'],
    },
  },
  {
    name: 'list_org_context',
    description: 'List active org-specific AI context records: operating norms, naming conventions, process rules, and preferences.',
    input_schema: {
      type: 'object' as const,
      properties: {
        include_inactive: { type: 'boolean', description: 'Include inactive context records. Default false.' },
      },
    },
  },
  {
    name: 'update_org_context',
    description: 'Update an existing org-specific AI context record. Use list_org_context first to find the ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        context_id: { type: 'string', description: 'UUID of the context record.' },
        context_type: { type: 'string', enum: [...ORG_AI_CONTEXT_TYPES], description: 'New context type.' },
        context_key: { type: 'string', description: 'New stable snake_case key.' },
        context_value: { type: 'string', description: 'New human-readable context.' },
        is_active: { type: 'boolean', description: 'Whether this context is active.' },
      },
      required: ['context_id'],
    },
  },
  {
    name: 'remove_org_context',
    description: 'Deactivate or permanently delete an org-specific AI context record. Defaults to deactivation so history is preserved.',
    input_schema: {
      type: 'object' as const,
      properties: {
        context_id: { type: 'string', description: 'UUID of the context record.' },
        hard_delete: { type: 'boolean', description: 'Set true to permanently delete. Default false.' },
        confirm: { type: 'boolean', description: 'Must be true to confirm removal.' },
      },
      required: ['context_id', 'confirm'],
    },
  },
  {
    name: 'set_dashboard_layout',
    description: 'Configure the org default dashboard section order and hidden sections. Supported sections: tasks, summary, kpis, payout, holdings_widgets, grants, map.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sections: {
          type: 'array',
          items: { type: 'string', enum: [...DASHBOARD_SECTION_IDS] },
          description: 'Ordered dashboard section IDs. Omitted sections are appended unless hidden.',
        },
        hidden_sections: {
          type: 'array',
          items: { type: 'string', enum: [...DASHBOARD_SECTION_IDS] },
          description: 'Dashboard sections to hide.',
        },
      },
    },
  },
  {
    name: 'set_module_default_view',
    description: 'Set the default landing view for a module. Phase 5 supports the grant module default view.',
    input_schema: {
      type: 'object' as const,
      properties: {
        module: { type: 'string', enum: ['grant_module'], description: 'Module view config key.' },
        default_view: { type: 'string', enum: [...GRANT_MODULE_VIEWS], description: 'Default grant module view.' },
      },
      required: ['module', 'default_view'],
    },
  },
  {
    name: 'set_table_columns',
    description: 'Configure visible table columns for an org-level table. Phase 5 supports grants_table; custom fields use custom:field_key.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', enum: ['grants_table'], description: 'Table config key.' },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered columns. Grants supports name, stage, amount, risk, custom_fields, period_end, portfolio, owner, or custom:field_key.',
        },
      },
      required: ['table', 'columns'],
    },
  },
  {
    name: 'rename_entity',
    description: 'Set an org vocabulary override for a top-level entity label, such as Grant -> Award.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_type: { type: 'string', enum: [...ENTITY_VOCABULARY_TYPES], description: 'Entity type to rename.' },
        singular: { type: 'string', description: 'Singular display label, e.g. Award.' },
        plural: { type: 'string', description: 'Plural display label, e.g. Awards. If omitted, generated from singular.' },
      },
      required: ['entity_type', 'singular'],
    },
  },
  {
    name: 'list_view_config',
    description: 'List configured dashboard layout, module defaults, table columns, and entity vocabulary for this org.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scope: { type: 'string', enum: [...VIEW_CONFIG_SCOPES], description: 'Optional config scope filter.' },
      },
    },
  },
  {
    name: 'summarize_org_configuration',
    description: 'Return a complete human-readable summary of this org configuration across modules, workflows, custom fields, automations, AI context, views, report templates, and recent Builder activity.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'list_builder_history',
    description: 'List recent Builder configuration history: what changed, when, who changed it, and the tool or request involved.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_type: {
          type: 'string',
          enum: [...BUILDER_EVENT_TYPES],
          description: 'Optional event type filter.',
        },
        limit: {
          type: 'number',
          description: 'Maximum rows to return, default 20, max 100.',
        },
      },
    },
  },
  {
    name: 'save_board_report_template',
    description: 'Create a configurable board report template for one portfolio: logo, section selection, section order, and custom field inclusion.',
    input_schema: {
      type: 'object' as const,
      properties: {
        portfolio_id: {
          type: 'string',
          description: 'Portfolio UUID. Optional only when the org has exactly one portfolio.',
        },
        name: { type: 'string', description: 'Template name, e.g. Quarterly Board Packet.' },
        description: { type: 'string', description: 'Optional template description.' },
        logo_url: { type: 'string', description: 'Optional http(s) logo URL to use in generated board reports.' },
        sections: {
          type: 'array',
          items: { type: 'string', enum: [...BOARD_REPORT_SECTIONS] },
          description: 'Ordered report sections to include.',
        },
        include_custom_fields: {
          type: 'boolean',
          description: 'Whether selected custom fields should be included in the report.',
        },
        custom_field_keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom field keys to include when include_custom_fields is true.',
        },
        is_default: {
          type: 'boolean',
          description: 'Set as the default portfolio report template.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_board_report_templates',
    description: 'List configured board report templates for this org, optionally narrowed to one portfolio.',
    input_schema: {
      type: 'object' as const,
      properties: {
        portfolio_id: {
          type: 'string',
          description: 'Optional portfolio UUID.',
        },
      },
    },
  },
  {
    name: 'submit_code_proposal',
    description: 'Submit a code change proposal. The proposal starts in implementation review: an implementation reviewer must run the automated build/review gate before a pull request can open. Never tell the user a PR will open immediately.',
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
  {
    name: 'list_proposals',
    description: 'List recent builder proposals for this org. Use to check the status of prior scaffold requests.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code_state: {
          type: 'string',
          enum: [...CODE_STATES],
          description: 'Filter by code state (omit to return all recent proposals)',
        },
      },
    },
  },

  // ==================== WORKFLOW CONFIG ====================
  {
    name: 'add_checklist_item',
    description: 'Add or update a checklist item for a grant lifecycle stage. If required=true, the transition out of the stage is blocked until the item is checked.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stage_key: { type: 'string', description: 'Lifecycle stage (e.g., "due_diligence"). Must be a canonical stage key.' },
        item_key: { type: 'string', description: 'Unique slug, e.g. "site_visit". Lowercase letters, digits, underscores only. Max 64 chars.' },
        label: { type: 'string', description: 'Checklist label shown to users, e.g. "Site visit completed". Max 200 chars.' },
        required: { type: 'boolean', description: 'If true, stage transition is blocked until checked.' },
        sort_order: { type: 'number', description: 'Display order (lower = first). Default: 0.' },
      },
      required: ['stage_key', 'item_key', 'label', 'required'],
    },
  },
  {
    name: 'remove_checklist_item',
    description: 'Remove a checklist item from a grant lifecycle stage. All existing completion records for this item are automatically deleted via cascade.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stage_key: { type: 'string', description: 'Lifecycle stage the item belongs to.' },
        item_key: { type: 'string', description: 'Slug of the item to remove.' },
      },
      required: ['stage_key', 'item_key'],
    },
  },
  {
    name: 'set_required_field',
    description: 'Require that a canonical grant field is non-null before a grant can advance past a given stage. Only canonical grant fields in the allowlist are supported.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stage_key: { type: 'string', description: 'Lifecycle stage at which the field is checked.' },
        field_name: {
          type: 'string',
          enum: [...REQUIRED_FIELD_ALLOWLIST],
          description: 'Canonical grant field that must be set. Validated against REQUIRED_FIELD_ALLOWLIST. Must indicate the purpose of requiring this field.',
        },
        error_message: {
          type: 'string',
          description: 'Message shown when the field is missing. Max 300 characters. Optional.',
        },
      },
      required: ['stage_key', 'field_name'],
    },
  },
  {
    name: 'remove_required_field',
    description: 'Remove a required-field rule for a grant lifecycle stage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stage_key: { type: 'string', description: 'Lifecycle stage the rule applies to.' },
        field_name: {
          type: 'string',
          enum: [...REQUIRED_FIELD_ALLOWLIST],
          description: 'Canonical grant field to remove the requirement for.',
        },
      },
      required: ['stage_key', 'field_name'],
    },
  },
  {
    name: 'rename_stage',
    description: 'Set a display label override for a canonical grant lifecycle stage. Pass an empty string for label to restore the system default name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stage_key: { type: 'string', description: 'Canonical stage key to rename (e.g., "due_diligence").' },
        label: { type: 'string', description: 'New display name, e.g. "Site Review". Max 60 characters. Pass empty string to remove the override.' },
      },
      required: ['stage_key', 'label'],
    },
  },
  {
    name: 'set_approval_requirement',
    description: 'Record an informational approval requirement annotation for a grant lifecycle stage. This is displayed in the settings page and grant checklist — it does NOT block transitions in Phase 1.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stage_key: { type: 'string', description: 'Lifecycle stage this annotation applies to.' },
        required: { type: 'boolean', description: 'Whether approval is required. Pass false to remove the annotation.' },
        description: { type: 'string', description: 'Description of the approval requirement, e.g. "Board vote required". Max 300 characters.' },
      },
      required: ['stage_key', 'required'],
    },
  },
  {
    name: 'list_workflow_config',
    description: 'List all workflow configuration for this organization, grouped by stage. Shows checklist items, required fields, stage label overrides, and approval annotations.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // ==================== CUSTOM FIELDS ====================
  {
    name: 'create_custom_field',
    description: 'Create an org-scoped typed custom field on grants, holdings, donors, or contributions. Grant fields may be required before advancing past a lifecycle stage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_type: { type: 'string', enum: [...CUSTOM_FIELD_ENTITY_TYPES], description: 'Entity type this field belongs to.' },
        field_label: { type: 'string', description: 'Human-readable label shown in forms. Max 120 chars.' },
        field_key: { type: 'string', description: 'Optional stable snake_case key. If omitted, generated from field_label.' },
        field_type: { type: 'string', enum: [...CUSTOM_FIELD_TYPES], description: 'Field type.' },
        enum_options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['value', 'label'],
          },
          description: 'Required for enum fields. Values must be stable snake_case keys.',
        },
        required_at_stage: { type: 'string', enum: [...LIFECYCLE_STAGES], description: 'Grant lifecycle stage this field is required before leaving. Grant fields only.' },
        is_ai_readable: { type: 'boolean', description: 'Whether the AI assistant may read this field. Default true.' },
        sort_order: { type: 'number', description: 'Display order. Default 0.' },
      },
      required: ['entity_type', 'field_label', 'field_type'],
    },
  },
  {
    name: 'list_custom_fields',
    description: 'List custom field definitions for this organization, optionally filtered by entity type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_type: { type: 'string', enum: [...CUSTOM_FIELD_ENTITY_TYPES], description: 'Optional entity type filter.' },
      },
    },
  },
  {
    name: 'update_custom_field',
    description: 'Update a custom field definition. Use list_custom_fields first to get the field ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        field_id: { type: 'string', description: 'UUID of the custom field definition.' },
        field_label: { type: 'string', description: 'New label.' },
        field_type: { type: 'string', enum: [...CUSTOM_FIELD_TYPES], description: 'New type. Use carefully if values already exist.' },
        enum_options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['value', 'label'],
          },
        },
        required_at_stage: { type: 'string', enum: [...LIFECYCLE_STAGES], description: 'Grant fields only. Pass null to clear.' },
        is_ai_readable: { type: 'boolean', description: 'Whether AI may read the field.' },
        sort_order: { type: 'number', description: 'Display order.' },
      },
      required: ['field_id'],
    },
  },
  {
    name: 'remove_custom_field',
    description: 'Delete a custom field definition and all stored values. This is destructive and requires confirm=true.',
    input_schema: {
      type: 'object' as const,
      properties: {
        field_id: { type: 'string', description: 'UUID of the custom field definition.' },
        confirm: { type: 'boolean', description: 'Must be true to confirm destructive deletion.' },
      },
      required: ['field_id', 'confirm'],
    },
  },

  // ==================== AUTOMATION RULES ====================
  {
    name: 'create_automation_rule',
    description: 'Create an org automation rule for supported triggers and actions: grant stage changes, date-relative grant events, custom field updates, and task completion can create tasks, notify members, or set custom fields.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Short rule name.' },
        trigger_type: { type: 'string', enum: [...AUTOMATION_TRIGGER_TYPES], description: 'Automation trigger type.' },
        trigger_config: { type: 'object', description: 'Trigger config. For grant_stage_change: { stage: "active" }.' },
        conditions: { type: 'array', items: { type: 'object' }, description: 'Optional conditions array.' },
        action_type: { type: 'string', enum: [...AUTOMATION_ACTION_TYPES], description: 'Automation action type.' },
        action_config: {
          type: 'object',
          description: 'Action config. For create_task: title_template, optional description_template, due_days, priority, task_type, assignee_field.',
        },
        is_active: { type: 'boolean', description: 'Whether the rule starts active. Default true.' },
      },
      required: ['name', 'trigger_type', 'trigger_config', 'action_type', 'action_config'],
    },
  },
  {
    name: 'list_automation_rules',
    description: 'List automation rules for this organization.',
    input_schema: {
      type: 'object' as const,
      properties: {
        include_inactive: { type: 'boolean', description: 'Include inactive rules. Default false.' },
      },
    },
  },
  {
    name: 'enable_automation_rule',
    description: 'Enable an automation rule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'string', description: 'UUID of the rule to enable.' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'disable_automation_rule',
    description: 'Disable an automation rule without deleting it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'string', description: 'UUID of the rule to disable.' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'remove_automation_rule',
    description: 'Delete an automation rule. Past run records are preserved with rule_id set null by FK behavior.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'string', description: 'UUID of the rule to delete.' },
        confirm: { type: 'boolean', description: 'Must be true to confirm deletion.' },
      },
      required: ['rule_id', 'confirm'],
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
        let name: string | undefined;
        let logoUrl: string | undefined;
        let primaryColor: string | undefined;
        try {
          name = optionalString(toolInput.name, 'name', { maxLength: 160 });
          logoUrl = validateUrl(toolInput.logo_url, 'logo_url');
          primaryColor = optionalString(toolInput.primary_color, 'primary_color', {
            maxLength: 7,
            pattern: /^#[0-9a-fA-F]{6}$/,
          });
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const patch: Record<string, string> = {};
        if (logoUrl !== undefined) patch.logo_url = logoUrl;
        if (primaryColor !== undefined) patch.primary_color = primaryColor;

        const orgPatch: Record<string, unknown> = {};
        if (name !== undefined) orgPatch.name = name;

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
        if (name) parts.push(`name set to "${name}"`);
        if (patch.logo_url) parts.push('logo updated');
        if (patch.primary_color) parts.push(`color set to ${patch.primary_color}`);
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { fields: [...Object.keys(patch), ...(name !== undefined ? ['name'] : [])] },
        });
        return { type: 'config_success', tool: toolName, message: `Updated: ${parts.join(', ')}.` };
      }

      case 'update_module_config': {
        let moduleId: ModuleId;
        let enabled: boolean;
        try {
          InputValidator.validateRequired(toolInput.module, 'module');
          InputValidator.validateEnum(toolInput.module, 'module', MUTABLE_MODULE_IDS);
          moduleId = toolInput.module as ModuleId;
          enabled = requiredBoolean(toolInput.enabled, 'enabled');
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const result = enabled
          ? await enableModule(adminSupabase, orgId, moduleId, userId)
          : await disableModule(adminSupabase, orgId, moduleId);

        if (!result.success) {
          return { type: 'error', tool: toolName, message: result.error ?? 'Module update failed' };
        }
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { module: moduleId, enabled },
        });
        return {
          type: 'config_success',
          tool: toolName,
          message: `Module "${moduleId}" ${enabled ? 'enabled' : 'disabled'}.`,
        };
      }

      case 'create_metric_definition': {
        let name: string;
        let slug: string;
        let unit: string | undefined;
        let description: string | undefined;
        let aggregation: typeof METRIC_AGGREGATIONS[number];
        let direction: typeof METRIC_DIRECTIONS[number];
        try {
          name = requiredString(toolInput.name, 'name', { maxLength: 128 });
          slug = requiredString(toolInput.slug, 'slug', { maxLength: 64, pattern: /^[a-z0-9_]+$/ });
          unit = optionalString(toolInput.unit, 'unit', { maxLength: 40 });
          description = optionalString(toolInput.description, 'description', { maxLength: 2000 });
          aggregation = optionalEnum(toolInput.aggregation, 'aggregation', METRIC_AGGREGATIONS) ?? 'sum';
          direction = optionalEnum(toolInput.direction, 'direction', METRIC_DIRECTIONS) ?? 'higher_is_better';
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const { error } = await supabase.from('kpi_definitions').insert({
          org_id: orgId,
          name,
          slug,
          unit: unit || null,
          description: description || null,
          aggregation,
          direction,
        });

        if (error) return { type: 'error', tool: toolName, message: error.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { name, slug },
        });
        return {
          type: 'config_success',
          tool: toolName,
          message: `Metric "${name}" created successfully.`,
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
        let id: string;
        const patch: Record<string, unknown> = {};
        try {
          id = requiredUuid(toolInput.id, 'id');
          const name = optionalString(toolInput.name, 'name', { maxLength: 128 });
          const unit = optionalString(toolInput.unit, 'unit', { maxLength: 40, allowEmpty: true });
          const description = optionalString(toolInput.description, 'description', { maxLength: 2000, allowEmpty: true });
          const aggregation = optionalEnum(toolInput.aggregation, 'aggregation', METRIC_AGGREGATIONS);
          const direction = optionalEnum(toolInput.direction, 'direction', METRIC_DIRECTIONS);
          if (name !== undefined) patch.name = name;
          if (unit !== undefined) patch.unit = unit || null;
          if (description !== undefined) patch.description = description || null;
          if (aggregation !== undefined) patch.aggregation = aggregation;
          if (direction !== undefined) patch.direction = direction;
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        if (Object.keys(patch).length === 0) {
          return { type: 'error', tool: toolName, message: 'No fields to update provided.' };
        }

        const { error } = await supabase
          .from('kpi_definitions')
          .update(patch)
          .eq('id', id)
          .eq('org_id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { id },
        });
        return { type: 'config_success', tool: toolName, message: `KPI definition ${id} updated.` };
      }

      case 'delete_metric_definition': {
        let id: string;
        try {
          id = requiredUuid(toolInput.id, 'id');
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }
        const { error } = await supabase
          .from('kpi_definitions')
          .update({ is_active: false })
          .eq('id', id)
          .eq('org_id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { id },
        });
        return {
          type: 'config_success',
          tool: toolName,
          message: `KPI definition ${id} deactivated. Historical data preserved.`,
        };
      }

      case 'set_ai_instructions': {
        let instructions: string;
        try {
          instructions = requiredString(toolInput.instructions, 'instructions', { maxLength: 12000, allowEmpty: true });
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }
        const { error } = await supabase
          .from('organizations')
          .update({ ai_instructions: instructions || null })
          .eq('id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { cleared: !instructions },
        });
        return {
          type: 'config_success',
          tool: toolName,
          message: instructions
            ? 'AI instructions saved. They will be applied to all future assistant sessions.'
            : 'AI instructions cleared.',
        };
      }

      case 'record_operating_norm':
      case 'record_naming_convention': {
        let contextType: OrgAiContextType;
        let contextKey: string;
        let contextValue: string;
        try {
          contextType = toolName === 'record_naming_convention'
            ? 'naming_convention'
            : optionalEnum(toolInput.context_type, 'context_type', ORG_AI_CONTEXT_TYPES) ?? 'operating_norm';
          contextValue = requiredString(toolInput.context_value, 'context_value', { maxLength: 4000 });
          const rawKey = optionalString(toolInput.context_key, 'context_key', { maxLength: 80, pattern: ORG_AI_CONTEXT_KEY_PATTERN });
          contextKey = rawKey ?? normalizeContextKey(contextValue);
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const { data, error } = await adminSupabase
          .from('org_ai_context')
          .upsert({
            org_id: orgId,
            context_type: contextType,
            context_key: contextKey,
            context_value: contextValue,
            source: 'builder_chat',
            is_active: true,
            created_by: userId,
          }, { onConflict: 'org_id,context_key' })
          .select('id, context_key')
          .single();

        if (error) return { type: 'error', tool: toolName, message: error.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { context_id: data.id, context_key: data.context_key, context_type: contextType },
        });
        return {
          type: 'config_success',
          tool: toolName,
          message: `AI context saved as "${data.context_key}". It will be applied to future assistant sessions.`,
        };
      }

      case 'list_org_context': {
        const includeInactive = toolInput.include_inactive === true;
        let query = adminSupabase
          .from('org_ai_context')
          .select('id, context_type, context_key, context_value, source, is_active, updated_at')
          .eq('org_id', orgId)
          .order('context_type')
          .order('context_key');
        if (!includeInactive) query = query.eq('is_active', true);

        const { data, error } = await query;
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data || data.length === 0) {
          return { type: 'config_success', tool: toolName, message: includeInactive ? 'No AI context records found.' : 'No active AI context records found.' };
        }

        const lines = data.map((row: any) => {
          const status = row.is_active ? 'active' : 'inactive';
          return `[${status}] ${row.id} — ${row.context_type}.${row.context_key}: ${row.context_value}`;
        }).join('\n');

        return { type: 'config_success', tool: toolName, message: `Org AI context:\n${lines}` };
      }

      case 'update_org_context': {
        let contextId: string;
        const patch: Record<string, unknown> = {};
        try {
          contextId = requiredUuid(toolInput.context_id, 'context_id');
          const contextType = optionalEnum(toolInput.context_type, 'context_type', ORG_AI_CONTEXT_TYPES);
          const contextKey = optionalString(toolInput.context_key, 'context_key', { maxLength: 80, pattern: ORG_AI_CONTEXT_KEY_PATTERN });
          const contextValue = optionalString(toolInput.context_value, 'context_value', { maxLength: 4000 });
          if (contextType !== undefined) patch.context_type = contextType;
          if (contextKey !== undefined) patch.context_key = contextKey;
          if (contextValue !== undefined) patch.context_value = contextValue;
          if (toolInput.is_active !== undefined) {
            if (typeof toolInput.is_active !== 'boolean') throw new Error('is_active must be a boolean');
            patch.is_active = toolInput.is_active;
          }
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        if (Object.keys(patch).length === 0) {
          return { type: 'error', tool: toolName, message: 'No fields to update provided.' };
        }

        const { data, error } = await adminSupabase
          .from('org_ai_context')
          .update(patch)
          .eq('id', contextId)
          .eq('org_id', orgId)
          .select('id, context_key')
          .maybeSingle();
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data) return { type: 'error', tool: toolName, message: `AI context ${contextId} not found.` };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { context_id: contextId, fields: Object.keys(patch) },
        });
        return { type: 'config_success', tool: toolName, message: `AI context "${data.context_key}" updated.` };
      }

      case 'remove_org_context': {
        let contextId: string;
        let confirmed: boolean;
        const hardDelete = toolInput.hard_delete === true;
        try {
          contextId = requiredUuid(toolInput.context_id, 'context_id');
          confirmed = requiredBoolean(toolInput.confirm, 'confirm');
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }
        if (!confirmed) {
          return { type: 'error', tool: toolName, message: 'Removing AI context changes future assistant behavior. Call again with confirm=true to proceed.' };
        }

        const query = hardDelete
          ? adminSupabase.from('org_ai_context').delete()
          : adminSupabase.from('org_ai_context').update({ is_active: false });

        const { data, error } = await query
          .eq('id', contextId)
          .eq('org_id', orgId)
          .select('id, context_key');
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data || data.length === 0) return { type: 'error', tool: toolName, message: `AI context ${contextId} not found.` };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { context_id: contextId, hard_delete: hardDelete },
        });
        return {
          type: 'config_success',
          tool: toolName,
          message: hardDelete
            ? `AI context "${data[0].context_key}" deleted.`
            : `AI context "${data[0].context_key}" deactivated.`,
        };
      }

      case 'set_dashboard_layout': {
        let sections: DashboardSectionId[] = [];
        let hiddenSections: DashboardSectionId[] = [];
        try {
          if (toolInput.sections !== undefined) {
            InputValidator.validateArray(toolInput.sections, 'sections', { maxLength: DASHBOARD_SECTION_IDS.length });
            sections = (toolInput.sections as unknown[]).map((section, index) => {
              InputValidator.validateEnum(section, `sections[${index}]`, DASHBOARD_SECTION_IDS);
              return section as DashboardSectionId;
            });
          } else {
            sections = [...DASHBOARD_SECTION_IDS];
          }
          if (toolInput.hidden_sections !== undefined) {
            InputValidator.validateArray(toolInput.hidden_sections, 'hidden_sections', { maxLength: DASHBOARD_SECTION_IDS.length });
            hiddenSections = (toolInput.hidden_sections as unknown[]).map((section, index) => {
              InputValidator.validateEnum(section, `hidden_sections[${index}]`, DASHBOARD_SECTION_IDS);
              return section as DashboardSectionId;
            });
          }
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const { error } = await adminSupabase
          .from('org_view_config')
          .upsert({
            org_id: orgId,
            config_scope: 'dashboard',
            scope_key: 'main',
            config_value: { sections, hidden_sections: hiddenSections },
          }, { onConflict: 'org_id,config_scope,scope_key' });
        if (error) return { type: 'error', tool: toolName, message: error.message };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { sections, hidden_sections: hiddenSections },
        });
        return { type: 'config_success', tool: toolName, message: `Dashboard layout updated. ${hiddenSections.length ? `Hidden: ${hiddenSections.join(', ')}.` : 'All configured sections remain visible.'}` };
      }

      case 'set_module_default_view': {
        let moduleKey: string;
        let defaultView: GrantModuleView;
        try {
          moduleKey = optionalEnum(toolInput.module, 'module', ['grant_module'] as const) ?? (() => { throw new Error('module is required'); })();
          defaultView = optionalEnum(toolInput.default_view, 'default_view', GRANT_MODULE_VIEWS) ?? (() => { throw new Error('default_view is required'); })();
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const { error } = await adminSupabase
          .from('org_view_config')
          .upsert({
            org_id: orgId,
            config_scope: 'module_default',
            scope_key: moduleKey,
            config_value: { default_view: defaultView },
          }, { onConflict: 'org_id,config_scope,scope_key' });
        if (error) return { type: 'error', tool: toolName, message: error.message };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { module: moduleKey, default_view: defaultView },
        });
        return { type: 'config_success', tool: toolName, message: `Default view for ${moduleKey} set to ${defaultView}.` };
      }

      case 'set_table_columns': {
        let table: string;
        let columns: GrantsTableColumn[];
        try {
          table = optionalEnum(toolInput.table, 'table', ['grants_table'] as const) ?? (() => { throw new Error('table is required'); })();
          InputValidator.validateArray(toolInput.columns, 'columns', { maxLength: 40 });
          columns = (toolInput.columns as unknown[]).map((column, index) => {
            if (typeof column !== 'string') throw new Error(`columns[${index}] must be a string`);
            const valid = GRANTS_TABLE_COLUMNS.includes(column as any) || /^custom:[a-z][a-z0-9_]{0,63}$/.test(column);
            if (!valid) {
              throw new Error(`columns[${index}] must be one of ${GRANTS_TABLE_COLUMNS.join(', ')} or custom:field_key`);
            }
            return column as GrantsTableColumn;
          });
          if (columns.length === 0) throw new Error('columns must include at least one column');
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const { error } = await adminSupabase
          .from('org_view_config')
          .upsert({
            org_id: orgId,
            config_scope: 'table_columns',
            scope_key: table,
            config_value: { columns },
          }, { onConflict: 'org_id,config_scope,scope_key' });
        if (error) return { type: 'error', tool: toolName, message: error.message };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { table, columns },
        });
        return { type: 'config_success', tool: toolName, message: `Columns for ${table} set to: ${columns.join(', ')}.` };
      }

      case 'rename_entity': {
        let entityType: EntityVocabularyType;
        let singular: string;
        let plural: string | undefined;
        try {
          entityType = optionalEnum(toolInput.entity_type, 'entity_type', ENTITY_VOCABULARY_TYPES) ?? (() => { throw new Error('entity_type is required'); })();
          singular = requiredString(toolInput.singular, 'singular', { maxLength: 80 });
          plural = optionalString(toolInput.plural, 'plural', { maxLength: 100 });
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }
        const vocabulary = normalizeVocabulary({ singular, plural }, entityType);

        const { error } = await adminSupabase
          .from('org_view_config')
          .upsert({
            org_id: orgId,
            config_scope: 'entity_vocabulary',
            scope_key: `entity.${entityType}`,
            config_value: vocabulary,
          }, { onConflict: 'org_id,config_scope,scope_key' });
        if (error) return { type: 'error', tool: toolName, message: error.message };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { entity_type: entityType, ...vocabulary },
        });
        return { type: 'config_success', tool: toolName, message: `${entityType} will display as "${vocabulary.singular}" / "${vocabulary.plural}".` };
      }

      case 'list_view_config': {
        let scope: ViewConfigScope | undefined;
        try {
          scope = optionalEnum(toolInput.scope, 'scope', VIEW_CONFIG_SCOPES);
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        let query = adminSupabase
          .from('org_view_config')
          .select('id, config_scope, scope_key, config_value, updated_at')
          .eq('org_id', orgId)
          .order('config_scope')
          .order('scope_key');
        if (scope) query = query.eq('config_scope', scope);

        const { data, error } = await query;
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data || data.length === 0) {
          return { type: 'config_success', tool: toolName, message: scope ? `No view config found for ${scope}.` : 'No view config found for this org.' };
        }

        const lines = data.map((row: any) => {
          return `[${row.id}] ${row.config_scope}.${row.scope_key}: ${JSON.stringify(row.config_value)}`;
        }).join('\n');
        return { type: 'config_success', tool: toolName, message: `View config:\n${lines}` };
      }

      case 'summarize_org_configuration': {
        const [
          orgRes,
          modulesRes,
          workflowRes,
          customFieldsRes,
          automationRes,
          aiContextRes,
          viewConfigRes,
          portfoliosRes,
          reportTemplatesRes,
          historyRes,
        ] = await Promise.all([
          adminSupabase
            .from('organizations')
            .select('name, org_type, modules, branding, ai_instructions')
            .eq('id', orgId)
            .single(),
          getOrgEnabledModules(adminSupabase, orgId),
          adminSupabase
            .from('org_workflow_config')
            .select('module, config_type, stage_key, config_key, config_value, sort_order, updated_at')
            .eq('org_id', orgId)
            .order('module')
            .order('config_type')
            .order('stage_key')
            .order('sort_order'),
          adminSupabase
            .from('org_custom_field_definitions')
            .select('entity_type, field_key, field_label, field_type, required_at_stage, is_ai_readable, sort_order')
            .eq('org_id', orgId)
            .order('entity_type')
            .order('sort_order'),
          adminSupabase
            .from('org_automation_rules')
            .select('name, is_active, trigger_type, trigger_config, conditions, action_type, action_config, updated_at')
            .eq('org_id', orgId)
            .order('is_active', { ascending: false })
            .order('name'),
          adminSupabase
            .from('org_ai_context')
            .select('context_type, context_key, context_value, source, is_active')
            .eq('org_id', orgId)
            .order('context_type')
            .order('context_key'),
          adminSupabase
            .from('org_view_config')
            .select('config_scope, scope_key, config_value')
            .eq('org_id', orgId)
            .order('config_scope')
            .order('scope_key'),
          adminSupabase
            .from('portfolios')
            .select('id, name')
            .eq('org_id', orgId)
            .is('deleted_at', null)
            .order('created_at'),
          adminSupabase
            .from('report_templates')
            .select('id, portfolio_id, name, scope, config, is_default, updated_at, portfolios!inner(org_id, name)')
            .eq('portfolios.org_id', orgId)
            .order('updated_at', { ascending: false }),
          adminSupabase
            .from('builder_events')
            .select('event_type, tool_name, request_text, payload, created_at')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(10),
        ]);

        if (orgRes.error) return { type: 'error', tool: toolName, message: orgRes.error.message };
        if (workflowRes.error) return { type: 'error', tool: toolName, message: workflowRes.error.message };
        if (customFieldsRes.error) return { type: 'error', tool: toolName, message: customFieldsRes.error.message };
        if (automationRes.error) return { type: 'error', tool: toolName, message: automationRes.error.message };
        if (aiContextRes.error) return { type: 'error', tool: toolName, message: aiContextRes.error.message };
        if (viewConfigRes.error) return { type: 'error', tool: toolName, message: viewConfigRes.error.message };
        if (portfoliosRes.error) return { type: 'error', tool: toolName, message: portfoliosRes.error.message };
        if (reportTemplatesRes.error) return { type: 'error', tool: toolName, message: reportTemplatesRes.error.message };
        if (historyRes.error) return { type: 'error', tool: toolName, message: historyRes.error.message };

        const org = orgRes.data as any;
        const enabledModules = modulesRes.join(', ') || 'none';
        const lines = [
          `Configuration summary for ${org.name}`,
          '',
          'Organization',
          `- Type: ${org.org_type ?? 'unspecified'}`,
          `- Enabled modules: ${enabledModules}`,
          `- Branding: ${JSON.stringify(org.branding ?? {})}`,
          `- Legacy AI instructions: ${org.ai_instructions ? 'configured' : 'not configured'}`,
          `- Portfolios: ${formatConfigRows(portfoliosRes.data, (row) => `${row.name} (${row.id})`)}`,
          '',
          'Workflow Configuration',
          formatConfigRows(workflowRes.data, (row) => `- ${row.module}.${row.config_type}.${row.stage_key ?? 'global'}.${row.config_key}: ${JSON.stringify(row.config_value)}`),
          '',
          'Custom Fields',
          formatConfigRows(customFieldsRes.data, (row) => `- ${row.entity_type}.${row.field_key}: ${row.field_label} (${row.field_type})${row.required_at_stage ? ` required at ${row.required_at_stage}` : ''}${row.is_ai_readable ? ', AI-readable' : ''}`),
          '',
          'Automation Rules',
          formatConfigRows(automationRes.data, (row) => `- [${row.is_active ? 'active' : 'inactive'}] ${row.name}: ${row.trigger_type} -> ${row.action_type}`),
          '',
          'AI Context',
          formatConfigRows(aiContextRes.data, (row) => `- [${row.is_active ? 'active' : 'inactive'}] ${row.context_type}.${row.context_key}: ${row.context_value} (${row.source})`),
          '',
          'Views and Vocabulary',
          formatConfigRows(viewConfigRes.data, (row) => `- ${row.config_scope}.${row.scope_key}: ${JSON.stringify(row.config_value)}`),
          '',
          'Report Templates',
          formatConfigRows(reportTemplatesRes.data, (row) => `- ${row.name} (${row.scope}${row.is_default ? ', default' : ''}): ${JSON.stringify(row.config)}`),
          '',
          'Recent Builder History',
          formatConfigRows(historyRes.data, (row) => `- ${row.created_at}: ${row.event_type}${row.tool_name ? `/${row.tool_name}` : ''}${row.request_text ? ` — ${row.request_text}` : ''}`),
        ];

        return { type: 'config_success', tool: toolName, message: lines.join('\n') };
      }

      case 'list_builder_history': {
        let eventType: (typeof BUILDER_EVENT_TYPES)[number] | undefined;
        let limit = 20;
        try {
          eventType = optionalEnum(toolInput.event_type, 'event_type', BUILDER_EVENT_TYPES);
          if (toolInput.limit !== undefined && toolInput.limit !== null) {
            InputValidator.validateNumber(toolInput.limit, 'limit', { min: 1, max: 100 });
            limit = Math.trunc(Number(toolInput.limit));
          }
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        let query = adminSupabase
          .from('builder_events')
          .select('id, event_type, tool_name, request_text, payload, user_id, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (eventType) query = query.eq('event_type', eventType);

        const { data, error } = await query;
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data || data.length === 0) {
          return { type: 'config_success', tool: toolName, message: 'No Builder history found for this org.' };
        }

        const lines = data.map((row: any) => {
          const target = row.tool_name ? `/${row.tool_name}` : '';
          const payload = row.payload ? ` ${JSON.stringify(row.payload)}` : '';
          const request = row.request_text ? ` — ${row.request_text}` : '';
          return `[${row.created_at}] ${row.event_type}${target} by ${row.user_id ?? 'system'}${request}${payload}`;
        }).join('\n');
        return { type: 'config_success', tool: toolName, message: `Builder history:\n${lines}` };
      }

      case 'save_board_report_template': {
        let portfolioId: string;
        let name: string;
        let description: string | undefined;
        let logoUrl: string | undefined;
        let sections: string[];
        let includeCustomFields: boolean;
        let customFieldKeys: string[] = [];
        const isDefault = toolInput.is_default === true;

        try {
          portfolioId = await resolveOrgPortfolioId(adminSupabase, orgId, toolInput.portfolio_id);
          name = requiredString(toolInput.name, 'name', { maxLength: 160 });
          description = optionalString(toolInput.description, 'description', { maxLength: 1000 });
          logoUrl = validateUrl(toolInput.logo_url, 'logo_url');
          sections = validateStringArray(toolInput.sections, 'sections', BOARD_REPORT_SECTIONS, { maxLength: BOARD_REPORT_SECTIONS.length });
          if (sections.length === 0) sections = ['overview', 'financials', 'holdings', 'impact'];
          if (toolInput.include_custom_fields !== undefined && typeof toolInput.include_custom_fields !== 'boolean') {
            throw new Error('include_custom_fields must be a boolean');
          }
          includeCustomFields = toolInput.include_custom_fields === true;
          if (toolInput.custom_field_keys !== undefined && toolInput.custom_field_keys !== null) {
            InputValidator.validateArray(toolInput.custom_field_keys, 'custom_field_keys', { maxLength: 40 });
            customFieldKeys = (toolInput.custom_field_keys as unknown[]).map((key, index) => {
              if (typeof key !== 'string' || !CUSTOM_FIELD_KEY_PATTERN.test(key)) {
                throw new Error(`custom_field_keys[${index}] must be a valid custom field key`);
              }
              return key;
            });
          }
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        if (isDefault) {
          const { error: defaultErr } = await adminSupabase
            .from('report_templates')
            .update({ is_default: false })
            .eq('portfolio_id', portfolioId)
            .eq('scope', 'portfolio');
          if (defaultErr) return { type: 'error', tool: toolName, message: defaultErr.message };
        }

        const config = {
          report_type: 'board_report',
          logo_url: logoUrl ?? null,
          sections,
          content_order: sections,
          include_custom_fields: includeCustomFields,
          custom_field_keys: customFieldKeys,
        };

        const { data, error } = await adminSupabase
          .from('report_templates')
          .insert({
            portfolio_id: portfolioId,
            created_by: userId,
            name,
            description: description ?? null,
            scope: 'portfolio',
            config,
            is_default: isDefault,
          })
          .select('id, name')
          .single();
        if (error) return { type: 'error', tool: toolName, message: error.message };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { template_id: data.id, portfolio_id: portfolioId, sections, is_default: isDefault },
        });
        return { type: 'config_success', tool: toolName, message: `Board report template "${data.name}" saved with sections: ${sections.join(', ')}.` };
      }

      case 'list_board_report_templates': {
        let portfolioId: string | undefined;
        try {
          if (toolInput.portfolio_id !== undefined && toolInput.portfolio_id !== null) {
            portfolioId = await resolveOrgPortfolioId(adminSupabase, orgId, toolInput.portfolio_id);
          }
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        let query = adminSupabase
          .from('report_templates')
          .select('id, portfolio_id, name, description, scope, config, is_default, updated_at, portfolios!inner(org_id, name)')
          .eq('portfolios.org_id', orgId)
          .eq('scope', 'portfolio')
          .order('updated_at', { ascending: false });
        if (portfolioId) query = query.eq('portfolio_id', portfolioId);

        const { data, error } = await query;
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data || data.length === 0) {
          return { type: 'config_success', tool: toolName, message: 'No board report templates found for this org.' };
        }

        const lines = data.map((row: any) => {
          const portfolioName = row.portfolios?.name ?? row.portfolio_id;
          return `[${row.id}] ${row.name} — ${portfolioName}${row.is_default ? ' (default)' : ''}: ${JSON.stringify(row.config)}`;
        }).join('\n');
        return { type: 'config_success', tool: toolName, message: `Board report templates:\n${lines}` };
      }

      case 'submit_code_proposal': {
        let files: Array<{ path: string; content: string; diff: string }>;
        let summary: string;
        try {
          summary = requiredString(toolInput.request_summary, 'request_summary', { maxLength: 1000 });
          files = validateProposalFiles(toolInput.files);
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const { data, error } = await adminSupabase.from('builder_proposals').insert({
          org_id: orgId,
          requested_by: userId,
          request_text: requestText,
          proposal_type: 'code',
          code_state: 'plan_ready',
        }).select('id').single();

        if (error) return { type: 'error', tool: toolName, message: error.message };

        const proposalId = data.id as string;

        try {
          const manifestInput = files.map(f => ({ path: f.path, content: f.content }));
          const manifest = buildFileManifest(manifestInput);
          const diffText = buildUnifiedDiff(manifestInput);
          const contextPayload = { request_text: requestText, files: manifest.entries.map(e => e.path) };

          const revisionId = crypto.randomUUID();
          const prefix = artifactPrefix(orgId, proposalId, revisionId);

          const { error: revisionError } = await adminSupabase.from('builder_proposal_revisions').insert({
            id: revisionId,
            proposal_id: proposalId,
            revision_number: 1,
            kind: 'generic_submission',
            artifact_prefix: prefix,
            manifest_hash: manifestHash(manifest),
            diff_hash: sha256Hex(diffText),
            context_hash: sha256Hex(canonicalJson(contextPayload)),
            file_count: manifest.fileCount,
            total_bytes: manifest.totalBytes,
            created_by: userId,
          });
          if (revisionError) throw revisionError;

          await putJsonArtifact(adminSupabase, `${prefix}/${ARTIFACT_KEYS.files}`, { files });
          await putJsonArtifact(adminSupabase, `${prefix}/${ARTIFACT_KEYS.manifest}`, manifest);
          await putTextArtifact(adminSupabase, `${prefix}/${ARTIFACT_KEYS.diff}`, diffText, 'text/x-diff');
          await putJsonArtifact(adminSupabase, `${prefix}/${ARTIFACT_KEYS.context}`, contextPayload);

          const { error: updateError } = await adminSupabase.from('builder_proposals')
            .update({ current_revision_id: revisionId })
            .eq('id', proposalId);
          if (updateError) throw updateError;

          await emitBuilderEvent(adminSupabase, orgId, userId, 'proposal_created', {
            tool_name: toolName,
            payload: { proposalId, fileCount: files.length },
          });
          return {
            type: 'proposal_created',
            proposalId,
            summary,
            fileCount: files.length,
          };
        } catch (e) {
          await adminSupabase.from('builder_proposals').delete().eq('id', proposalId);
          throw e;
        }
      }

      case 'scaffold_module': {
        let description: string;
        try {
          description = requiredString(toolInput.description, 'description', { maxLength: 2000 });
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

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
        { "name": "org_id", "type": "uuid", "nullable": false }
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
          planContent = validateScaffoldPlanContent(JSON.parse(raw));
        } catch (e) {
          return { type: 'error', tool: toolName, message: `Plan validation failed: ${validationMessage(e)}` };
        }

        const { data: proposal, error: proposalError } = await adminSupabase
          .from('builder_proposals')
          .insert({
            org_id: orgId,
            requested_by: userId,
            request_text: requestText,
            proposal_type: 'code',
            code_state: 'plan_ready',
            plan_content: planContent,
          })
          .select('id')
          .single();

        if (proposalError || !proposal) {
          return { type: 'error', tool: toolName, message: proposalError?.message ?? 'Failed to create proposal.' };
        }

        await emitBuilderEvent(adminSupabase, orgId, userId, 'proposal_created', {
          tool_name: toolName,
          payload: { proposalId: proposal.id, description },
        });
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
        let templateId: string;
        let steps: Array<{ name: string; description?: string; order: number; required?: boolean }>;
        try {
          templateId = requiredUuid(toolInput.template_id, 'template_id');
          steps = validateWorkflowSteps(toolInput.steps);
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }
        // Fetch template and enforce org boundaries: cross-org is Forbidden, is_system triggers clone-on-write insert
        const { data: tmpl, error: fetchErr } = await adminSupabase.from('workflow_templates')
          .select('id, org_id, is_system, name, workflow_type, description, steps').eq('id', templateId).maybeSingle();
        if (fetchErr) return { type: 'error', tool: toolName, message: fetchErr.message };
        if (!tmpl) return { type: 'error', tool: toolName, message: `Workflow template ${templateId} not found` };
        if (tmpl.org_id && tmpl.org_id !== orgId) return { type: 'error', tool: toolName, message: 'Forbidden: that template belongs to another org' };
        // Clone-on-write: spec requires cloning for system templates (is_system=true) regardless of org ownership.
        // This prevents mutating shared system templates; org-owned system templates also get cloned per spec.
        if (!tmpl.org_id || tmpl.is_system) {
          const { data: cloned, error: cloneErr } = await adminSupabase.from('workflow_templates')
            .insert({ org_id: orgId, is_system: false, name: tmpl.name, workflow_type: tmpl.workflow_type, description: tmpl.description, steps })
            .select('id').single();
          if (cloneErr) return { type: 'error', tool: toolName, message: cloneErr.message };
          await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
            tool_name: toolName,
            payload: { template_id: templateId, step_count: steps.length },
          });
          return { type: 'config_success', tool: toolName, message: `System template cloned as org-specific template (id: ${cloned.id}) with ${steps.length} steps.` };
        }
        const { error: updateErr } = await adminSupabase.from('workflow_templates').update({ steps }).eq('id', templateId).eq('org_id', orgId);
        if (updateErr) return { type: 'error', tool: toolName, message: updateErr.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { template_id: templateId, step_count: steps.length },
        });
        return { type: 'config_success', tool: toolName, message: `Workflow template updated with ${steps.length} steps.` };
      }

      case 'list_proposals': {
        let codeState: typeof CODE_STATES[number] | undefined;
        try {
          codeState = optionalEnum(toolInput.code_state, 'code_state', CODE_STATES);
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        let query = adminSupabase
          .from('builder_proposals')
          .select('id, code_state, proposal_type, request_text, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (codeState) {
          query = query.eq('code_state', codeState);
        }

        const { data, error: fetchErr } = await query;
        if (fetchErr) return { type: 'error', tool: toolName, message: fetchErr.message };

        if (!data || data.length === 0) {
          return {
            type: 'config_success',
            tool: toolName,
            message: codeState ? `No proposals in state "${codeState}".` : 'No proposals found.',
          };
        }

        const lines = data.map(p => {
          const summary = (p.request_text as string | null)?.slice(0, 80) ?? '(no description)';
          const stateLabel = p.code_state ?? p.proposal_type;
          return `[${stateLabel}] ${(p.id as string).slice(0, 8)} — "${summary}"`;
        }).join('\n');

        return {
          type: 'config_success',
          tool: toolName,
          message: `${data.length} proposal(s):\n${lines}`,
        };
      }

      // ==================== WORKFLOW CONFIG ====================

      case 'add_checklist_item': {
        const { stage_key, item_key, label, required, sort_order = 0 } = toolInput as {
          stage_key: string; item_key: string; label: string; required: boolean; sort_order?: number;
        };

        if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
          return { type: 'error', tool: toolName, message: `Invalid stage_key: ${stage_key}. Must be one of: ${LIFECYCLE_STAGES.join(', ')}` };
        }
        if (!/^[a-z0-9_]+$/.test(item_key)) {
          return { type: 'error', tool: toolName, message: 'item_key must contain only lowercase letters, digits, and underscores.' };
        }
        if (item_key.length > 64) {
          return { type: 'error', tool: toolName, message: 'item_key must be 64 characters or fewer.' };
        }
        if (label.length > 200) {
          return { type: 'error', tool: toolName, message: 'label must be 200 characters or fewer.' };
        }

        const { data: hasModuleChecklist } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
        if (!hasModuleChecklist) return { type: 'error', tool: toolName, message: 'Grant management module is not enabled for this organization.' };

        const { error: checklistErr } = await supabase
          .from('org_workflow_config')
          .upsert({
            org_id: orgId,
            module: 'grant_management',
            config_type: 'stage_checklist',
            stage_key,
            config_key: item_key,
            config_value: { label, required },
            sort_order,
          }, { onConflict: 'org_id,module,config_type,stage_key,config_key' });

        if (checklistErr) return { type: 'error', tool: toolName, message: checklistErr.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { stage_key, item_key, required, sort_order },
        });
        return { type: 'config_success', tool: toolName, message: `Checklist item "${label}" added to ${stage_key}${required ? ' (required)' : ' (optional)'}.` };
      }

      case 'remove_checklist_item': {
        const { stage_key, item_key } = toolInput as { stage_key: string; item_key: string };

        if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
          return { type: 'error', tool: toolName, message: `Invalid stage_key: ${stage_key}.` };
        }

        const { data: hasModuleRmChecklist } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
        if (!hasModuleRmChecklist) return { type: 'error', tool: toolName, message: 'Grant management module is not enabled for this organization.' };

        const { error: rmChecklistErr } = await supabase
          .from('org_workflow_config')
          .delete()
          .eq('org_id', orgId)
          .eq('module', 'grant_management')
          .eq('config_type', 'stage_checklist')
          .eq('stage_key', stage_key)
          .eq('config_key', item_key);

        if (rmChecklistErr) return { type: 'error', tool: toolName, message: rmChecklistErr.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { stage_key, item_key },
        });
        return { type: 'config_success', tool: toolName, message: `Checklist item "${item_key}" removed from ${stage_key}. Existing completion records have been automatically deleted.` };
      }

      case 'set_required_field': {
        const { stage_key, field_name, error_message } = toolInput as {
          stage_key: string; field_name: string; error_message?: string;
        };

        if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
          return { type: 'error', tool: toolName, message: `Invalid stage_key: ${stage_key}.` };
        }
        if (!REQUIRED_FIELD_ALLOWLIST.includes(field_name as any)) {
          return { type: 'error', tool: toolName, message: `field_name must be one of: ${REQUIRED_FIELD_ALLOWLIST.join(', ')}` };
        }

        const { data: hasModuleReqField } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
        if (!hasModuleReqField) return { type: 'error', tool: toolName, message: 'Grant management module is not enabled.' };

        const configValueReqField: Record<string, string> = { field_name };
        if (error_message) configValueReqField.error_message = error_message;

        const { error: reqFieldErr } = await supabase
          .from('org_workflow_config')
          .upsert({
            org_id: orgId,
            module: 'grant_management',
            config_type: 'required_field',
            stage_key,
            config_key: field_name,
            config_value: configValueReqField,
            sort_order: 0,
          }, { onConflict: 'org_id,module,config_type,stage_key,config_key' });

        if (reqFieldErr) return { type: 'error', tool: toolName, message: reqFieldErr.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { stage_key, field_name, has_error_message: Boolean(error_message) },
        });
        return { type: 'config_success', tool: toolName, message: `Field "${field_name}" is now required before advancing past ${stage_key}.` };
      }

      case 'remove_required_field': {
        const { stage_key, field_name } = toolInput as { stage_key: string; field_name: string };

        if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
          return { type: 'error', tool: toolName, message: `Invalid stage_key: ${stage_key}.` };
        }
        if (!REQUIRED_FIELD_ALLOWLIST.includes(field_name as any)) {
          return { type: 'error', tool: toolName, message: `field_name must be one of: ${REQUIRED_FIELD_ALLOWLIST.join(', ')}` };
        }

        const { data: hasModuleRmReqField } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
        if (!hasModuleRmReqField) return { type: 'error', tool: toolName, message: 'Grant management module is not enabled.' };

        const { error: rmReqFieldErr } = await supabase
          .from('org_workflow_config')
          .delete()
          .eq('org_id', orgId)
          .eq('module', 'grant_management')
          .eq('config_type', 'required_field')
          .eq('stage_key', stage_key)
          .eq('config_key', field_name);

        if (rmReqFieldErr) return { type: 'error', tool: toolName, message: rmReqFieldErr.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { stage_key, field_name },
        });
        return { type: 'config_success', tool: toolName, message: `Required field rule for "${field_name}" at stage "${stage_key}" removed.` };
      }

      case 'rename_stage': {
        const { stage_key, label } = toolInput as { stage_key: string; label: string };

        if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
          return { type: 'error', tool: toolName, message: `Invalid stage_key: ${stage_key}.` };
        }
        if (label.length > 60) {
          return { type: 'error', tool: toolName, message: 'label must be 60 characters or fewer.' };
        }

        const { data: hasModuleRename } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
        if (!hasModuleRename) return { type: 'error', tool: toolName, message: 'Grant management module is not enabled.' };

        if (label === '') {
          const { error: deleteLabelErr } = await supabase
            .from('org_workflow_config')
            .delete()
            .eq('org_id', orgId)
            .eq('module', 'grant_management')
            .eq('config_type', 'stage_label')
            .eq('stage_key', stage_key)
            .eq('config_key', 'label');
          if (deleteLabelErr) return { type: 'error', tool: toolName, message: deleteLabelErr.message };
          await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
            tool_name: toolName,
            payload: { stage_key, cleared: true },
          });
          return { type: 'config_success', tool: toolName, message: `Stage "${stage_key}" label restored to system default.` };
        }

        const { error: renameErr } = await supabase
          .from('org_workflow_config')
          .upsert({
            org_id: orgId,
            module: 'grant_management',
            config_type: 'stage_label',
            stage_key,
            config_key: 'label',
            config_value: { value: label },
            sort_order: 0,
          }, { onConflict: 'org_id,module,config_type,stage_key,config_key' });

        if (renameErr) return { type: 'error', tool: toolName, message: renameErr.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { stage_key, label },
        });
        return { type: 'config_success', tool: toolName, message: `Stage "${stage_key}" will now display as "${label}".` };
      }

      case 'set_approval_requirement': {
        const { stage_key, required: approvalRequired, description: approvalDesc } = toolInput as {
          stage_key: string; required: boolean; description?: string;
        };

        if (!LIFECYCLE_STAGES.includes(stage_key as any)) {
          return { type: 'error', tool: toolName, message: `Invalid stage_key: ${stage_key}.` };
        }

        const { data: hasModuleApproval } = await supabase.rpc('org_has_module', { p_org_id: orgId, p_module: 'grant_management' });
        if (!hasModuleApproval) return { type: 'error', tool: toolName, message: 'Grant management module is not enabled.' };

        if (!approvalRequired) {
          const { error: deleteApprovalErr } = await supabase
            .from('org_workflow_config')
            .delete()
            .eq('org_id', orgId)
            .eq('module', 'grant_management')
            .eq('config_type', 'approval_requirement')
            .eq('stage_key', stage_key)
            .eq('config_key', 'default');
          if (deleteApprovalErr) return { type: 'error', tool: toolName, message: deleteApprovalErr.message };
          await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
            tool_name: toolName,
            payload: { stage_key, required: false },
          });
          return { type: 'config_success', tool: toolName, message: `Approval annotation removed for stage "${stage_key}".` };
        }

        const { error: approvalErr } = await supabase
          .from('org_workflow_config')
          .upsert({
            org_id: orgId,
            module: 'grant_management',
            config_type: 'approval_requirement',
            stage_key,
            config_key: 'default',
            config_value: { required: true, description: approvalDesc ?? '' },
            sort_order: 0,
          }, { onConflict: 'org_id,module,config_type,stage_key,config_key' });

        if (approvalErr) return { type: 'error', tool: toolName, message: approvalErr.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { stage_key, required: true, has_description: Boolean(approvalDesc) },
        });
        return { type: 'config_success', tool: toolName, message: `Approval annotation set for stage "${stage_key}": ${approvalDesc ?? '(no description)'}. Note: this is informational only and does not block transitions.` };
      }

      case 'list_workflow_config': {
        const { data: wfRows, error: wfErr } = await supabase
          .from('org_workflow_config')
          .select('config_type, stage_key, config_key, config_value, sort_order')
          .eq('org_id', orgId)
          .eq('module', 'grant_management')
          .order('stage_key')
          .order('sort_order');

        if (wfErr) return { type: 'error', tool: toolName, message: wfErr.message };
        if (!wfRows || wfRows.length === 0) {
          return { type: 'config_success', tool: toolName, message: 'No workflow configuration set for this organization. All stage transitions use system defaults.' };
        }

        // Group by stage
        const byStage = new Map<string, typeof wfRows>();
        for (const row of wfRows) {
          if (!byStage.has(row.stage_key)) byStage.set(row.stage_key, []);
          byStage.get(row.stage_key)!.push(row);
        }

        const lines: string[] = [];
        for (const [stage, stageRows] of byStage) {
          const labelRow = stageRows.find(r => r.config_type === 'stage_label');
          const labelSuffix = labelRow ? ` (label: "${(labelRow.config_value as any).value}")` : '';
          lines.push(`Stage: ${stage}${labelSuffix}`);

          const checklist = stageRows.filter(r => r.config_type === 'stage_checklist');
          if (checklist.length > 0) {
            lines.push('  Checklist items:');
            for (const c of checklist) {
              const cv = c.config_value as any;
              lines.push(`    [${cv.required ? 'required' : 'optional'}] ${c.config_key} — "${cv.label}"`);
            }
          }

          const requiredFields = stageRows.filter(r => r.config_type === 'required_field');
          if (requiredFields.length > 0) {
            lines.push('  Required fields:');
            for (const r of requiredFields) {
              const rv = r.config_value as any;
              lines.push(`    ${r.config_key}${rv.error_message ? ` — "${rv.error_message}"` : ''}`);
            }
          }

          const approval = stageRows.find(r => r.config_type === 'approval_requirement');
          if (approval) {
            const av = approval.config_value as any;
            lines.push(`  Approval: ${av.description || '(required, no description)'}`);
          }
          lines.push('');
        }

        return { type: 'config_success', tool: toolName, message: lines.join('\n') };
      }

      // ==================== CUSTOM FIELDS ====================

      case 'create_custom_field': {
        let entityType: CustomFieldEntityType;
        let fieldLabel: string;
        let fieldKey: string;
        let fieldType: CustomFieldType;
        let enumOptions: Array<{ value: string; label: string }> | null;
        let requiredAtStage: string | null;
        let isAiReadable: boolean;
        let sortOrder: number;

        try {
          entityType = optionalEnum(toolInput.entity_type, 'entity_type', CUSTOM_FIELD_ENTITY_TYPES) ?? (() => { throw new Error('entity_type is required'); })();
          fieldLabel = requiredString(toolInput.field_label, 'field_label', { maxLength: 120 });
          const inputKey = optionalString(toolInput.field_key, 'field_key', { maxLength: 64, pattern: CUSTOM_FIELD_KEY_PATTERN });
          fieldKey = inputKey ?? normalizeFieldKey(fieldLabel);
          fieldType = optionalEnum(toolInput.field_type, 'field_type', CUSTOM_FIELD_TYPES) ?? (() => { throw new Error('field_type is required'); })();
          enumOptions = validateCustomFieldEnumOptions(toolInput.enum_options);
          requiredAtStage = optionalEnum(toolInput.required_at_stage, 'required_at_stage', LIFECYCLE_STAGES) ?? null;
          if (requiredAtStage && entityType !== 'grant') throw new Error('required_at_stage is only supported for grant fields');
          if (fieldType === 'enum' && !enumOptions) throw new Error('enum_options is required for enum fields');
          if (fieldType !== 'enum' && enumOptions) throw new Error('enum_options is only supported for enum fields');
          if (toolInput.is_ai_readable !== undefined && typeof toolInput.is_ai_readable !== 'boolean') {
            throw new Error('is_ai_readable must be a boolean');
          }
          isAiReadable = toolInput.is_ai_readable as boolean | undefined ?? true;
          if (toolInput.sort_order !== undefined) InputValidator.validateNumber(toolInput.sort_order, 'sort_order', { min: -1000, max: 1000 });
          sortOrder = toolInput.sort_order === undefined ? 0 : Number(toolInput.sort_order);
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const { data, error } = await adminSupabase
          .from('org_custom_field_definitions')
          .insert({
            org_id: orgId,
            entity_type: entityType,
            field_key: fieldKey,
            field_label: fieldLabel,
            field_type: fieldType,
            enum_options: fieldType === 'enum' ? enumOptions : null,
            required_at_stage: requiredAtStage,
            is_ai_readable: isAiReadable,
            sort_order: sortOrder,
          })
          .select('id')
          .single();

        if (error) return { type: 'error', tool: toolName, message: error.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { field_id: data.id, entity_type: entityType, field_key: fieldKey, field_type: fieldType, required_at_stage: requiredAtStage },
        });
        return {
          type: 'config_success',
          tool: toolName,
          message: `Custom field "${fieldLabel}" (${fieldKey}) created for ${entityType}${requiredAtStage ? ` and required at ${requiredAtStage}` : ''}.`,
        };
      }

      case 'list_custom_fields': {
        let entityType: CustomFieldEntityType | undefined;
        try {
          entityType = optionalEnum(toolInput.entity_type, 'entity_type', CUSTOM_FIELD_ENTITY_TYPES);
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        let query = adminSupabase
          .from('org_custom_field_definitions')
          .select('id, entity_type, field_key, field_label, field_type, enum_options, required_at_stage, is_ai_readable, sort_order')
          .eq('org_id', orgId)
          .order('entity_type')
          .order('sort_order');
        if (entityType) query = query.eq('entity_type', entityType);

        const { data, error } = await query;
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data || data.length === 0) {
          return { type: 'config_success', tool: toolName, message: entityType ? `No custom fields found for ${entityType}.` : 'No custom fields found for this org.' };
        }

        const lines = data.map((field: any) => {
          const required = field.required_at_stage ? `, required at ${field.required_at_stage}` : '';
          const ai = field.is_ai_readable ? 'AI readable' : 'AI hidden';
          return `[${field.id}] ${field.entity_type}.${field.field_key} — ${field.field_label} (${field.field_type}, ${ai}${required})`;
        }).join('\n');

        return { type: 'config_success', tool: toolName, message: `Custom fields:\n${lines}` };
      }

      case 'update_custom_field': {
        let fieldId: string;
        const patch: Record<string, unknown> = {};
        try {
          fieldId = requiredUuid(toolInput.field_id, 'field_id');
          const fieldLabel = optionalString(toolInput.field_label, 'field_label', { maxLength: 120 });
          const fieldType = optionalEnum(toolInput.field_type, 'field_type', CUSTOM_FIELD_TYPES);
          const enumOptions = validateCustomFieldEnumOptions(toolInput.enum_options);
          const requiredAtStage = optionalEnum(toolInput.required_at_stage, 'required_at_stage', LIFECYCLE_STAGES);
          if (fieldLabel !== undefined) patch.field_label = fieldLabel;
          if (fieldType !== undefined) patch.field_type = fieldType;
          if (toolInput.enum_options !== undefined) patch.enum_options = enumOptions;
          if (toolInput.required_at_stage !== undefined) patch.required_at_stage = requiredAtStage ?? null;
          if (toolInput.is_ai_readable !== undefined) {
            if (typeof toolInput.is_ai_readable !== 'boolean') throw new Error('is_ai_readable must be a boolean');
            patch.is_ai_readable = toolInput.is_ai_readable;
          }
          if (toolInput.sort_order !== undefined) {
            InputValidator.validateNumber(toolInput.sort_order, 'sort_order', { min: -1000, max: 1000 });
            patch.sort_order = Number(toolInput.sort_order);
          }
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        if (Object.keys(patch).length === 0) {
          return { type: 'error', tool: toolName, message: 'No fields to update provided.' };
        }

        const { data: existing, error: fetchErr } = await adminSupabase
          .from('org_custom_field_definitions')
          .select('id, entity_type')
          .eq('id', fieldId)
          .eq('org_id', orgId)
          .maybeSingle();
        if (fetchErr) return { type: 'error', tool: toolName, message: fetchErr.message };
        if (!existing) return { type: 'error', tool: toolName, message: `Custom field ${fieldId} not found.` };
        if (patch.required_at_stage && existing.entity_type !== 'grant') {
          return { type: 'error', tool: toolName, message: 'required_at_stage is only supported for grant fields.' };
        }

        const { error } = await adminSupabase
          .from('org_custom_field_definitions')
          .update(patch)
          .eq('id', fieldId)
          .eq('org_id', orgId);
        if (error) return { type: 'error', tool: toolName, message: error.message };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { field_id: fieldId, fields: Object.keys(patch) },
        });
        return { type: 'config_success', tool: toolName, message: `Custom field ${fieldId} updated.` };
      }

      case 'remove_custom_field': {
        let fieldId: string;
        let confirmed: boolean;
        try {
          fieldId = requiredUuid(toolInput.field_id, 'field_id');
          confirmed = requiredBoolean(toolInput.confirm, 'confirm');
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }
        if (!confirmed) {
          return {
            type: 'error',
            tool: toolName,
            message: 'Deleting a custom field removes all stored values. Call remove_custom_field again with confirm=true to proceed.',
          };
        }

        const { data, error } = await adminSupabase
          .from('org_custom_field_definitions')
          .delete()
          .eq('id', fieldId)
          .eq('org_id', orgId)
          .select('id, field_key');
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data || data.length === 0) return { type: 'error', tool: toolName, message: `Custom field ${fieldId} not found.` };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { field_id: fieldId, deleted: true },
        });
        return { type: 'config_success', tool: toolName, message: `Custom field "${data[0].field_key}" deleted. Stored values were removed by cascade.` };
      }

      // ==================== AUTOMATION RULES ====================

      case 'create_automation_rule': {
        let name: string;
        let triggerType: AutomationTriggerType;
        let actionType: AutomationActionType;
        let triggerConfig: Record<string, unknown>;
        let actionConfig: Record<string, unknown>;
        let conditions: Array<Record<string, unknown>>;
        let isActive: boolean;

        try {
          name = requiredString(toolInput.name, 'name', { maxLength: 160 });
          triggerType = optionalEnum(toolInput.trigger_type, 'trigger_type', AUTOMATION_TRIGGER_TYPES) ?? (() => { throw new Error('trigger_type is required'); })();
          actionType = optionalEnum(toolInput.action_type, 'action_type', AUTOMATION_ACTION_TYPES) ?? (() => { throw new Error('action_type is required'); })();
          if (!toolInput.trigger_config || typeof toolInput.trigger_config !== 'object' || Array.isArray(toolInput.trigger_config)) {
            throw new Error('trigger_config must be an object');
          }
          if (!toolInput.action_config || typeof toolInput.action_config !== 'object' || Array.isArray(toolInput.action_config)) {
            throw new Error('action_config must be an object');
          }
          triggerConfig = toolInput.trigger_config as Record<string, unknown>;
          actionConfig = toolInput.action_config as Record<string, unknown>;
          if (toolInput.conditions === undefined || toolInput.conditions === null) {
            conditions = [];
          } else {
            InputValidator.validateArray(toolInput.conditions, 'conditions', { maxLength: 25 });
            conditions = toolInput.conditions as Array<Record<string, unknown>>;
          }
          if (triggerType === 'grant_stage_change') {
            InputValidator.validateEnum(triggerConfig.stage, 'trigger_config.stage', LIFECYCLE_STAGES);
          } else if (triggerType === 'date_relative') {
            InputValidator.validateEnum(triggerConfig.entity_type, 'trigger_config.entity_type', ['grant'] as const);
            requiredString(triggerConfig.anchor, 'trigger_config.anchor', { maxLength: 80, pattern: /^[a-z][a-z0-9_]{0,79}$/ });
            InputValidator.validateNumber(triggerConfig.offset_days, 'trigger_config.offset_days', { min: -3650, max: 3650 });
          } else if (triggerType === 'custom_field_set') {
            InputValidator.validateEnum(triggerConfig.entity_type, 'trigger_config.entity_type', CUSTOM_FIELD_ENTITY_TYPES);
            requiredString(triggerConfig.field_key, 'trigger_config.field_key', { maxLength: 64, pattern: CUSTOM_FIELD_KEY_PATTERN });
          } else if (triggerType === 'task_completed') {
            requiredString(triggerConfig.task_type, 'trigger_config.task_type', { maxLength: 80, pattern: /^[a-z][a-z0-9_]{0,79}$/ });
          }
          if (actionType === 'create_task') {
            requiredString(actionConfig.title_template, 'action_config.title_template', { maxLength: 240 });
            if (actionConfig.description_template !== undefined) {
              optionalString(actionConfig.description_template, 'action_config.description_template', { maxLength: 2000, allowEmpty: true });
            }
            if (actionConfig.due_days !== undefined) {
              InputValidator.validateNumber(actionConfig.due_days, 'action_config.due_days', { min: -365, max: 3650 });
            }
            if (actionConfig.priority !== undefined) {
              InputValidator.validateEnum(actionConfig.priority, 'action_config.priority', ['low', 'normal', 'high', 'urgent'] as const);
            }
            if (actionConfig.task_type !== undefined) {
              InputValidator.validateEnum(actionConfig.task_type, 'action_config.task_type', ['task', 'reminder', 'follow_up', 'review', 'approval', 'checklist_step'] as const);
            }
            if (actionConfig.assignee_field !== undefined) {
              InputValidator.validateEnum(actionConfig.assignee_field, 'action_config.assignee_field', ['internal_owner_id', 'assigned_to'] as const);
            }
          } else if (actionType === 'notify_member') {
            requiredString(actionConfig.message_template, 'action_config.message_template', { maxLength: 2000 });
            if (actionConfig.title_template !== undefined) {
              optionalString(actionConfig.title_template, 'action_config.title_template', { maxLength: 240, allowEmpty: true });
            }
            if (actionConfig.recipient_user_id !== undefined) {
              requiredUuid(actionConfig.recipient_user_id, 'action_config.recipient_user_id');
            }
            if (actionConfig.recipient_field !== undefined) {
              InputValidator.validateEnum(actionConfig.recipient_field, 'action_config.recipient_field', ['internal_owner_id', 'assigned_to', 'actor_id'] as const);
            }
            if (!actionConfig.recipient_user_id && !actionConfig.recipient_field) {
              throw new Error('notify_member requires recipient_user_id or recipient_field');
            }
          } else if (actionType === 'set_custom_field') {
            requiredString(actionConfig.field_key, 'action_config.field_key', { maxLength: 64, pattern: CUSTOM_FIELD_KEY_PATTERN });
            InputValidator.validateRequired(actionConfig.value, 'action_config.value');
            if (actionConfig.entity_type !== undefined) {
              InputValidator.validateEnum(actionConfig.entity_type, 'action_config.entity_type', CUSTOM_FIELD_ENTITY_TYPES);
            }
          }
          if (toolInput.is_active !== undefined && typeof toolInput.is_active !== 'boolean') {
            throw new Error('is_active must be a boolean');
          }
          isActive = toolInput.is_active as boolean | undefined ?? true;
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const { data, error } = await adminSupabase
          .from('org_automation_rules')
          .insert({
            org_id: orgId,
            name,
            is_active: isActive,
            trigger_type: triggerType,
            trigger_config: triggerConfig,
            conditions,
            action_type: actionType,
            action_config: actionConfig,
            created_by: userId,
          })
          .select('id')
          .single();

        if (error) return { type: 'error', tool: toolName, message: error.message };
        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { rule_id: data.id, trigger_type: triggerType, action_type: actionType, is_active: isActive },
        });
        return { type: 'config_success', tool: toolName, message: `Automation rule "${name}" created${isActive ? '' : ' as inactive'} (id: ${data.id}).` };
      }

      case 'list_automation_rules': {
        const includeInactive = toolInput.include_inactive === true;
        let query = adminSupabase
          .from('org_automation_rules')
          .select('id, name, is_active, trigger_type, trigger_config, action_type, action_config, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false });
        if (!includeInactive) query = query.eq('is_active', true);

        const { data, error } = await query;
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data || data.length === 0) {
          return { type: 'config_success', tool: toolName, message: includeInactive ? 'No automation rules found.' : 'No active automation rules found.' };
        }

        const lines = data.map((rule: any) => {
          return `[${rule.is_active ? 'active' : 'inactive'}] ${rule.id} — ${rule.name} (${rule.trigger_type} -> ${rule.action_type})`;
        }).join('\n');
        return { type: 'config_success', tool: toolName, message: `Automation rules:\n${lines}` };
      }

      case 'enable_automation_rule':
      case 'disable_automation_rule': {
        let ruleId: string;
        try {
          ruleId = requiredUuid(toolInput.rule_id, 'rule_id');
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }

        const enabled = toolName === 'enable_automation_rule';
        const { data, error } = await adminSupabase
          .from('org_automation_rules')
          .update({ is_active: enabled })
          .eq('id', ruleId)
          .eq('org_id', orgId)
          .select('id, name')
          .maybeSingle();
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data) return { type: 'error', tool: toolName, message: `Automation rule ${ruleId} not found.` };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { rule_id: ruleId, enabled },
        });
        return { type: 'config_success', tool: toolName, message: `Automation rule "${data.name}" ${enabled ? 'enabled' : 'disabled'}.` };
      }

      case 'remove_automation_rule': {
        let ruleId: string;
        let confirmed: boolean;
        try {
          ruleId = requiredUuid(toolInput.rule_id, 'rule_id');
          confirmed = requiredBoolean(toolInput.confirm, 'confirm');
        } catch (e) {
          return { type: 'error', tool: toolName, message: validationMessage(e) };
        }
        if (!confirmed) {
          return { type: 'error', tool: toolName, message: 'Deleting an automation rule stops future runs. Call again with confirm=true to proceed.' };
        }

        const { data, error } = await adminSupabase
          .from('org_automation_rules')
          .delete()
          .eq('id', ruleId)
          .eq('org_id', orgId)
          .select('id, name');
        if (error) return { type: 'error', tool: toolName, message: error.message };
        if (!data || data.length === 0) return { type: 'error', tool: toolName, message: `Automation rule ${ruleId} not found.` };

        await emitBuilderEvent(adminSupabase, orgId, userId, 'tool_call', {
          tool_name: toolName,
          payload: { rule_id: ruleId, deleted: true },
        });
        return { type: 'config_success', tool: toolName, message: `Automation rule "${data[0].name}" deleted.` };
      }

      default:
        return { type: 'error', tool: toolName, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    return { type: 'error', tool: toolName, message };
  }
}
