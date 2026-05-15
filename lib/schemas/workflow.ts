import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTimeString = z.string().datetime({ offset: true }).or(dateString);

export const startWorkflowSchema = z.object({
  template_id: z.string().uuid(),
  portfolio_id: z.string().uuid().optional().nullable(),
  holding_id: z.string().uuid().optional().nullable(),
  grant_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(240).optional().nullable(),
  due_date: dateString.optional().nullable(),
  due_at: dateTimeString.optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  metadata: z.record(z.unknown()).default({}).optional(),
}).refine(value => value.holding_id || value.grant_id || value.portfolio_id, {
  message: 'Provide holding_id, grant_id, or portfolio_id',
  path: ['portfolio_id'],
});

export const updateWorkflowTaskSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped', 'blocked']).optional(),
  outcome: z.enum(['pass', 'fail', 'conditional', 'n/a']).optional().nullable(),
  outcome_notes: z.string().max(4000).optional().nullable(),
});

export type StartWorkflowInput = z.infer<typeof startWorkflowSchema>;
export type UpdateWorkflowTaskInput = z.infer<typeof updateWorkflowTaskSchema>;
