import { z } from 'zod';

/**
 * Schema for updating a recommendation
 */
export const updateRecommendationSchema = z.object({
  organization_name: z.string().max(255).optional(),
  website: z.string().url('Invalid URL').optional().nullable(),
  sector: z.string().max(100).optional().nullable(),
  ein: z.string().max(20).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  impact_focus: z.string().max(500).optional().nullable(),
  accreditation: z.string().max(255).optional().nullable(),
  contact_info: z.string().max(500).optional().nullable(),
  min_investment: z.number().nonnegative('Min investment must be non-negative').optional().nullable(),
  max_investment: z.number().nonnegative('Max investment must be non-negative').optional().nullable(),
  order_index: z.number().int('Order index must be an integer').optional().nullable(),
});
