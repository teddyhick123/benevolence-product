import type { ToolDefinition } from '@/lib/ai/types';

export const COMPLIANCE_TOOLS: ToolDefinition[] = [
  // ==================== COMPLIANCE & REGULATORY MODULE ====================
  {
    name: 'get_compliance_status',
    description:
      'Get overall compliance health summary for an organization: filing overdue counts, self-dealing incidents, state renewal status, payout status, and health score (0-100). Use this to answer "How are we doing on compliance?" or "What compliance issues do we have?"',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: {
          type: 'string',
          description: 'UUID of the organization',
        },
        portfolio_id: {
          type: 'string',
          description: 'UUID of the portfolio (for payout status)',
        },
        tax_year: {
          type: 'number',
          description: 'Tax year for payout status (default: current year)',
        },
      },
      required: ['organization_id'],
    },
  },
  {
    name: 'calculate_payout_requirement',
    description:
      'Calculate the IRC §4942 minimum distribution requirement (5% of average net investment assets) for a private foundation. Shows full calculation: net value of non-charitable assets × 5% = MIR, minus excise tax = distributable amount. Use when asked about payout requirements or how much must be distributed.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        tax_year: {
          type: 'number',
          description: 'Tax year (default: current year)',
        },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'get_payout_forecast',
    description:
      'Forecast how much more a foundation must grant by year-end to meet §4942 requirements. Shows distributions already made, pending pipeline grants, and remaining shortfall. Use when asked "How much more do we need to grant?" or "Are we on track for our payout requirement?"',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        tax_year: {
          type: 'number',
          description: 'Tax year (default: current year)',
        },
        include_pending: {
          type: 'boolean',
          description:
            'Whether to include approved/scheduled grant payments in the pipeline (default: true)',
        },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'screen_for_self_dealing',
    description:
      'Pre-screen a proposed transaction against the §4946 disqualified persons registry. Provide the counterparty name and/or EIN. Returns risk level (none/medium/high) and matching disqualified persons. Can optionally create a self_dealing_incidents record flagged for review.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: {
          type: 'string',
          description: 'UUID of the organization',
        },
        counterparty_name: {
          type: 'string',
          description: 'Name of the other party in the transaction',
        },
        counterparty_ein: {
          type: 'string',
          description: 'EIN of the other party (optional)',
        },
        transaction_type: {
          type: 'string',
          enum: [
            'sale_or_exchange',
            'loan_or_extension_of_credit',
            'furnishing_goods_services',
            'payment_of_compensation',
            'transfer_or_use_of_assets',
            'agreement_to_pay_money',
            'indirect_self_dealing',
          ],
          description: 'Type of transaction to screen',
        },
        amount: {
          type: 'number',
          description: 'Dollar amount of the transaction (optional)',
        },
        create_incident_if_flagged: {
          type: 'boolean',
          description:
            'If true and a match is found, create a self_dealing_incidents record (default: false)',
        },
        incident_date: {
          type: 'string',
          description:
            'Date of the proposed transaction (YYYY-MM-DD, default: today)',
        },
        description: {
          type: 'string',
          description: 'Description of the transaction',
        },
      },
      required: ['organization_id', 'counterparty_name'],
    },
  },
  {
    name: 'register_disqualified_person',
    description:
      'Add a person or entity to the §4946 disqualified persons registry. Required for foundation managers, substantial contributors (≥$5,000 and ≥2% of total contributions), 20%+ owners, family members of the above, and 35%+ owned entities.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: {
          type: 'string',
          description: 'UUID of the organization',
        },
        full_name: {
          type: 'string',
          description: 'Full legal name of the person or entity',
        },
        relationship_type: {
          type: 'string',
          enum: [
            'founder',
            'substantial_contributor',
            'foundation_manager',
            'twenty_pct_owner',
            'family_member',
            'thirty_five_pct_owned_entity',
            'government_official',
          ],
          description: 'Their relationship to the foundation under IRC §4946',
        },
        title_or_role: {
          type: 'string',
          description:
            'Job title or role (e.g., "Executive Director", "Trustee")',
        },
        ein: { type: 'string', description: 'EIN for entities' },
        ssn_last4: {
          type: 'string',
          description:
            'Last 4 digits of SSN for individuals (privacy: never store full SSN)',
        },
        start_date: {
          type: 'string',
          description:
            'Date they became a disqualified person (YYYY-MM-DD, default: today)',
        },
        related_to_person_id: {
          type: 'string',
          description:
            'UUID of the disqualified person they are a family member of (for family members)',
        },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['organization_id', 'full_name', 'relationship_type'],
    },
  },
  {
    name: 'track_filing_deadline',
    description:
      'Add or update a filing deadline in the compliance calendar. Use for 990-PF, 990, 990-T, Form 4720, Form 8868, state annual reports, and state registrations. Can also mark a filing as filed or extended.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: {
          type: 'string',
          description: 'UUID of the organization',
        },
        filing_id: {
          type: 'string',
          description: 'UUID of existing filing to update (omit to create new)',
        },
        filing_type: {
          type: 'string',
          enum: [
            '990_pf',
            '990',
            '990_ez',
            '990_n',
            '990_t',
            'state_annual_report',
            'state_registration',
            'state_renewal',
            'state_990_copy',
            'form_4720',
            'form_5227',
            'form_8868',
            'other',
          ],
          description: 'Type of filing',
        },
        tax_year: {
          type: 'number',
          description: 'Tax year this filing covers',
        },
        jurisdiction: {
          type: 'string',
          description:
            'State code (e.g., "CA") or "federal" (default: federal)',
        },
        due_date: {
          type: 'string',
          description: 'Original due date (YYYY-MM-DD)',
        },
        extended_due_date: {
          type: 'string',
          description: 'Extended due date if extension filed (YYYY-MM-DD)',
        },
        status: {
          type: 'string',
          enum: [
            'pending',
            'in_progress',
            'filed',
            'filed_late',
            'extended',
            'overdue',
            'not_required',
          ],
          description: 'Current status',
        },
        filed_date: {
          type: 'string',
          description: 'Date actually filed (YYYY-MM-DD)',
        },
        confirmation_number: {
          type: 'string',
          description: 'IRS or state confirmation number',
        },
        description: {
          type: 'string',
          description: 'Description of the filing',
        },
      },
      required: ['organization_id'],
    },
  },
  {
    name: 'log_expenditure_responsibility',
    description:
      'Create or update an §4945 expenditure responsibility tracking record for a grant to a non-public-charity grantee. Tracks the ER agreement, required progress reports, and terminal report.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        grant_id: { type: 'string', description: 'UUID of the grants record' },
        er_record_id: {
          type: 'string',
          description: 'UUID of existing ER record to update (omit to create)',
        },
        grantee_is_public_charity: {
          type: 'boolean',
          description:
            'Is the grantee a public charity? (if true, ER agreement not required)',
        },
        grantee_ein: { type: 'string', description: "Grantee's EIN" },
        grantee_501c3_verified: {
          type: 'boolean',
          description: '501(c)(3) status verified',
        },
        er_agreement_signed_date: {
          type: 'string',
          description: 'Date ER agreement was signed (YYYY-MM-DD)',
        },
        er_reports_required_count: {
          type: 'number',
          description: 'Total number of progress reports required',
        },
        er_reports_received_count: {
          type: 'number',
          description: 'Number of progress reports received so far',
        },
        terminal_report_received: {
          type: 'boolean',
          description: 'Whether the terminal report has been received',
        },
        terminal_report_date: {
          type: 'string',
          description: 'Date terminal report received (YYYY-MM-DD)',
        },
        er_status: {
          type: 'string',
          enum: ['pending', 'compliant', 'deficient', 'waived'],
          description: 'Overall ER compliance status',
        },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'assess_qualifying_distribution',
    description:
      'Record a qualifying distribution for §4942 payout tracking. Classifies the payment (grants, program expenses, admin expenses, set-asides) and records the qualifying amount.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        tax_year: {
          type: 'number',
          description: 'Tax year this distribution applies to',
        },
        category: {
          type: 'string',
          enum: [
            'grants_paid',
            'grants_paid_er',
            'program_expenses',
            'admin_expenses',
            'set_aside',
            'program_related_investment',
            'operating_foundation_expenditure',
          ],
          description: 'Distribution category for 990-PF Part XII',
        },
        description: {
          type: 'string',
          description: 'Description of the distribution',
        },
        gross_amount: {
          type: 'number',
          description: 'Total gross amount paid',
        },
        qualifying_amount: {
          type: 'number',
          description:
            'Amount that qualifies for §4942 purposes (may differ from gross for admin expenses)',
        },
        distribution_date: {
          type: 'string',
          description: 'Date of distribution (YYYY-MM-DD)',
        },
        grant_payment_id: {
          type: 'string',
          description:
            'UUID of grant_payments record (optional, links distribution to payment)',
        },
        holding_id: {
          type: 'string',
          description: 'UUID of holding (optional)',
        },
        approved_by_board: {
          type: 'boolean',
          description:
            'Whether board approved this distribution (required for set-asides)',
        },
        board_approval_date: {
          type: 'string',
          description: 'Date of board approval (YYYY-MM-DD)',
        },
      },
      required: [
        'portfolio_id',
        'tax_year',
        'category',
        'description',
        'gross_amount',
        'qualifying_amount',
        'distribution_date',
      ],
    },
  },
  {
    name: 'get_990pf_export_data',
    description:
      'Get structured 990-PF data organized by Part for a given tax year. Returns Part I (revenue/expenses), Part II (balance sheet), Part XI (distributable amount), and Part XII (qualifying distributions) with line-item detail. Use when asked to prepare 990-PF data or export tax information.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'UUID of the portfolio' },
        tax_year: {
          type: 'number',
          description: 'Tax year (default: current year)',
        },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'get_state_registration_status',
    description:
      'Get state charitable registration status for an organization. Returns registration details for all states or a specific state, including expiration dates and annual report requirements.',
    input_schema: {
      type: 'object',
      properties: {
        organization_id: {
          type: 'string',
          description: 'UUID of the organization',
        },
        state_code: {
          type: 'string',
          description:
            'Two-letter state code to filter to a specific state (optional)',
        },
        status_filter: {
          type: 'string',
          enum: [
            'registered',
            'renewal_pending',
            'renewal_overdue',
            'exempt',
            'not_registered',
            'lapsed',
            'rejected',
          ],
          description: 'Filter by registration status (optional)',
        },
      },
      required: ['organization_id'],
    },
  },
];
