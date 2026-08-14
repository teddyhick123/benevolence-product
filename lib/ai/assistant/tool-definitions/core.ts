import type { ToolDefinition } from '@/lib/ai/types';
import { CUSTOM_FIELD_ENTITY_TYPES } from '@/lib/custom-fields';
import { ORG_AI_CONTEXT_TYPES } from '@/lib/organizations/ai-context';

export const CORE_TOOLS: ToolDefinition[] = [
  {
    name: 'add_holding',
    description: 'Create a new holding/investment in the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the holding' },
        sector: { type: 'string', description: 'Industry sector (optional)' },
        country: {
          type: 'string',
          description: 'Country of operation (optional)',
        },
        funds_allocated: {
          type: 'number',
          description: 'Amount invested in USD (optional)',
        },
        status: {
          type: 'string',
          enum: ['Active', 'Exited', 'Pipeline'],
          description: 'Status of the holding (optional)',
        },
        description: {
          type: 'string',
          description: 'Description of the holding (optional)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_holding',
    description: 'Update an existing holding',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'UUID of the holding to update',
        },
        changes: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            name: { type: 'string' },
            sector: { type: 'string' },
            country: { type: 'string' },
            funds_allocated: { type: 'number' },
            status: { type: 'string', enum: ['Active', 'Exited', 'Pipeline'] },
            description: { type: 'string' },
          },
        },
      },
      required: ['holding_id', 'changes'],
    },
  },
  {
    name: 'remove_holding',
    description: 'Delete a holding from the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'UUID of the holding to remove',
        },
        reason: {
          type: 'string',
          description: 'Reason for removal (optional)',
        },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'list_holdings',
    description: 'Get a list of all holdings in the portfolio',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['Active', 'Exited', 'Pipeline'],
          description: 'Filter by status (optional)',
        },
      },
    },
  },
  {
    name: 'search_holdings',
    description:
      'Search and filter holdings by multiple criteria. Use this for queries like "find all solar holdings" or "holdings with allocation over 1M"',
    input_schema: {
      type: 'object',
      properties: {
        sector: {
          type: 'string',
          description: 'Filter by sector (partial match)',
        },
        country: { type: 'string', description: 'Filter by country' },
        status: {
          type: 'string',
          enum: ['Active', 'Exited', 'Pipeline'],
          description: 'Filter by status',
        },
        min_allocation: {
          type: 'number',
          description: 'Minimum funds allocated',
        },
        max_allocation: {
          type: 'number',
          description: 'Maximum funds allocated',
        },
        name_contains: {
          type: 'string',
          description: 'Filter by name (partial match)',
        },
      },
    },
  },
  {
    name: 'get_portfolio_summary',
    description:
      'Get a comprehensive summary of portfolio performance including KPIs, sector breakdown, and top holdings. Use for questions like "how is the portfolio doing?" or "give me an overview"',
    input_schema: {
      type: 'object',
      properties: {
        include_kpis: {
          type: 'boolean',
          description: 'Include KPI performance (default: true)',
        },
        include_sectors: {
          type: 'boolean',
          description: 'Include sector breakdown (default: true)',
        },
        include_top_holdings: {
          type: 'boolean',
          description: 'Include top holdings by allocation (default: true)',
        },
      },
    },
  },
  {
    name: 'get_holding_details',
    description: 'Get detailed information about a specific holding',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'UUID of the holding' },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'get_custom_fields',
    description:
      'Get AI-readable custom field definitions and current values for a grant, holding, donor, or contribution.',
    input_schema: {
      type: 'object',
      properties: {
        entity_type: {
          type: 'string',
          enum: [...CUSTOM_FIELD_ENTITY_TYPES],
          description: 'Entity type that owns the custom fields.',
        },
        entity_id: {
          type: 'string',
          description: 'UUID of the entity.',
        },
      },
      required: ['entity_type', 'entity_id'],
    },
  },
  {
    name: 'search_custom_field_values',
    description:
      'Find entities by an AI-readable custom field value. Use for questions like "active grants with alignment score below 3".',
    input_schema: {
      type: 'object',
      properties: {
        entity_type: {
          type: 'string',
          enum: [...CUSTOM_FIELD_ENTITY_TYPES],
          description: 'Entity type to search.',
        },
        field_key: {
          type: 'string',
          description: 'Custom field key, e.g. strategic_alignment_score.',
        },
        operator: {
          type: 'string',
          enum: ['eq', 'contains', 'lt', 'lte', 'gt', 'gte'],
          description:
            'Comparison operator. Numeric/date fields support lt/lte/gt/gte; text supports contains/eq.',
        },
        value: {
          type: ['string', 'number', 'boolean'],
          description: 'Value to compare against.',
        },
        lifecycle_stage: {
          type: 'string',
          description:
            'Optional grant lifecycle stage filter when entity_type is grant.',
        },
        limit: {
          type: 'number',
          description: 'Maximum matches to return (default 25, max 100).',
        },
      },
      required: ['entity_type', 'field_key', 'operator', 'value'],
    },
  },
  {
    name: 'suggest_context_entry',
    description:
      'Persist an org-specific AI context entry after explicit user confirmation or a direct "remember this" request. Do not call this tool merely because you noticed a pattern; ask for confirmation first.',
    input_schema: {
      type: 'object',
      properties: {
        context_type: {
          type: 'string',
          enum: [...ORG_AI_CONTEXT_TYPES],
          description: 'Kind of context to remember.',
        },
        context_key: {
          type: 'string',
          description:
            'Stable snake_case key, e.g. grant_vocabulary or site_visit_policy.',
        },
        context_value: {
          type: 'string',
          description:
            'Human-readable context the assistant should apply in future sessions.',
        },
        reasoning: {
          type: 'string',
          description: 'Why this context is useful to remember.',
        },
      },
      required: ['context_type', 'context_key', 'context_value', 'reasoning'],
    },
  },
];
