import type { ToolDefinition } from '@/lib/ai/types';

export const GRANT_TOOLS: ToolDefinition[] = [
  // ==================== GRANT MANAGEMENT MODULE ====================
  {
    name: 'start_due_diligence',
    description:
      'Start a due diligence workflow for a grantee. Creates checklist tasks for 501(c)(3) verification, financial review, mission alignment, and capacity evaluation.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: {
          type: 'string',
          description: 'Grant holding to start due diligence for',
        },
        template_id: {
          type: 'string',
          description: 'Optional: specific workflow template ID',
        },
        due_date: {
          type: 'string',
          description: 'Target completion date (ISO format)',
        },
        assigned_to: {
          type: 'string',
          description: 'Optional: user ID to assign tasks to',
        },
        priority_items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: specific checklist items to prioritize',
        },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'get_workflow_status',
    description:
      'Get the current status of workflows for a grant, including all tasks and their completion status.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'Grant holding ID' },
        workflow_id: {
          type: 'string',
          description: 'Optional: specific workflow ID',
        },
        include_completed: {
          type: 'boolean',
          description: 'Include completed workflows (default: false)',
        },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'complete_workflow_task',
    description: 'Mark a workflow task as completed with an outcome.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to complete' },
        outcome: {
          type: 'string',
          enum: ['pass', 'fail', 'conditional', 'n/a'],
          description: 'Task outcome',
        },
        notes: { type: 'string', description: 'Notes about the completion' },
      },
      required: ['task_id', 'outcome'],
    },
  },
  {
    name: 'track_milestone',
    description: 'Update a grant milestone status or add a new milestone.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'Grant holding ID' },
        milestone_id: {
          type: 'string',
          description: 'Optional: existing milestone to update',
        },
        name: {
          type: 'string',
          description: 'Milestone name (for new milestones)',
        },
        description: { type: 'string', description: 'Milestone description' },
        due_date: { type: 'string', description: 'Due date (ISO format)' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'cancelled'],
          description:
            'Stored milestone workflow status. Overdue is computed from due_date and cannot be stored directly.',
        },
        notes: { type: 'string', description: 'Progress notes' },
      },
      required: ['holding_id'],
    },
  },
  {
    name: 'schedule_reminder',
    description: 'Schedule a reminder for a grant-related deadline.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'Portfolio ID' },
        holding_id: {
          type: 'string',
          description: 'Optional: related grant holding',
        },
        title: { type: 'string', description: 'Reminder title' },
        description: { type: 'string', description: 'Reminder details' },
        due_date: { type: 'string', description: 'Deadline date (ISO format)' },
        remind_days_before: {
          type: 'array',
          items: { type: 'number' },
          description:
            'Days before due date to send reminders (e.g., [7, 3, 1])',
        },
        reminder_type: {
          type: 'string',
          enum: [
            'report_due',
            'milestone_due',
            'payment_due',
            'renewal',
            'follow_up',
            'site_visit',
            'custom',
          ],
          description: 'Type of reminder',
        },
      },
      required: ['portfolio_id', 'title', 'due_date'],
    },
  },
  {
    name: 'get_upcoming_deadlines',
    description:
      'Get all upcoming deadlines for grants in a portfolio including reports, milestones, payments, and workflow tasks.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'Portfolio ID' },
        days_ahead: {
          type: 'number',
          description: 'Days to look ahead (default: 30)',
        },
        include_types: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filter by deadline types: reports, milestones, payments, renewals',
        },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'log_grant_communication',
    description: 'Log a communication with a grantee.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'Grant holding ID' },
        direction: {
          type: 'string',
          enum: ['inbound', 'outbound'],
          description: 'Communication direction',
        },
        comm_type: {
          type: 'string',
          enum: [
            'email',
            'phone',
            'meeting',
            'site_visit',
            'letter',
            'portal_message',
            'other',
          ],
          description: 'Type of communication',
        },
        subject: { type: 'string', description: 'Subject/topic' },
        summary: { type: 'string', description: 'Summary of communication' },
        contact_name: { type: 'string', description: 'Contact person' },
        follow_up_required: {
          type: 'boolean',
          description: 'Needs follow-up?',
        },
        follow_up_date: {
          type: 'string',
          description: 'Follow-up date if required (ISO format)',
        },
      },
      required: ['holding_id', 'direction', 'comm_type', 'summary'],
    },
  },
  {
    name: 'get_grant_health',
    description:
      'Get comprehensive health assessment for one or all grants in a portfolio including payment, milestone, report, and workflow status.',
    input_schema: {
      type: 'object',
      properties: {
        portfolio_id: { type: 'string', description: 'Portfolio ID' },
        holding_id: {
          type: 'string',
          description: 'Optional: specific grant holding',
        },
        include_details: {
          type: 'boolean',
          description: 'Include detailed breakdown (default: true)',
        },
      },
      required: ['portfolio_id'],
    },
  },
  {
    name: 'record_grant_payment',
    description: 'Record or update a grant payment/disbursement.',
    input_schema: {
      type: 'object',
      properties: {
        holding_id: { type: 'string', description: 'Grant holding ID' },
        payment_id: {
          type: 'string',
          description: 'Optional: existing payment to update',
        },
        amount: { type: 'number', description: 'Payment amount' },
        scheduled_date: {
          type: 'string',
          description: 'Scheduled payment date (ISO format)',
        },
        actual_date: {
          type: 'string',
          description: 'Actual payment date when completed (ISO format)',
        },
        status: {
          type: 'string',
          enum: [
            'scheduled',
            'approved',
            'processing',
            'completed',
            'cancelled',
          ],
          description: 'Payment status',
        },
        payment_method: {
          type: 'string',
          enum: ['check', 'wire', 'ach'],
          description: 'Payment method',
        },
        notes: { type: 'string', description: 'Payment notes' },
      },
      required: ['holding_id'],
    },
  },
];
