import { z } from 'zod';

/**
 * Grant type enumeration
 */
export const grantTypeSchema = z.enum([
  'general_operating',
  'project',
  'capacity_building',
  'multi_year',
  'seed',
  'planning',
]);

export type GrantType = z.infer<typeof grantTypeSchema>;

/**
 * Human-readable labels for grant types
 */
export const GRANT_TYPE_LABELS: Record<GrantType, string> = {
  general_operating: 'General Operating',
  project: 'Project Grant',
  capacity_building: 'Capacity Building',
  multi_year: 'Multi-Year',
  seed: 'Seed Funding',
  planning: 'Planning Grant',
};

/**
 * Milestone status enumeration
 */
export const milestoneStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
]);

export type MilestoneStatus = z.infer<typeof milestoneStatusSchema>;

export const milestoneDisplayStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'overdue',
  'cancelled',
]);

export type MilestoneDisplayStatus = z.infer<typeof milestoneDisplayStatusSchema>;

/**
 * Human-readable labels for milestone statuses
 */
export const MILESTONE_STATUS_LABELS: Record<MilestoneDisplayStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

/**
 * Schema for creating grant details
 */
export const createGrantDetailsSchema = z.object({
  holding_id: z.string().uuid('Invalid holding ID'),
  grant_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  grant_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  grant_type: grantTypeSchema.optional().nullable(),
  renewal_eligible: z.boolean().default(false),
  renewal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  deliverables: z.string().max(5000).optional().nullable(),
  reporting_frequency: z.string().max(50).optional().nullable(),
  next_report_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
});

/**
 * Schema for updating grant details
 */
export const updateGrantDetailsSchema = createGrantDetailsSchema.partial().omit({ holding_id: true });

/**
 * Schema for creating a grant milestone
 */
export const createMilestoneSchema = z.object({
  grant_id: z.string().uuid('Invalid grant ID'),
  milestone_name: z.string().min(1).max(500, 'Milestone name too long'),
  description: z.string().max(2000).optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  completed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  status: milestoneStatusSchema.default('pending'),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Schema for updating a milestone
 */
export const updateMilestoneSchema = createMilestoneSchema.partial().omit({ grant_id: true });

/**
 * Schema for creating a grant report
 */
export const createGrantReportSchema = z.object({
  grant_id: z.string().uuid('Invalid grant ID'),
  report_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  report_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  submitted_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  report_type: z.string().max(100).optional().nullable(),
  document_url: z.string().url('Invalid URL').max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Schema for updating a grant report
 */
export const updateGrantReportSchema = createGrantReportSchema.partial().omit({ grant_id: true });

/**
 * Type exports for database records
 */

export type GrantDetails = {
  id: string;
  holding_id: string;
  grant_period_start?: string | null;
  grant_period_end?: string | null;
  grant_type?: GrantType | null;
  renewal_eligible: boolean;
  renewal_date?: string | null;
  deliverables?: string | null;
  reporting_frequency?: string | null;
  next_report_due?: string | null;
  created_at: string;
  updated_at: string;
};

export type GrantMilestone = {
  id: string;
  grant_id: string;
  milestone_name: string;
  description?: string | null;
  due_date?: string | null;
  completed_date?: string | null;
  status: MilestoneStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type GrantReport = {
  id: string;
  grant_id: string;
  report_period_start?: string | null;
  report_period_end?: string | null;
  due_date?: string | null;
  submitted_date?: string | null;
  report_type?: string | null;
  document_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type GrantSummary = {
  id: string;
  portfolio_id: string;
  name: string;
  asset_type: string;
  asset_subtype?: string | null;
  funds_allocated?: number | null;
  status?: string | null;
  sector?: string | null;
  country?: string | null;
  grant_id: string;
  grant_period_start?: string | null;
  grant_period_end?: string | null;
  grant_type?: GrantType | null;
  next_report_due?: string | null;
  renewal_eligible: boolean;
  renewal_date?: string | null;
  reporting_frequency?: string | null;
  deliverables?: string | null;
  total_milestones: number;
  milestones_completed: number;
  milestones_pending: number;
  milestones_overdue: number;
  total_reports: number;
  reports_submitted: number;
  reports_overdue: number;
  milestone_completion_pct?: number | null;
  grant_period_status: 'ongoing' | 'ended' | 'future' | 'active';
};

/**
 * Helper function to format grant period
 */
export function formatGrantPeriod(start?: string | null, end?: string | null): string {
  if (!start && !end) return 'Ongoing';

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: 'numeric',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  if (start && end) {
    return `${formatDate(start)} - ${formatDate(end)}`;
  } else if (start) {
    return `From ${formatDate(start)}`;
  } else {
    return `Until ${formatDate(end!)}`;
  }
}

/**
 * Helper to get milestone status color class
 */
export function getMilestoneStatusColorClass(status: MilestoneDisplayStatus): string {
  switch (status) {
    case 'completed':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'in_progress':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'overdue':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'cancelled':
      return 'text-neutral-500 bg-neutral-50 border-neutral-200';
    case 'pending':
    default:
      return 'text-amber-600 bg-amber-50 border-amber-200';
  }
}

/**
 * Helper to get grant period status color class
 */
export function getGrantPeriodStatusColorClass(status: string): string {
  switch (status) {
    case 'active':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'ended':
      return 'text-neutral-500 bg-neutral-50 border-neutral-200';
    case 'future':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'ongoing':
    default:
      return 'text-neutral-600 bg-neutral-50 border-neutral-200';
  }
}

/**
 * Helper to check if a report is overdue
 */
export function isReportOverdue(dueDate?: string | null, submittedDate?: string | null): boolean {
  if (!dueDate || submittedDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

/**
 * Helper to calculate days until/since due date
 */
export function daysUntilDue(dueDate?: string | null): number | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Portfolio-level grant summary type (from v_portfolio_grant_summary view)
 */
export type PortfolioGrantSummary = {
  portfolio_id: string;
  total_grants: number;
  active_grants: number;
  ended_grants: number;
  future_grants: number;
  foundation_grant_count: number;
  daf_grant_count: number;
  general_operating_count: number;
  project_count: number;
  capacity_building_count: number;
  multi_year_count: number;
  total_funds_allocated: number;
  avg_grant_size: number;
  renewal_eligible_count: number;
  next_renewal_date?: string | null;
  total_milestones: number;
  total_milestones_completed: number;
  total_milestones_pending: number;
  total_milestones_overdue: number;
  total_reports: number;
  total_reports_submitted: number;
  total_reports_overdue: number;
  avg_milestone_completion_pct?: number | null;
  next_report_due?: string | null;
};

/**
 * Query parameters for grants endpoint
 */
export const grantQuerySchema = z.object({
  portfolio_id: z.string().uuid().optional(),
  asset_type: z.enum(['foundation_grant', 'daf_grant']).optional(),
  grant_type: grantTypeSchema.optional(),
  grant_period_status: z.enum(['ongoing', 'ended', 'future', 'active']).optional(),
  renewal_eligible: z.coerce.boolean().optional(),
  sort_by: z.enum(['name', 'funds_allocated', 'grant_period_start', 'next_report_due']).default('name'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
