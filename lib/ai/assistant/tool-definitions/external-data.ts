import type { ToolDefinition } from '@/lib/ai/types';

export const EXTERNAL_DATA_TOOLS: ToolDefinition[] = [
  // ==================== EXTERNAL DATA MODULE ====================
  {
    name: 'refresh_charity_data',
    description:
      'Fetch latest data from Charity Navigator and Candid for a holding/charity',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'UUID of the holding to refresh data for',
        },
        ein: {
          type: 'string',
          description: 'EIN of the charity (alternative to holding_id)',
        },
      },
    },
  },
  {
    name: 'search_similar_charities',
    description:
      'Find charities similar to a given holding based on sector, size, or mission',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'UUID of the holding to find similar charities for',
        },
        sector: {
          type: 'string',
          description: 'Sector to search within (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 5)',
        },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'get_charity_financials',
    description:
      'Get detailed financial information for a charity from external sources',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'UUID of the holding',
        },
        ein: {
          type: 'string',
          description: 'EIN of the charity (alternative to holding_id)',
        },
      },
    },
  },
];
