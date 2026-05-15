import { z } from 'zod';

export const taskStatusSchema = z.enum([
  'open',
  'in_progress',
  'blocked',
  'waiting',
  'completed',
  'cancelled',
]);

export const taskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const taskTypeSchema = z.enum([
  'task',
  'approval',
  'reminder',
  'follow_up',
  'review',
  'checklist_step',
]);

export const taskSourceSchema = z.enum([
  'manual',
  'system',
  'automation',
  'ai',
  'template',
]);

const dateTimeString = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const taskEntityLinkSchema = z.object({
  entity_type: z.string().min(1).max(80),
  entity_id: z.string().uuid(),
  relationship: z.string().min(1).max(80).default('primary').optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(4000).optional().nullable(),
  status: taskStatusSchema.default('open').optional(),
  priority: taskPrioritySchema.default('normal').optional(),
  task_type: taskTypeSchema.default('task').optional(),
  source: taskSourceSchema.default('manual').optional(),
  source_key: z.string().max(240).optional().nullable(),
  portfolio_id: z.string().uuid().optional().nullable(),
  starts_at: dateTimeString.optional().nullable(),
  due_at: dateTimeString.optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).default({}).optional(),
  entity_links: z.array(taskEntityLinkSchema).max(8).default([]).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  description: z.string().max(4000).optional().nullable(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  task_type: taskTypeSchema.optional(),
  portfolio_id: z.string().uuid().optional().nullable(),
  starts_at: dateTimeString.optional().nullable(),
  due_at: dateTimeString.optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export const createTaskCommentSchema = z.object({
  body: z.string().min(1).max(4000),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskType = z.infer<typeof taskTypeSchema>;
export type TaskSource = z.infer<typeof taskSourceSchema>;
