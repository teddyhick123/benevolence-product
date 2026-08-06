import { z } from 'zod';

/**
 * Centralized Recommendation type
 * Used across all recommendation-related components
 */
export type Recommendation = {
  id: string;
  organization_name: string;
  website: string | null;
  sector: string | null;
  ein: string | null;
  location: string | null;
  country: string | null;
  description: string | null;
  impact_focus: string[] | null;
  accreditation: Record<string, unknown> | null;
  contact_info: Record<string, unknown> | null;
  min_investment: number | null;
  max_investment: number | null;
  recommended_at: string;
  portfolio_id: string;
  is_favorited?: boolean;
  favorite_count?: number;
  interaction_status?: string;
  order_index?: number | null;
};

/**
 * Schema for updating a recommendation
 */
const recommendationFields = {
  organization_name: z.string().max(255).optional(),
  website: z.string().url('Invalid URL').optional().nullable(),
  sector: z.string().max(100).optional().nullable(),
  ein: z.string().max(20).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  impact_focus: z.array(z.string().trim().min(1).max(100)).max(50).optional().nullable(),
  accreditation: z.record(z.string(), z.unknown()).optional().nullable(),
  contact_info: z.record(z.string(), z.unknown()).optional().nullable(),
  min_investment: z.number().nonnegative('Min investment must be non-negative').optional().nullable(),
  max_investment: z.number().nonnegative('Max investment must be non-negative').optional().nullable(),
  order_index: z.number().int('Order index must be an integer').optional().nullable(),
};

export const updateRecommendationSchema = z.object(recommendationFields);

export const createRecommendationSchema = z.object({
  ...recommendationFields,
  organization_name: z.string().trim().min(1).max(255),
});
