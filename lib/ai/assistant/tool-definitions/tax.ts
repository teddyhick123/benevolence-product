import type { ToolDefinition } from '@/lib/ai/types';

export const TAX_TOOLS: ToolDefinition[] = [
  // ==================== TAX OPTIMIZATION MODULE ====================
  {
    name: 'run_tax_scenario',
    description:
      'Compare different donation strategies (cash vs stock, timing, etc.) for tax optimization',
    input_schema: {
      type: 'object',
      properties: {
        scenario_type: {
          type: 'string',
          enum: ['cash_vs_stock', 'timing', 'bunching', 'daf_vs_direct'],
          description: 'Type of tax scenario to run',
        },
        donation_amount: {
          type: 'number',
          description: 'Total donation amount to analyze',
        },
        tax_year: {
          type: 'number',
          description: 'Tax year for the scenario (default: current year)',
        },
        assets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              current_value: { type: 'number' },
              cost_basis: { type: 'number' },
              holding_period: { type: 'string', enum: ['short', 'long'] },
            },
          },
          description: 'Assets available for donation (for cash_vs_stock)',
        },
      },
      required: ['scenario_type', 'donation_amount'],
    },
  },
  {
    name: 'calculate_deduction',
    description: 'Calculate the tax deduction for a charitable contribution',
    input_schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Contribution amount',
        },
        asset_type: {
          type: 'string',
          enum: [
            'cash',
            'public_stock',
            'private_stock',
            'real_estate',
            'other',
          ],
          description: 'Type of asset being donated',
        },
        recipient_type: {
          type: 'string',
          enum: ['public_charity', 'private_foundation', 'daf'],
          description: 'Type of recipient organization',
        },
        agi: {
          type: 'number',
          description:
            'Adjusted Gross Income. Required for accurate calculation — if not provided, a placeholder value is used until tax year data is configured.',
        },
      },
      required: ['amount', 'asset_type', 'recipient_type'],
    },
  },
  {
    name: 'get_carryforward',
    description:
      'Get carryforward amounts from prior year charitable contributions',
    input_schema: {
      type: 'object',
      properties: {
        tax_year: {
          type: 'number',
          description:
            'Tax year to check carryforwards for (default: current year)',
        },
      },
    },
  },
];
