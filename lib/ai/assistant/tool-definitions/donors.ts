import type { ToolDefinition } from '@/lib/ai/types';

export const DONOR_TOOLS: ToolDefinition[] = [
  // ==================== DONOR MANAGEMENT MODULE ====================
  {
    name: 'log_contribution_received',
    description:
      'Log a donation received by the organization. Optionally auto-creates donor record if not found. Can automatically generate a receipt for contributions >= $250.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: {
          type: 'string',
          description: 'Organization UUID receiving the donation',
        },
        amount: { type: 'number', description: 'Donation amount in USD' },
        contribution_date: {
          type: 'string',
          description: 'Date of contribution (YYYY-MM-DD, defaults to today)',
        },
        gift_type: {
          type: 'string',
          enum: [
            'cash',
            'check',
            'credit_card',
            'securities',
            'daf_grant',
            'in_kind',
            'pledge',
            'bequest',
          ],
          description:
            'Type of gift stored on contributions_received.gift_type (default: cash)',
        },
        contribution_type: {
          type: 'string',
          enum: [
            'cash',
            'check',
            'credit_card',
            'wire',
            'ach',
            'stock',
            'crypto',
            'real_estate',
            'in_kind',
            'other',
          ],
          description:
            'Legacy alias for gift_type. Prefer gift_type for new calls.',
        },
        donor_id: {
          type: 'string',
          description:
            'Existing donor UUID (optional - provide donor info to auto-create)',
        },
        donor_name: {
          type: 'string',
          description:
            'Donor name for auto-creation (e.g., "John Smith" or "Smith Foundation")',
        },
        donor_email: {
          type: 'string',
          description: 'Donor email for auto-creation',
        },
        donor_type: {
          type: 'string',
          enum: [
            'individual',
            'foundation',
            'corporation',
            'government',
            'other',
          ],
          description: 'Type of donor (default: individual)',
        },
        designation: {
          type: 'string',
          description:
            'Fund designation (e.g., "General Fund", "Building Campaign")',
        },
        is_restricted: {
          type: 'boolean',
          description: 'Whether the gift is restricted',
        },
        quid_pro_quo_value: {
          type: 'number',
          description:
            'Value of goods/services provided in exchange (IRS requirement)',
        },
        campaign: { type: 'string', description: 'Campaign or appeal name' },
        notes: { type: 'string', description: 'Additional notes' },
        auto_generate_receipt: {
          type: 'boolean',
          description:
            'Automatically generate receipt for contributions >= $250',
        },
      },
      required: ['organization_id', 'amount'],
    },
  },
  {
    name: 'generate_receipt',
    description:
      'Generate an IRS-compliant tax receipt for a contribution. Required for donations >= $250.',
    input_schema: {
      type: 'object',
      properties: {
        contribution_id: {
          type: 'string',
          description: 'Contribution UUID to generate receipt for',
        },
        send_immediately: {
          type: 'boolean',
          description: 'Send receipt to donor immediately (default: false)',
        },
      },
      required: ['contribution_id'],
    },
  },
  {
    name: 'generate_acknowledgment',
    description:
      'Create a thank-you letter or acknowledgment for a donor. Can be for a specific contribution or general.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'Organization UUID' },
        donor_id: { type: 'string', description: 'Donor UUID to acknowledge' },
        contribution_id: {
          type: 'string',
          description: 'Optional: specific contribution to acknowledge',
        },
        letter_type: {
          type: 'string',
          enum: ['thank_you', 'annual_summary', 'welcome', 'custom'],
          description: 'Type of acknowledgment letter (default: thank_you)',
        },
        custom_message: {
          type: 'string',
          description: 'Custom message to include in the letter',
        },
        send_via: {
          type: 'string',
          enum: ['email', 'mail', 'both'],
          description: 'How to send the acknowledgment (default: email)',
        },
      },
      required: ['organization_id', 'donor_id'],
    },
  },
  {
    name: 'get_donor_summary',
    description:
      'Get a comprehensive donor profile including giving history, communications, and status.',
    input_schema: {
      type: 'object',
      properties: {
        donor_id: { type: 'string', description: 'Donor UUID' },
        include_contributions: {
          type: 'boolean',
          description: 'Include detailed contribution history (default: true)',
        },
        include_communications: {
          type: 'boolean',
          description: 'Include communication log (default: true)',
        },
        year: {
          type: 'number',
          description: 'Filter contributions to specific year',
        },
      },
      required: ['donor_id'],
    },
  },
  {
    name: 'search_donors',
    description: 'Search and filter donors by various criteria.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', description: 'Organization UUID' },
        name: {
          type: 'string',
          description: 'Search by donor name (partial match)',
        },
        email: { type: 'string', description: 'Search by email' },
        donor_type: {
          type: 'string',
          enum: [
            'individual',
            'foundation',
            'corporation',
            'government',
            'other',
          ],
          description: 'Filter by donor type',
        },
        donor_tier: {
          type: 'string',
          enum: ['major', 'mid', 'recurring', 'annual', 'lapsed', 'prospect'],
          description: 'Filter by giving tier',
        },
        recency_status: {
          type: 'string',
          enum: ['active', 'lapsed', 'lost'],
          description: 'Filter by recency status',
        },
        min_lifetime_giving: {
          type: 'number',
          description: 'Minimum lifetime giving amount',
        },
        has_pending_receipts: {
          type: 'boolean',
          description: 'Filter to donors with pending receipts',
        },
        has_pending_acknowledgments: {
          type: 'boolean',
          description: 'Filter to donors needing acknowledgment',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 50)',
        },
      },
      required: ['organization_id'],
    },
  },
];
