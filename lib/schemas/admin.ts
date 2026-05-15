import { z } from 'zod';

/**
 * Schema for file upload ingestion request
 * Used by /api/admin/upload/ingest endpoint
 */
export const uploadIngestSchema = z.object({
  uploadId: z.string().uuid('Invalid upload ID'),
  autoApprove: z.boolean().optional().default(false),
});

/**
 * Schema for portfolio member invitation
 */
export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'member', 'viewer'], {
    errorMap: () => ({ message: 'Role must be owner, admin, member, or viewer' })
  }),
  message: z.string().max(500).optional().nullable(),
});

/**
 * Schema for creating admin portfolio
 */
export const createAdminPortfolioSchema = z.object({
  name: z.string().min(1, 'Portfolio name required').max(255),
  base_currency: z.string().length(3, 'Currency code must be 3 chars').toUpperCase().default('USD'),
  owner_user_id: z.string().uuid().optional(),
  owner_email: z.string().email().optional(),
});

/**
 * Schema for portfolio settings
 */
export const portfolioSettingsSchema = z.object({
  name: z.string().min(1, 'Portfolio name is required').max(255, 'Name too long').optional(),
  show_map: z.boolean().optional(),
  widgets: z.array(z.string()).optional(),
});

/**
 * Schema for adding portfolio member
 */
export const addPortfolioMemberSchema = z.object({
  user_id: z.string().uuid().min(1, 'User ID required'),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

/**
 * Schema for updating member role
 */
export const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

/**
 * Schema for admin KPI update
 */
export const adminUpdateKpiSchema = z.object({
  slug: z.string().min(1).max(50).optional(),
  name: z.string().max(255).optional(),
  target_value: z.number().optional().nullable(),
  display_order: z.number().int().optional(),
});
