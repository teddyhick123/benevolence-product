import { z } from 'zod';

/**
 * Schema for creating a new holding
 */
export const createHoldingSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  status: z.enum(['Active', 'Exited', 'Pipeline']).optional(),
  asset_class: z.string().max(100).optional(),
  custodian: z.string().max(100).optional(),
  valuation_method: z.string().max(100).optional(),
  sector: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  investee_id: z.string().uuid().optional().nullable(),
  funds_allocated: z.number().positive('Funds allocated must be positive').optional().nullable(),
  nav: z.number().positive('NAV must be positive').optional().nullable(), // Legacy support
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(), // Legacy support
});

/**
 * Schema for updating an existing holding
 */
export const updateHoldingSchema = createHoldingSchema.partial();

/**
 * Schema for creating a portfolio widget
 */
export const createWidgetSchema = z.object({
  type: z.string().min(1, 'Widget type is required'),
  title: z.string().max(255).optional().nullable(),
  config: z.record(z.any()).optional().nullable(),
});

/**
 * Schema for updating a widget
 */
export const updateWidgetSchema = z.object({
  type: z.string().min(1).max(50).optional(),
  title: z.string().max(255).optional().nullable(),
  config: z.record(z.any()).optional().nullable(),
  position: z.number().int().min(0).optional().nullable(),
});

/**
 * Schema for creating a KPI definition
 */
export const createKpiSchema = z.object({
  metric_code: z.string().min(1, 'Metric code is required').max(50),
  display_name: z.string().min(1, 'Display name is required').max(255),
  target_value: z.number().optional().nullable(),
  target_date: z.string().datetime().optional().nullable(),
  order_index: z.number().int().optional().nullable(),
  calculation: z.string().max(1000).optional().nullable(),
  unit: z.string().max(50).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

/**
 * Schema for updating a KPI definition
 */
export const updateKpiSchema = createKpiSchema.partial().extend({
  metric_code: z.string().max(50).optional(), // Make optional for updates
});

/**
 * Common query parameter schemas
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
